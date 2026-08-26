// src/utils/storeTime.test.mjs
/* eslint-env node */
//
// אימות שעון החנות (storeTime.js).
//
// מה שנבדק כאן לא נראה במסך: המכשיר של המלקט כמעט תמיד מוגדר לשעון ישראל,
// ולכן טעות בהמרה תיראה נכונה בכל בדיקה ידנית — ותתגלה רק אצל עובד שהמכשיר
// שלו הוגדר אחרת, או במעבר שעון קיץ/חורף.
//
// הרצה:  node src/utils/storeTime.test.mjs
import { STORE_TZ, formatStoreDateTime } from "./storeTime.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) return pass++;
  failures.push(`${name}\n      התקבל: ${a}   צפוי: ${e}`);
};

console.log("\n=== 1. הרגע נקרא בשעון ישראל, לא בשעון המכשיר ===");
check("אזור הזמן", STORE_TZ, "Asia/Jerusalem");
// אותו רגע מוחלט בשלושה ייצוגים — חייב להניב את אותה שעה מוצגת
check("שעון קיץ, כתוב עם היסט", formatStoreDateTime("2026-08-27T11:00:00+03:00"), { date: "27/08", time: "11:00" });
check("אותו רגע כתוב ב-UTC", formatStoreDateTime("2026-08-27T08:00:00Z"), { date: "27/08", time: "11:00" });
check("אותו רגע כאובייקט Date", formatStoreDateTime(new Date("2026-08-27T08:00:00Z")), { date: "27/08", time: "11:00" });

console.log("=== 2. מעבר שעון קיץ/חורף ===");
// בחורף ישראל היא UTC+2 ובקיץ UTC+3. חישוב שמניח היסט קבוע נופל באחד מהם.
check("חורף — 09:00 UTC הוא 11:00", formatStoreDateTime("2026-01-15T09:00:00Z"), { date: "15/01", time: "11:00" });
check("קיץ — 09:00 UTC הוא 12:00", formatStoreDateTime("2026-07-15T09:00:00Z"), { date: "15/07", time: "12:00" });

console.log("=== 3. מעבר יום ===");
// רגע שב-UTC הוא עדיין אתמול, ובישראל כבר היום — התאריך המוצג חייב להיות המקומי
check("22:30 UTC = 01:30 למחרת בישראל", formatStoreDateTime("2026-08-26T22:30:00Z"), { date: "27/08", time: "01:30" });

console.log("=== 4. ערך חסר או פגום מחזיר null ולא \"Invalid Date\" ===");
// dayjs אינו זורק על ערך פגום — בלי הבדיקה המלקט היה רואה "Invalid Date" בעמודה
check("null", formatStoreDateTime(null), null);
check("undefined", formatStoreDateTime(undefined), null);
check("מחרוזת ריקה", formatStoreDateTime(""), null);
check("מחרוזת שאינה תאריך", formatStoreDateTime("לא-תאריך"), null);
check("Date לא חוקי", formatStoreDateTime(new Date("nope")), null);
check("אובייקט זבל", formatStoreDateTime({ $ne: 1 }), null);

console.log("");
if (failures.length) {
  console.log(`❌ ${failures.length} בדיקות נכשלו (מתוך ${pass + failures.length}):`);
  failures.forEach((f) => console.log(`   • ${f}`));
  process.exit(1);
}
console.log(`✅ כל ${pass} הבדיקות עברו.`);
