// src/utils/customerName.test.mjs
/* eslint-env node */
//
// אימות שם הלקוח (customerName.js).
//
// מה שנבדק כאן לא יתגלה בבדיקה ידנית: הזמנה של לקוח רשום נושאת תמיד שם פרטי
// ושם משפחה, ולכן כל מסך ייראה תקין. המקרים שנופלים הם הזמנת אורח בלי שם
// משפחה, והזמנה ישנה בלי שם כלל — ואלה בדיוק ההזמנות שבהן המלקט זקוק לשם
// כדי לזהות את מי שהגיע לחנות.
//
// הרצה:  node src/utils/customerName.test.mjs
import { customerFullName } from "./customerName.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) return pass++;
  failures.push(`${name}\n      התקבל: ${a}   צפוי: ${e}`);
};

const order = (user_info) => ({ user_info });

console.log("\n=== 1. המקרה הרגיל ===");
check("שם פרטי ומשפחה", customerFullName(order({ name: "יוסי", lastName: "כהן" })), "יוסי כהן");

console.log("=== 2. חלק חסר — אין רווח מיותר ואין undefined ===");
// `${a} ${b}` בלי סינון היה מחזיר "יוסי " או " כהן", ובעמודת טבלה זה נראה כמו שם קטוע
check("בלי שם משפחה", customerFullName(order({ name: "יוסי" })), "יוסי");
check("בלי שם פרטי", customerFullName(order({ lastName: "כהן" })), "כהן");
check("שם משפחה ריק", customerFullName(order({ name: "יוסי", lastName: "" })), "יוסי");

console.log("=== 3. אין שם בכלל — מחרוזת ריקה, כדי שהתצוגה תוכל להחליף ב-\"—\" ===");
check("user_info ריק", customerFullName(order({})), "");
check("בלי user_info", customerFullName({}), "");
check("בלי הזמנה", customerFullName(undefined), "");
check("null", customerFullName(null), "");
// שדה שכולו רווחים אינו שם — בלי trim הוא היה עובר כ"שם קיים" ומצייר תא ריק
check("רווחים בלבד", customerFullName(order({ name: "   ", lastName: "  " })), "");

console.log("=== 4. רווחים מיותרים במסד ===");
// שם שנשמר עם רווח בקצה (הדבקה מטופס) — נורמליזציה, כדי שאותו לקוח לא ייראה
// כשני שמות שונים ולא ייווצרו שתי רשומות תרגום למחרוזות שנבדלות ברווח בלבד
check("רווחים בקצוות", customerFullName(order({ name: " יוסי ", lastName: " כהן " })), "יוסי כהן");

console.log("=== 5. ערך שאינו מחרוזת נספר כחסר ===");
// מסמך פגום או ערך מוזרק לא יגרור "[object Object]" על מסך המלקט
check("אובייקט", customerFullName(order({ name: { $ne: 1 }, lastName: "כהן" })), "כהן");
check("מספר", customerFullName(order({ name: 5, lastName: "כהן" })), "כהן");
check("מערך", customerFullName(order({ name: ["א"], lastName: "כהן" })), "כהן");

console.log("");
if (failures.length) {
  console.log(`❌ ${failures.length} בדיקות נכשלו (מתוך ${pass + failures.length}):`);
  failures.forEach((f) => console.log(`   • ${f}`));
  process.exit(1);
}
console.log(`✅ כל ${pass} הבדיקות עברו.`);
