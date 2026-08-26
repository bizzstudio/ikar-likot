// src/utils/likutQueueSort.test.mjs
/* eslint-env node */
//
// אימות סדר התור בליקוט (likutQueueSort.js).
//
// למה זה נבדק ולא נראה בעין: התרחישים ששוברים את הקיבוץ הם בדיוק אלה שלא
// מזוהים במבט על המסך — עיר שנשמרה פעם עם מחוז ופעם בלי, שם עיר עם רווח נגרר,
// והזמנה בלי כתובת בכלל. בכל אחד מהם הרשימה נראית "כמעט מסודרת", ורק ספירה
// מגלה שרמלה מופיעה בשני מקומות.
//
// הרצה:  node src/utils/likutQueueSort.test.mjs
import {
  sortOrdersByDeliveryArea,
  sortOrdersByPickupSlot,
  compareByInvoice,
  isAreaStart,
} from "./likutQueueSort.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) return pass++;
  failures.push(`${name}\n      התקבל: ${a}\n      צפוי:  ${e}`);
};

const order = (invoice, city, region, extra = {}) => ({
  invoice,
  user_info: { address: { city: city === null ? undefined : { city_name_he: city, region_name: region }, ...extra } },
});

const invoicesOf = (list) => list.map((o) => o.invoice);
// כל עיר חייבת להופיע כרצף אחד — זו כל הדרישה, והיא נבדקת ישירות
const citiesOf = (list) =>
  list.map((o) => o?.user_info?.address?.city?.city_name_he?.trim() || "");
const isContiguous = (list) => {
  const seen = new Set();
  let prev = null;
  for (const c of citiesOf(list)) {
    if (c !== prev && seen.has(c)) return false;
    seen.add(c);
    prev = c;
  }
  return true;
};

console.log("\n=== 1. כל עיר ברצף ===");
const mixed = [
  order(101, "רמלה", "מרכז"),
  order(102, "לוד", "מרכז"),
  order(103, "רמלה", "מרכז"),
  order(104, "לוד", "מרכז"),
  order(105, "רמלה", "מרכז"),
];
const sorted = sortOrdersByDeliveryArea(mixed);
check("לוד ורמלה כל אחת ברצף", citiesOf(sorted), ["לוד", "לוד", "רמלה", "רמלה", "רמלה"]);
check("בתוך העיר — לפי מספר הזמנה עולה", invoicesOf(sorted), [102, 104, 101, 103, 105]);
check("המערך המקורי לא שונה", invoicesOf(mixed), [101, 102, 103, 104, 105]);

console.log("=== 2. מחוז שנשמר על חלק מההזמנות בלבד — אסור שיפצל עיר ===");
// זה התרחיש המרכזי: מסמכי הערים נשמרו על ההזמנות בזמנים שונים, ולכן אותה עיר
// יכולה להגיע פעם עם region_name ופעם בלי. מיון ישיר לפי שדה ההזמנה היה מפצל.
const partialRegion = [
  order(201, "רמלה", "מרכז"),
  order(202, "לוד", "מרכז"),
  order(203, "רמלה", ""),        // אותה עיר, בלי מחוז
  order(204, "רמלה", undefined), // ואותה עיר, בלי השדה בכלל
];
const partialSorted = sortOrdersByDeliveryArea(partialRegion);
check("רמלה נשארת רצף אחד", isContiguous(partialSorted), true);
check("שלוש הזמנות רמלה צמודות", invoicesOf(partialSorted), [202, 201, 203, 204]);

console.log("=== 3. רווח נגרר בשם העיר ===");
const spaced = [
  order(301, "רמלה", "מרכז"),
  order(302, "לוד", "מרכז"),
  order(303, "רמלה ", "מרכז"), // רווח נגרר
];
check("‏\"רמלה \" מתקבצת עם \"רמלה\"", isContiguous(sortOrdersByDeliveryArea(spaced)), true);
check("והסדר בתוכה לפי מספר", invoicesOf(sortOrdersByDeliveryArea(spaced)), [302, 301, 303]);

console.log("=== 4. מחוזות שונים — ערים שכנות סמוכות ===");
const regions = [
  order(401, "חיפה", "חיפה"),
  order(402, "רמלה", "מרכז"),
  order(403, "קריית ים", "חיפה"),
  order(404, "לוד", "מרכז"),
];
check("קודם כל מחוז חיפה, אחר כך מחוז מרכז",
  citiesOf(sortOrdersByDeliveryArea(regions)),
  ["חיפה", "קריית ים", "לוד", "רמלה"]);

console.log("=== 5. ריק תמיד אחרון ===");
const blanks = [
  order(501, null, null),      // אין כתובת בכלל
  order(502, "רמלה", "מרכז"),
  order(503, "", ""),          // עיר ריקה
  order(504, "אשדוד", ""),     // עיר בלי מחוז
];
const blanksSorted = sortOrdersByDeliveryArea(blanks);
check("הזמנות בלי עיר יורדות לסוף", invoicesOf(blanksSorted), [502, 504, 501, 503]);
check("עיר בלי מחוז אחרי ערים עם מחוז, ולפני חסרי עיר",
  citiesOf(blanksSorted), ["רמלה", "אשדוד", "", ""]);

console.log("=== 6. מספר הזמנה — מספרי ולא לקסיקוגרפי ===");
// ההשוואה הישנה הייתה String(a).localeCompare(String(b)) והציבה 10 לפני 9.
const numeric = [order(10, "רמלה", "מרכז"), order(9, "רמלה", "מרכז"), order(100, "רמלה", "מרכז")];
check("9 לפני 10 לפני 100", invoicesOf(sortOrdersByDeliveryArea(numeric)), [9, 10, 100]);
check("compareByInvoice ישיר", [{ invoice: 10 }, { invoice: 9 }].sort(compareByInvoice).map(o => o.invoice), [9, 10]);
check("הזמנה בלי מספר תקין יורדת לסוף",
  [{ invoice: 5 }, { invoice: null }, { invoice: 3 }].sort(compareByInvoice).map(o => o.invoice), [3, 5, null]);

console.log("=== 7. סימון תחילת אזור (הקו המפריד) ===");
check("השורה הראשונה תמיד פותחת", isAreaStart(sorted, 0), true);
check("שורה שנייה באותה עיר — לא", isAreaStart(sorted, 1), false);
check("המעבר מלוד לרמלה — כן", isAreaStart(sorted, 2), true);
check("שורה שלישית ברמלה — לא", isAreaStart(sorted, 3), false);

console.log("=== 8. מקרי קצה שלא מפילים את המיון ===");
check("רשימה ריקה", sortOrdersByDeliveryArea([]), []);
check("undefined", sortOrdersByDeliveryArea(undefined), []);
check("הזמנה אחת", invoicesOf(sortOrdersByDeliveryArea([order(1, "רמלה", "מרכז")])), [1]);

console.log("=== 9. המשווה הוא סדר מלא ועקבי ===");
// משווה לא-עקבי (a<b וגם b<a) גורם ל-Array.sort להחזיר תוצאה שונה לפי סדר
// הקלט — הרשימה הייתה "קופצת" בין רענונים בלי שאיש יבין למה.
const messy = [
  order(901, "רמלה", "מרכז"), order(902, null, null), order(903, "לוד", ""),
  order(904, "רמלה", ""), order(905, "חיפה", "חיפה"), order(906, "", "מרכז"),
  order(907, "לוד", "מרכז"), order(908, "רמלה", "מרכז"),
];
const once = invoicesOf(sortOrdersByDeliveryArea(messy));
check("מיון של רשימה ממוינת מחזיר אותה תוצאה",
  invoicesOf(sortOrdersByDeliveryArea(sortOrdersByDeliveryArea(messy))), once);
check("מיון של הרשימה ההפוכה מחזיר אותה תוצאה",
  invoicesOf(sortOrdersByDeliveryArea([...messy].reverse())), once);
check("כל עיר נשארה רצף אחד", isContiguous(sortOrdersByDeliveryArea(messy)), true);

console.log("=== 10. לשונית האיסוף העצמי — לפי מועד האיסוף ===");
// כאן השאלה אינה לאן נוסעים אלא מתי הלקוח מגיע: הזמנה של 16:00 אינה קודמת
// להזמנה של 11:00 רק משום שנקלטה קודם.
const pk = (invoice, slot) => ({ invoice, pickupSlot: slot });
const slots = [
  pk(101, "2026-08-27T16:00:00+03:00"),
  pk(102, "2026-08-27T11:00:00+03:00"),
  pk(103, "2026-08-26T15:00:00+03:00"),
];
check("המוקדם ביותר ראשון", invoicesOf(sortOrdersByPickupSlot(slots)), [103, 102, 101]);
check("המערך המקורי לא שונה", invoicesOf(slots), [101, 102, 103]);

// הזמנות שנוצרו לפני שמועדי האיסוף הונהגו — לסוף, אחרת הן דוחקות את הקרובים
const withBlanks = [pk(201, null), pk(202, "2026-08-27T11:00:00+03:00"), pk(203, undefined), pk(204, "לא-תאריך")];
check("חסרי מועד ומועד פגום בסוף", invoicesOf(sortOrdersByPickupSlot(withBlanks)), [202, 201, 203, 204]);
check("ביניהם — לפי מספר הזמנה", invoicesOf(sortOrdersByPickupSlot([pk(9, null), pk(3, null), pk(10, null)])), [3, 9, 10]);
check("אותו מועד — נשבר לפי מספר הזמנה",
  invoicesOf(sortOrdersByPickupSlot([pk(20, "2026-08-27T11:00:00+03:00"), pk(7, "2026-08-27T11:00:00+03:00")])), [7, 20]);
// אותו רגע מוחלט בשני ייצוגים — ההשוואה אינה תלויה באזור זמן
check("היסט מול UTC — אותו רגע",
  invoicesOf(sortOrdersByPickupSlot([pk(1, "2026-08-27T08:00:00Z"), pk(2, "2026-08-27T11:00:00+03:00")])), [1, 2]);
check("רשימה ריקה", sortOrdersByPickupSlot([]), []);
check("undefined", sortOrdersByPickupSlot(undefined), []);

console.log("");
if (failures.length) {
  console.log(`❌ ${failures.length} בדיקות נכשלו (מתוך ${pass + failures.length}):`);
  failures.forEach((f) => console.log(`   • ${f}`));
  process.exit(1);
}
console.log(`✅ כל ${pass} הבדיקות עברו.`);
