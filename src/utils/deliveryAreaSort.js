// src/utils/deliveryAreaSort.js
//
// סדר ההזמנות בתור הליקוט: **לפי אזור גאוגרפי, ולא לפי סדר הקליטה באתר.**
// כל רמלה ברצף, כל לוד ברצף — כדי שהמלקט יארוז והשליח ייסע לפי אזורים ולא
// יקפוץ בין ערים. עד שזה נכתב הרשימה מוינה לפי מספר ההזמנה בלבד, כך שהערים
// התערבבו זו בזו לגמרי.
//
// שלושה מפתחות, בסדר הזה:
//   1. מחוז (region_name של העיר) — כדי שערים שכנות ייצאו סמוכות זו לזו
//   2. שם העיר — הקיבוץ עצמו
//   3. מספר ההזמנה, מספרית
//
// נקודה אחת שהיא כל הסיבה שהקובץ הזה קיים בנפרד ולא כ-sort בתוך הרכיב:
// **המחוז נלקח לפי עיר, ולא לפי הזמנה.** מסמכי הערים נשמרו על ההזמנות בזמנים
// שונים ומגיעים מרשומות data.gov.il שונות, ולכן שתי הזמנות באותה עיר יכולות
// להיות אחת עם region_name ואחת בלי. מיון ישיר לפי שדה ההזמנה היה מפצל את
// העיר לשתי קבוצות נפרדות ברשימה — בדיוק מה שהמיון הזה בא למנוע. לכן כל עיר
// מקבלת מחוז מייצג אחד (הראשון הלא-ריק שנמצא בה), וכל ההזמנות שלה נשענות עליו.

// שם עיר מנורמל לצורך קיבוץ בלבד — התצוגה לא נוגעת בו. ה-trim הכרחי: שמות
// ערים נשמרים עם רווח נגרר במקומות מסוימים במערכת (ראו הערת ה-trim בדוח
// הלקוחות בבקאנד), ובלעדיו "רמלה " ו"רמלה" היו שתי קבוצות.
const cityKeyOf = (order) =>
  String(order?.user_info?.address?.city?.city_name_he || "").trim();

const regionOf = (order) =>
  String(order?.user_info?.address?.city?.region_name || "").trim();

const invoiceOf = (order) => {
  const raw = order?.invoice;
  // הבדיקה המפורשת הכרחית: Number(null) הוא 0 ו-Number("") הוא 0, ו-0 הוא מספר
  // סופי לכל דבר — כלומר הזמנה בלי מספר הייתה מזנקת לראש הרשימה במקום לרדת לסופה.
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

// ריק תמיד אחרון, בשני הכיוונים: מיון לפי עיר שמתחיל בכל ההזמנות שאין להן עיר
// הוא רשימה שנפתחת ברעש. מחזיר null כשאין הכרעה, כדי שהמפתח הבא ייבדק.
const blankLast = (a, b) => {
  if (!a && !b) return null;
  if (!a) return 1;
  if (!b) return -1;
  return null;
};

/**
 * מפה: שם עיר → המחוז המייצג שלה. נבנית פעם אחת לכל רשימה, ולא לכל השוואה.
 */
const buildCityRegions = (orders) => {
  const regions = new Map();
  for (const order of orders || []) {
    const city = cityKeyOf(order);
    if (!city || regions.get(city)) continue; // הערך הלא-ריק הראשון מנצח
    const region = regionOf(order);
    if (region) regions.set(city, region);
  }
  return regions;
};

/**
 * מיון הזמנות לפי אזור משלוח. אינו משנה את המערך שהתקבל.
 */
export const sortOrdersByDeliveryArea = (orders) => {
  const list = [...(orders || [])];
  const cityRegions = buildCityRegions(list);

  return list.sort((a, b) => {
    const cityA = cityKeyOf(a);
    const cityB = cityKeyOf(b);

    const regionA = cityA ? cityRegions.get(cityA) || "" : "";
    const regionB = cityB ? cityRegions.get(cityB) || "" : "";

    const regionBlank = blankLast(regionA, regionB);
    if (regionBlank !== null) return regionBlank;
    if (regionA !== regionB) return regionA.localeCompare(regionB, "he");

    const cityBlank = blankLast(cityA, cityB);
    if (cityBlank !== null) return cityBlank;
    if (cityA !== cityB) return cityA.localeCompare(cityB, "he");

    return compareByInvoice(a, b);
  });
};

/**
 * מיון לפי מספר הזמנה — מספרי, לא לקסיקוגרפי. ההשוואה הישנה הייתה
 * String(a).localeCompare(String(b)), שמציבה הזמנה 10 לפני הזמנה 9.
 * הזמנה בלי מספר תקין יורדת לסוף ולא מפילה את המיון.
 */
export const compareByInvoice = (a, b) => {
  const numA = invoiceOf(a);
  const numB = invoiceOf(b);
  if (numA === null && numB === null) return 0;
  if (numA === null) return 1;
  if (numB === null) return -1;
  return numA - numB;
};

/**
 * האם השורה פותחת קבוצת עיר חדשה — משמש לקו מפריד דק בטבלה, כדי שהרצף
 * הגאוגרפי יהיה גם נראה לעין ולא רק קיים בסדר.
 */
export const isAreaStart = (orders, index) => {
  if (index === 0) return true;
  return cityKeyOf(orders[index]) !== cityKeyOf(orders[index - 1]);
};
