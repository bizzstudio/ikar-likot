// src/utils/pickingGroups.js
//
// איחוד שורות עגלה של **אותו מוצר פיזי** לשורת ליקוט אחת.
//
// הזמנה יכולה לשאת את אותו מוצר בכמה שורות: שורה בתשלום ולצידה שורת מתנה
// (isRewardProduct — נבנית מהמוצר עצמו ולכן חולקת איתו את `_id`). למלקט אין
// שום דרך לפעול על ההבחנה הזו: מהמדף יורדות שתי יחידות של אותו מוצר, ומדף
// אחד נסרק פעם אחת. הצגת שתי שורות נפרדות אילצה אותו לעבור על אותו מוצר
// פעמיים, ובהזמנה 10068 גם הסתיימה בכך ששתי השורות סומנו כמלוקטות אחרי
// ליקוט של אחת בלבד — כלומר יחידה שלא ירדה מהמדף נספרה כאילו נלקטה.
//
// לכן: שורה אחת בתור, עם **סכום** הכמויות (1 בתשלום + 1 מתנה = 2 יח׳).
//
// שלושה כללים שמחזיקים את זה:
//
//   1. **מפתח הקבוצה הוא מזהה השורה של השורה הראשית** (השורה בתשלום), ולא
//      מפתח חדש. כל מה שנשמר בשרת ממופתח לפי שורת עגלה — likutProgress,
//      shortageHold.pickedQuantities, repickItems — ובקבוצה בת שורה אחת
//      (המצב הרגיל) המפתח זהה בדיוק למה שהיה. כלומר שום דבר קיים לא זז.
//
//   2. **מה שנלקט מתחלק בחזרה לשורות המקוריות בסגירה**, שורה בתשלום קודם
//      ומתנה אחרונה. השרת ממשיך לקבל pickedItems פר-שורת-עגלה, מחשב לפיהן
//      חיוב ודיווח חוסרים (lineKey), ולא יודע שהמסך איחד משהו. חוסר יורד
//      מהמתנה לפני שהוא יורד ממה שהלקוח שילם עליו.
//
//   3. **ווריאנטים לא מתאחדים.** שתי שורות עם אותו `_id` אך ווריאנט שונה הן
//      שני פריטים פיזיים שונים על המדף. הווריאנט מזוהה ממזהה השורה, שנבנה
//      בחנות כ-`<_id>-<ווריאנט>` (ProductModal), ונשאר חלק ממפתח הקבוצה.
//
// אימות: node src/utils/pickingGroups.test.mjs
import { isWeighted, toGrams, fromGrams } from "./weightPricing.js";

/**
 * מזהה **שורת עגלה** (ולא מזהה מוצר) — אותו כלל בדיוק שבו משתמש השרת
 * (lineKey ב-lib/completeOrderCharge.js). במוצר ללא ווריאנטים `id === _id`.
 */
export const lineKeyOf = (item) => {
  const key = item?.id ?? item?._id;
  return key != null ? String(key) : null;
};

/** האם השורה היא מתנה שנוספה ע"י מנוע המבצעים. */
export const isRewardLine = (item) =>
  item?.isRewardProduct === true ||
  String(item?.id ?? "").startsWith("reward_");

/**
 * מפתח "אותו מוצר פיזי" — מה שהמלקט מוריד מהמדף.
 *
 * שורת מתנה נבנית מהמוצר עצמו ואין לה ווריאנט, ולכן היא נופלת על מזהה המוצר
 * ומתאחדת עם השורה הרגילה. שורת ווריאנט שומרת את הווריאנט במפתח ולכן לעולם
 * לא מתאחדת עם ווריאנט אחר או עם השורה הרגילה.
 */
export const productKeyOf = (item) => {
  const line = lineKeyOf(item);
  const pid = item?._id != null ? String(item._id) : "";
  if (!pid) return line; // שורה בלי מזהה מוצר — לא מתאחדת עם דבר
  if (isRewardLine(item)) return pid;
  if (line && line !== pid && line.startsWith(`${pid}-`)) return line;
  return pid;
};

/** איחוד סט הברקודים של כל שורות הקבוצה (ההעשרה זהה, אבל אין סיבה להסתמך על כך). */
const mergeBarcodes = (lines) =>
  Array.from(
    new Set(
      lines
        .flatMap((line) => [
          ...(Array.isArray(line?.barcodes) ? line.barcodes : []),
          ...(line?.barcode ? [line.barcode] : []),
        ])
        .filter(Boolean)
    )
  );

/**
 * בניית קבוצות הליקוט מתוך עגלת ההזמנה.
 *
 * @param {object[]} cart שורות העגלה כפי שהגיעו מהשרת (מועשרות)
 * @returns {Array<{key, item, members, merged}>}
 *   key     — מזהה השורה הראשית; זה ה-pid שהמסך עובד איתו
 *   item    — שורת התצוגה: השורה הראשית עם **סכום** הכמויות וסט הברקודים המאוחד
 *   members — [{pid, quantity}] לפי סדר החלוקה: תשלום קודם, מתנה אחרונה
 *   merged  — האם אוחדה יותר משורה אחת (לתצוגה בלבד)
 */
export const buildPickingGroups = (cart) => {
  const lines = Array.isArray(cart) ? cart : [];
  const byProduct = new Map();

  lines.forEach((line, index) => {
    const lineKey = lineKeyOf(line);
    const productKey = productKeyOf(line);
    if (!lineKey || !productKey) return; // שורה בלי שום מזהה — כמו קודם, מדולגת
    if (!byProduct.has(productKey)) byProduct.set(productKey, []);
    byProduct.get(productKey).push({ line, index, lineKey, reward: isRewardLine(line) });
  });

  const groups = [];
  for (const entries of byProduct.values()) {
    // סדר החלוקה: שורה בתשלום לפני שורת מתנה. חוסר צריך לרדת מהמתנה, לא ממה
    // שהלקוח שילם עליו. בתוך כל מחלקה — סדר השורות בהזמנה.
    const ordered = [...entries].sort((a, b) =>
      a.reward === b.reward ? a.index - b.index : a.reward ? 1 : -1
    );
    const rep = ordered[0];

    // איחוד לפי מזהה שורה: אם שתי שורות **חולקות** מזהה (נתון פגום — השרת לא
    // יכול להבחין ביניהן ממילא), הן חבר אחד שכמותו היא הסכום.
    const seen = new Map();
    const members = [];
    for (const entry of ordered) {
      const quantity = Number(entry.line?.quantity) || 0;
      const existing = seen.get(entry.lineKey);
      if (existing) {
        existing.quantity += quantity;
        continue;
      }
      const member = { pid: entry.lineKey, quantity };
      seen.set(entry.lineKey, member);
      members.push(member);
    }

    const quantity = members.reduce((sum, m) => sum + m.quantity, 0);
    groups.push({
      key: rep.lineKey,
      item: {
        ...rep.line,
        quantity,
        barcodes: mergeBarcodes(ordered.map((e) => e.line)),
      },
      members,
      merged: entries.length > 1,
      lineCount: entries.length,
      order: rep.index,
    });
  }

  // סדר יציב לפי מקום השורה הראשית בעגלה. מיון המדפים עצמו נעשה אצל הקורא
  // (sortCartByPickingOrder) — כאן רק דואגים שהתוצאה לא תהיה תלוית-Map.
  groups.sort((a, b) => a.order - b.order);
  return groups;
};

/**
 * חלוקת הכמות שנלקטה בחזרה לשורות העגלה המקוריות: ממלאים שורה שורה לפי סדר
 * ה-members (תשלום קודם, מתנה אחרונה) עד שהכמות נגמרת.
 *
 * החשבון במוצר שקיל נעשה **בגרמים שלמים** מאותו נימוק שבגללו כל חשבון המשקל
 * במערכת בגרמים: 0.1 + 0.2 !== 0.3, ושארית עשרונית זעירה כאן הייתה מייצרת
 * שורה שחסר בה גרם ודיווח חוסרים עליה.
 *
 * @returns {Object<string, number>} מזהה שורה → כמות
 */
export const distributeQuantity = (group, total) => {
  const members = group?.members || [];
  const out = {};
  if (!members.length) return out;

  if (isWeighted(group?.item)) {
    let remaining = Math.max(0, toGrams(total));
    for (const member of members) {
      const take = Math.min(remaining, toGrams(member.quantity));
      remaining -= take;
      out[member.pid] = fromGrams(take);
    }
    // עודף (כמות מעל המוזמן — חסום במסך, אבל לא נזרק בשקט) נזקף לשורה הראשית
    if (remaining > 0) {
      out[members[0].pid] = fromGrams(toGrams(out[members[0].pid]) + remaining);
    }
    return out;
  }

  let remaining = Math.max(0, Math.round(Number(total) || 0));
  for (const member of members) {
    const take = Math.min(remaining, Math.max(0, Math.round(member.quantity)));
    remaining -= take;
    out[member.pid] = take;
  }
  if (remaining > 0) out[members[0].pid] += remaining;
  return out;
};

/**
 * הכמות שנלקטה לקבוצה, מתוך מפת התקדמות שמורה.
 *
 * המפה מגיעה משני מקורות שממופתחים אחרת: המסך שומר לפי **קבוצה**, והשרת כותב
 * likutProgress/shortageHold לפי **שורת עגלה** (send-and-update). בקבוצה בת
 * שורה אחת אין הבדל. בקבוצה מאוחדת מזהים מפה של השרת לפי כך שהיא מכילה מפתח
 * של שורה שאינה הראשית — ואז סוכמים על פני כל השורות, אחרת חצי מהכמות שכבר
 * לוקטה הייתה נעלמת בכניסה חוזרת למסך.
 */
const isLineKeyed = (map, group) =>
  (group?.members || []).some(
    (m) => m.pid !== group.key && Object.prototype.hasOwnProperty.call(map || {}, m.pid)
  );

export const groupPickedFrom = (map, group) => {
  if (!map || !group) return 0;
  if (!isLineKeyed(map, group)) return Number(map[group.key]) || 0;
  return group.members.reduce((sum, m) => sum + (Number(map[m.pid]) || 0), 0);
};

/** האם הקבוצה סומנה בחוסר — בכל אחת מהשורות שמרכיבות אותה. */
export const groupShortageFrom = (map, group) => {
  if (!map || !group) return false;
  return (group.members || []).some((m) => !!map[m.pid]);
};
