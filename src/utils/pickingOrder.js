// src/utils/pickingOrder.js
//
// הסדר שבו המלקט עובר על פריטי ההזמנה.
//
// עד שזה נכתב התור מוין **לפי ברקוד** — מספר שאין לו שום קשר למדף שהמוצר יושב
// עליו. המלקטת הלכה הלוך ושוב בחנות: קמח, סבון, קמח, ירקות. השדה שנועד בדיוק
// לזה, likutOrder ("סדר ליקוט"), קיים על המוצר, ניתן לעריכה באדמין ולייבוא
// מאקסל בעמודה משלו — ופשוט אף אחד לא קרא אותו.
//
// שני כללים:
//   1. מיון לפי likutOrder עולה — הסדר שבו המוצרים מסודרים בחנות.
//   2. מוצר בלי סדר ליקוט יורד ל**סוף** התור. פתיחת המסלול דווקא במוצרים שאין
//      להם מיקום ידוע היא בדיוק ההליכה האקראית שהמיון בא לבטל; עדיף שהמלקט
//      יעבור את המסלול המסודר ואז ילקט את הבודדים שנשארו.
//
// הברקוד נשאר שובר-השוויון, ולא כמחווה לעבר: הוא מה שהופך את הסדר לדטרמיניסטי,
// כך שאותה הזמנה נפתחת באותו סדר בכל טעינה ובכל מכשיר. בלי זה המצביע השמור
// (currentIndex) היה מצביע על פריט אחר אחרי רענון.

/**
 * סדר הליקוט של שורת עגלה, או null אם אין לה כזה.
 * הבדיקה המפורשת הכרחית: Number(null) ו-Number("") שניהם 0 — מוצר בלי סדר
 * ליקוט היה קופץ לראש התור במקום לרדת לסופו.
 */
const pickingOrderOf = (item) => {
  const raw = item?.likutOrder;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

// סדר הגיבוי ההיסטורי, נשמר כלשונו כדי שהתנהגות הזמנות בלי סדר ליקוט לא תשתנה.
const compareByBarcode = (a, b) =>
  String(a?.barcode || "").localeCompare(String(b?.barcode || ""));

export const comparePickingOrder = (a, b) => {
  const orderA = pickingOrderOf(a);
  const orderB = pickingOrderOf(b);
  if (orderA === null && orderB === null) return compareByBarcode(a, b);
  if (orderA === null) return 1;
  if (orderB === null) return -1;
  if (orderA !== orderB) return orderA - orderB;
  return compareByBarcode(a, b);
};

/**
 * מיון פריטי עגלה לפי סדר הליקוט. אינו משנה את המערך שהתקבל.
 */
export const sortCartByPickingOrder = (cart) =>
  [...(cart || [])].sort(comparePickingOrder);
