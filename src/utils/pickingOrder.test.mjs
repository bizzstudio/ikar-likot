// src/utils/pickingOrder.test.mjs
/* eslint-env node */
//
// אימות סדר המעבר על פריטי ההזמנה (pickingOrder.js).
//
// הרצה:  node src/utils/pickingOrder.test.mjs
import { sortCartByPickingOrder, comparePickingOrder } from "./pickingOrder.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) return pass++;
  failures.push(`${name}\n      התקבל: ${a}   צפוי: ${e}`);
};

const item = (name, likutOrder, barcode) => ({ name, likutOrder, barcode, _id: name });
const namesOf = (list) => list.map((i) => i.name);

console.log("\n=== 1. הסדר הוא סדר המדפים, לא הברקוד ===");
// הברקודים כאן ממוינים הפוך לסדר הליקוט — כך שאם המיון עדיין לפי ברקוד, ייפול
const cart = [
  item("סבון", 30, "111"),
  item("קמח", 10, "333"),
  item("עגבניות", 20, "222"),
];
check("לפי סדר ליקוט עולה", namesOf(sortCartByPickingOrder(cart)), ["קמח", "עגבניות", "סבון"]);
check("המערך המקורי לא שונה", namesOf(cart), ["סבון", "קמח", "עגבניות"]);

console.log("=== 2. מוצר בלי סדר ליקוט יורד לסוף ===");
// פתיחת המסלול במוצרים שאין להם מיקום ידוע היא בדיוק ההליכה האקראית שביטלנו
const mixed = [
  item("בלי-א", null, "500"),
  item("קמח", 10, "333"),
  item("בלי-ב", undefined, "400"),
  item("סבון", 30, "111"),
  item("בלי-ג", "", "600"),
];
check("שלושת חסרי הסדר בסוף", namesOf(sortCartByPickingOrder(mixed)),
  ["קמח", "סבון", "בלי-ב", "בלי-א", "בלי-ג"]);

console.log("=== 3. המלכודת: סדר ליקוט 0 אינו \"אין סדר\" ===");
// Number(null) ו-Number(\"\") שניהם 0. בלי בדיקה מפורשת מוצר בלי סדר ליקוט היה
// קופץ לראש התור — מקום שנועד למוצר שסדר הליקוט שלו הוא באמת 0.
const zero = [item("בלי", null, "222"), item("ראשון-אמיתי", 0, "111"), item("שני", 5, "333")];
check("0 הוא מיקום אמיתי ומוביל", namesOf(sortCartByPickingOrder(zero)), ["ראשון-אמיתי", "שני", "בלי"]);

console.log("=== 4. סדר דטרמיניסטי — תנאי לשמירת מיקום המצביע ===");
// אותה הזמנה חייבת להיפתח באותו סדר בכל טעינה ובכל מכשיר, אחרת currentIndex
// השמור מצביע אחרי רענון על פריט אחר לגמרי.
const tie = [item("ב", 10, "222"), item("א", 10, "111"), item("ג", 10, "333")];
check("שוויון בסדר ליקוט נשבר לפי ברקוד", namesOf(sortCartByPickingOrder(tie)), ["א", "ב", "ג"]);
const once = namesOf(sortCartByPickingOrder(mixed));
check("מיון חוזר מחזיר אותה תוצאה", namesOf(sortCartByPickingOrder(sortCartByPickingOrder(mixed))), once);
check("מיון הרשימה ההפוכה מחזיר אותה תוצאה", namesOf(sortCartByPickingOrder([...mixed].reverse())), once);

console.log("=== 5. נסיגה מלאה לסדר ההיסטורי כשאין סדר ליקוט כלל ===");
// אם השדה לא מולא באף מוצר, ההתנהגות חייבת להישאר בדיוק כפי שהייתה — לפי ברקוד
const noOrder = [item("ג", null, "333"), item("א", null, "111"), item("ב", null, "222")];
check("לפי ברקוד", namesOf(sortCartByPickingOrder(noOrder)), ["א", "ב", "ג"]);

console.log("=== 6. מקרי קצה ===");
check("עגלה ריקה", sortCartByPickingOrder([]), []);
check("undefined", sortCartByPickingOrder(undefined), []);
check("פריט בלי ברקוד ובלי סדר", namesOf(sortCartByPickingOrder([item("א"), item("ב")])), ["א", "ב"]);
check("סדר ליקוט כמחרוזת מספרית", namesOf(sortCartByPickingOrder(
  [item("ב", "20", "1"), item("א", "3", "2")])), ["א", "ב"]);
check("סדר ליקוט לא-מספרי נחשב חסר", namesOf(sortCartByPickingOrder(
  [item("זבל", "לא-מספר", "999"), item("תקין", 5, "111")])), ["תקין", "זבל"]);
check("comparePickingOrder ישיר", comparePickingOrder(item("א", 1, "9"), item("ב", 2, "1")) < 0, true);

console.log("");
if (failures.length) {
  console.log(`❌ ${failures.length} בדיקות נכשלו (מתוך ${pass + failures.length}):`);
  failures.forEach((f) => console.log(`   • ${f}`));
  process.exit(1);
}
console.log(`✅ כל ${pass} הבדיקות עברו.`);
