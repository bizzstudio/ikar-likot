// src/utils/weightPricing.js
//
// ★ מראה מכוונת של ikar-backend/lib/weightPricing.js. שם מקור האמת; כאן העותק
//   שאפליקציית הליקוט צריכה כדי לקבל מהמלקט את המשקל שנשקל בפועל ולהחליט אם
//   סטייה היא חוסר. אין לערוך צד אחד בלבד — script/verifyWeightPricing.js
//   בשרת משווה את גוף הקוד ונכשל על פער.
//
// ★ מקור האמת לכללי המוצר השקיל. שתי מראות מכוונות:
//     ikar-store/src/utils/weightPricing.js   — הדפדפן, בחירת המשקל ותמחור התצוגה
//     ikar-likut/src/utils/weightPricing.js   — אפליקציית הליקוט, הזנת המשקל שנשקל
//   שלושת הקבצים חייבים להישאר זהים בלוגיקה; ההבדל היחיד המותר הוא תחביר המודול.
//   script/verifyWeightPricing.js אוכף את זה על הקוד עצמו, לא רק על הקבועים —
//   אם הם ייפרדו, הלקוח יראה מחיר אחד וישולם אחר, או שהמלקט לא יוכל לאשר משקל
//   שהחנות הרשתה להזמין.
//
// **מוצר שקיל** = מוצר שנמכר לפי משקל. `soldByWeight: true` על המוצר משנה שלוש
// משמעויות בבת אחת, ואי אפשר לאמץ אחת בלי השתיים האחרות:
//
//   1. `prices.price` הוא **מחיר לק"ג**, לא מחיר ליחידה. אין שדה מחיר נפרד:
//      מחיר לק"ג הוא המחיר היחיד שיש למוצר כזה, וכל מי שמכפיל מחיר בכמות
//      (מנוע המבצעים, סיכום העגלה, החשבונית) מקבל את התוצאה הנכונה בלי שינוי.
//   2. `quantity` בשורת העגלה הוא **מספר ק"ג** — 1.5, לא 2 יחידות. זה המקום
//      היחיד במערכת שבו כמות אינה מספר שלם.
//   3. הכמות חייבת להיות כפולה של `weightStep` בתוך [`minWeight`, `maxWeight`].
//      הכלל נאכף פעמיים: החנות מציעה רק ערכים חוקיים, והשרת דוחה הזמנה שבה
//      נשלח ערך אחר (addOrder) — לקוח יכול לערוך את הבקשה, ומשקל שרירותי
//      פירושו שקילה שאי אפשר לבצע במחסן.
//
// כל חשבון המשקל נעשה ב**גרמים שלמים**, לא בק"ג עשרוניים: 0.1+0.2 בנקודה צפה
// אינו 0.3, ובדיקת "כפולה של הקפיצה" על ק"ג הייתה נכשלת על ערכים תקינים לגמרי.
// הרזולוציה היא גרם אחד, ולכן toGrams הוא גם הנרמול היחיד של קלט מהמשתמש.

export const GRAMS_PER_KG = 1000;

// ברירות המחדל חלות כשהמנהל סימן "מוצר שקיל" ולא מילא כלום — מצב שחייב לתת
// מוצר שאפשר למכור, ולא טווח ריק.
export const DEFAULT_STEP_KG = 0.25;
export const DEFAULT_MAX_KG = 50;
// קפיצה קטנה מ-10 גרם אינה ניתנת לשקילה במאזני החנות ומייצרת רשימת ערכים
// אינסופית בפועל; ערך כזה במסד מתפרש כ"לא הוגדר".
export const MIN_STEP_G = 10;

export const UNIT_LABELS = {
  kg: { he: 'ק"ג', en: "kg", th: "กก." },
  gram: { he: "גרם", en: "g", th: "ก." },
};

/** ק"ג → גרמים שלמים. כל קלט לא-מספרי הוא 0. */
export const toGrams = (kg) => {
  const n = Number(kg);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * GRAMS_PER_KG);
};

/** גרמים → ק"ג. */
export const fromGrams = (g) => (Math.round(Number(g)) || 0) / GRAMS_PER_KG;

/**
 * האם הפריט נמכר לפי משקל. מקבל מוצר או שורת עגלה — הדגל מצולם על השורה
 * בזמן ההזמנה, בדיוק כמו departmentNumber, כדי שהזמנה ישנה תמשיך להיקרא נכון
 * גם אחרי שהמוצר יפסיק להיות שקיל.
 */
export const isWeighted = (item) => item?.soldByWeight === true;

/**
 * הטווח החוקי של הפריט בגרמים — תמיד תקין, גם על מסמך חסר או פגום.
 * המינימום מעוגל **למעלה** לכפולה של הקפיצה והמקסימום **למטה**, כך שכל ערך
 * בטווח הוא כפולה של הקפיצה ושני הקצוות עצמם חוקיים. בלי זה "מינימום 0.4
 * בקפיצות של 0.25" היה טווח שהערך הראשון בו אינו ניתן להזמנה.
 */
export const weightRules = (item) => {
  const rawStep = toGrams(item?.weightStep);
  const stepG = rawStep >= MIN_STEP_G ? rawStep : toGrams(DEFAULT_STEP_KG);

  const rawMin = toGrams(item?.minWeight);
  const minG = Math.ceil((rawMin >= stepG ? rawMin : stepG) / stepG) * stepG;

  // שלושה מצבים למקסימום, ואסור לכרוך אותם יחד:
  //   • לא הוגדר (0/חסר/פגום) → תקרת ברירת המחדל.
  //   • הוגדר וגדול מהמינימום → הערך עצמו, מעוגל למטה לכפולה של הקפיצה.
  //   • הוגדר אך **קטן מהמינימום** → הגדרה סותרת (טעות הקלדה בכרטיס המוצר).
  //     כאן דווקא לא נופלים לברירת המחדל: "מקסימום 1, מינימום 2" היה הופך
  //     בשקט למוצר שאפשר להזמין ממנו 50 ק"ג — בדיוק ההפך ממה שנכתב. במקום זה
  //     הטווח מצטמצם לערך אחד חוקי, מה שנראה שבור על המסך ומביא לתיקון,
  //     ולעולם אינו מתיר יותר ממה שהמנהל התכוון.
  const rawMax = toGrams(item?.maxWeight);
  const maxG =
    rawMax >= minG
      ? Math.floor(rawMax / stepG) * stepG
      : rawMax > 0
        ? minG
        : Math.max(minG, Math.floor(toGrams(DEFAULT_MAX_KG) / stepG) * stepG);

  return { stepG, minG, maxG };
};

/** אותו טווח בק"ג — לתצוגה ולשדות טופס. */
export const weightRulesKg = (item) => {
  const { stepG, minG, maxG } = weightRules(item);
  return { step: fromGrams(stepG), min: fromGrams(minG), max: fromGrams(maxG) };
};

/**
 * מצמיד משקל לערך החוקי הקרוב ביותר. משמש את החנות (הקלדה חופשית בשדה) ואת
 * הליקוט (משקל שנשקל בפועל) — **לא** את השרת: שם ערך לא חוקי נדחה ולא מתוקן
 * בשקט, אחרת הלקוח מחויב על משקל שלא ביקש.
 */
export const snapWeightGrams = (item, kg) => {
  const { stepG, minG, maxG } = weightRules(item);
  const g = toGrams(kg);
  if (g <= 0) return minG;
  const snapped = Math.round(g / stepG) * stepG;
  return Math.min(maxG, Math.max(minG, snapped));
};

/** אותו דבר, בק"ג. */
export const snapWeight = (item, kg) => fromGrams(snapWeightGrams(item, kg));

/**
 * הערך החוקי הגדול ביותר שאינו עולה על `kg` — הצמדה **כלפי מטה**.
 * מחזיר null כשאין ערך כזה (התקרה נמוכה מהמשקל המזערי).
 *
 * נחוץ בכל מקום שבו תקרה חיצונית חותכת את המשקל, ובראשה הגבלת הרכישה
 * (purchaseLimit): תקרה של 2 ק"ג על מוצר בקפיצות 0.3 אינה ערך חוקי, ו-
 * snapWeight היה מעגל אותה ל-2.1 — כלומר *מעל* התקרה, או לערך שהשרת דוחה
 * בשליחה. עיגול למטה הוא הכיוון היחיד שבטוח מול תקרה.
 */
export const snapWeightDownGrams = (item, kg) => {
  const { stepG, minG, maxG } = weightRules(item);
  const g = Math.min(toGrams(kg), maxG);
  if (g < minG) return null;
  const snapped = Math.floor(g / stepG) * stepG;
  return snapped < minG ? null : snapped;
};

/** אותו דבר, בק"ג. null = אין ערך חוקי שאינו עולה על התקרה. */
export const snapWeightDown = (item, kg) => {
  const g = snapWeightDownGrams(item, kg);
  return g === null ? null : fromGrams(g);
};

/**
 * האם המשקל חוקי בדיוק — כפולה של הקפיצה בתוך הטווח. זו הבדיקה שהשרת מריץ.
 * הסובלנות היחידה היא חצי גרם, מ-toGrams, כדי ש-1.5 שעבר JSON.parse ייחשב חוקי.
 */
export const isValidWeight = (item, kg) => {
  const n = Number(kg);
  if (!Number.isFinite(n) || n <= 0) return false;
  const { stepG, minG, maxG } = weightRules(item);
  const g = toGrams(n);
  return g >= minG && g <= maxG && g % stepG === 0;
};

/** המשקל הראשוני שמוצע ללקוח — המינימום. */
export const initialWeight = (item) => fromGrams(weightRules(item).minG);

/** קפיצה אחת למעלה, חסום במקסימום. */
export const nextWeight = (item, kg) => {
  const { stepG, maxG } = weightRules(item);
  return fromGrams(Math.min(maxG, snapWeightGrams(item, kg) + stepG));
};

/**
 * קפיצה אחת למטה. מחזיר null כשהתוצאה מתחת למינימום — כלומר "אין ערך חוקי
 * קטן יותר", והקורא מסיר את הפריט מהעגלה במקום להיתקע על המינימום.
 */
export const prevWeight = (item, kg) => {
  const { stepG, minG } = weightRules(item);
  const g = snapWeightGrams(item, kg) - stepG;
  return g < minG ? null : fromGrams(g);
};

/** מספר ק"ג ללא אפסים מיותרים ("1.5", "0.75", "2"). */
export const weightNumber = (kg) => String(Number(fromGrams(toGrams(kg)).toFixed(3)));

/**
 * ניסוח משקל לתצוגה. מתחת לק"ג מוצג בגרמים ("750 גרם") — כך המלקט והלקוח
 * קוראים את אותו מספר שכתוב על המאזניים.
 */
export const formatWeight = (kg, lang = "he") => {
  const g = toGrams(kg);
  const unit = (name) => UNIT_LABELS[name][lang] || UNIT_LABELS[name].he;
  if (g <= 0) return `0 ${unit("kg")}`;
  if (g < GRAMS_PER_KG) return `${g} ${unit("gram")}`;
  return `${weightNumber(fromGrams(g))} ${unit("kg")}`;
};

/**
 * האם השורה **סופקה** — ולכן אינה חוסר: היא לא נרשמת בדיווח החוסרים, לא נשלחת
 * ללקוח כ"פריט שלא היה במלאי", ולא מחזיקה את המלקט על הפריט.
 *
 * במוצר רגיל זה בדיוק `picked >= ordered`, כפי שהיה תמיד.
 *
 * במוצר שקיל יש **סף סטייה בגובה קפיצת המשקל של המוצר**, וזה עיקר העניין:
 * לקוח שהזמין 1.5 ק"ג יקבל 1.42 ק"ג, כי ככה נראית שקילה. בלי הסף הזה כמעט כל
 * שורה שקילה בכל הזמנה הייתה נכנסת לתהליך החוסרים — הזמנה תקועה ב-
 * PendingShortages, הכרעת מנהל, ומייל ללקוח שהפריט "לא היה זמין במלאי" על 80
 * גרם. הסף הוא קפיצת המשקל דווקא, ולא מספר קסם חדש: הלקוח עצמו בחר ברזולוציה
 * הזו, וסטייה קטנה ממנה היא בתוך הדיוק שהוא ביקש.
 *
 * מה ש**לא** משתנה: החיוב. הלקוח משלם על 1.42 ק"ג, לא על 1.5 — הסף קובע רק
 * אם מדובר באירוע חוסר, לא כמה כסף עובר (ראו calcFinalAmount ב-
 * completeOrderCharge, שממשיך לחשב לפי המשקל שנשקל בפועל).
 *
 * שקילה של 0 היא תמיד חוסר מלא, גם כשהקפיצה גדולה מהמשקל שהוזמן.
 */
export const isLineFulfilled = (item, ordered, picked) => {
  const orderedG = toGrams(ordered);
  const pickedG = toGrams(picked);
  if (pickedG >= orderedG) return true;
  if (!isWeighted(item)) return false;
  if (pickedG <= 0) return false;
  return orderedG - pickedG < weightRules(item).stepG;
};

/**
 * הכמות של שורת עגלה כמחרוזת — משקל לשקיל, מספר יחידות לכל היתר. כל מסך
 * שמציג כמות (עגלה, ליקוט, מייל, דשבורד) עובר דרך כאן, אחרת "1.5" בטבלה
 * נקרא כיחידה וחצי.
 */
export const formatLineQuantity = (item, lang = "he") => {
  const qty = Number(item?.quantity) || 0;
  return isWeighted(item) ? formatWeight(qty, lang) : String(qty);
};

