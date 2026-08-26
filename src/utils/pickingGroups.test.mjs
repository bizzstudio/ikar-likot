// src/utils/pickingGroups.test.mjs
/* eslint-env node */
//
// אימות איחוד שורות הליקוט (pickingGroups.js).
//
// הרצה:  node src/utils/pickingGroups.test.mjs
import {
  buildPickingGroups,
  distributeQuantity,
  groupPickedFrom,
  groupShortageFrom,
  productKeyOf,
  lineKeyOf,
} from "./pickingGroups.js";

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) return pass++;
  failures.push(`${name}\n      התקבל: ${a}   צפוי: ${e}`);
};

const PID = "p1";
const line = (over = {}) => ({ _id: PID, id: PID, quantity: 1, barcode: "111", ...over });
const gift = (over = {}) =>
  line({ id: `reward_${PID}_off1`, isRewardProduct: true, ...over });

console.log("\n=== 1. שורה בתשלום + שורת מתנה = שורה אחת עם סכום הכמויות ===");
{
  const groups = buildPickingGroups([line({ quantity: 1 }), gift({ quantity: 1 })]);
  check("קבוצה אחת", groups.length, 1);
  check("הכמות מסוכמת", groups[0].item.quantity, 2);
  check("המפתח הוא השורה בתשלום", groups[0].key, PID);
  check("שתי שורות מקוריות", groups[0].lineCount, 2);
  check("מסומנת כמאוחדת", groups[0].merged, true);
  check("סדר החלוקה — תשלום קודם", groups[0].members.map((m) => m.pid),
    [PID, `reward_${PID}_off1`]);
}

console.log("\n=== 2. המתנה נשארת אחרונה גם כשהיא ראשונה בעגלה ===");
{
  const groups = buildPickingGroups([gift({ quantity: 1 }), line({ quantity: 3 })]);
  check("המפתח עדיין השורה בתשלום", groups[0].key, PID);
  check("סדר החלוקה", groups[0].members.map((m) => m.pid), [PID, `reward_${PID}_off1`]);
  check("סכום", groups[0].item.quantity, 4);
}

console.log("\n=== 3. הזמנה רגילה — שום דבר לא זז ===");
{
  const cart = [
    line({ _id: "a", id: "a", quantity: 2, barcode: "1" }),
    line({ _id: "b", id: "b", quantity: 5, barcode: "2" }),
  ];
  const groups = buildPickingGroups(cart);
  check("שתי קבוצות", groups.length, 2);
  check("מפתחות זהים למזהי השורות", groups.map((g) => g.key), ["a", "b"]);
  check("כמויות ללא שינוי", groups.map((g) => g.item.quantity), [2, 5]);
  check("אף אחת לא מאוחדת", groups.map((g) => g.merged), [false, false]);
}

console.log("\n=== 4. ווריאנטים לא מתאחדים (שני פריטים פיזיים שונים) ===");
{
  const cart = [
    line({ _id: "a", id: "a-red", quantity: 1 }),
    line({ _id: "a", id: "a-blue", quantity: 1 }),
  ];
  const groups = buildPickingGroups(cart);
  check("שתי קבוצות נפרדות", groups.length, 2);
  check("המפתחות הם מזהי השורות", groups.map((g) => g.key), ["a-red", "a-blue"]);
  check("מפתח מוצר של ווריאנט שומר את הווריאנט", productKeyOf(cart[0]), "a-red");
  check("מפתח מוצר של מתנה נופל למוצר", productKeyOf(gift()), PID);
}

console.log("\n=== 5. חלוקה בחזרה: תשלום קודם, מתנה אחרונה ===");
{
  const g = buildPickingGroups([line({ quantity: 1 }), gift({ quantity: 1 })])[0];
  check("לוקטו 2 — הכל מלא", distributeQuantity(g, 2),
    { [PID]: 1, [`reward_${PID}_off1`]: 1 });
  check("לוקט 1 — החוסר יורד מהמתנה", distributeQuantity(g, 1),
    { [PID]: 1, [`reward_${PID}_off1`]: 0 });
  check("לוקט 0", distributeQuantity(g, 0),
    { [PID]: 0, [`reward_${PID}_off1`]: 0 });
}

console.log("\n=== 6. חלוקה במוצר שקיל — בגרמים, בלי שארית עשרונית ===");
{
  const w = (over) => line({ soldByWeight: true, weightStep: 0.1, minWeight: 0.1, maxWeight: 10, ...over });
  const g = buildPickingGroups([
    w({ quantity: 1.5 }),
    w({ id: `reward_${PID}_off1`, isRewardProduct: true, quantity: 0.5 }),
  ])[0];
  check("סכום המשקלים", g.item.quantity, 2);
  check("נשקלו 2 ק\"ג", distributeQuantity(g, 2), { [PID]: 1.5, [`reward_${PID}_off1`]: 0.5 });
  check("נשקלו 1.9 — החסר יורד מהמתנה", distributeQuantity(g, 1.9),
    { [PID]: 1.5, [`reward_${PID}_off1`]: 0.4 });
  check("נשקלו 0.3 — רק השורה בתשלום", distributeQuantity(g, 0.3),
    { [PID]: 0.3, [`reward_${PID}_off1`]: 0 });
}

console.log("\n=== 7. שחזור התקדמות משני המפתוחים (קבוצה / שורת עגלה) ===");
{
  const g = buildPickingGroups([line({ quantity: 1 }), gift({ quantity: 1 })])[0];
  // מפה שהמסך שמר — ממופתחת לפי קבוצה
  check("מפה של המסך", groupPickedFrom({ [PID]: 2 }, g), 2);
  // מפה שהשרת כתב — ממופתחת לפי שורת עגלה
  check("מפה של השרת", groupPickedFrom({ [PID]: 1, [`reward_${PID}_off1`]: 1 }, g), 2);
  check("מפה ריקה", groupPickedFrom({}, g), 0);
  check("חוסר בשורה כלשהי", groupShortageFrom({ [`reward_${PID}_off1`]: true }, g), true);
  check("אין חוסר", groupShortageFrom({}, g), false);
}

console.log("\n=== 8. מצבי קצה ===");
{
  check("עגלה ריקה", buildPickingGroups([]), []);
  check("קלט שאינו מערך", buildPickingGroups(null), []);
  // שורה בלי שום מזהה — מדולגת, כמו productIdStr במסך
  check("שורה בלי מזהה", buildPickingGroups([{ quantity: 1 }]).length, 0);
  check("lineKeyOf נופל ל-_id", lineKeyOf({ _id: "x" }), "x");
  // שתי שורות שחולקות מזהה שורה (נתון פגום) — חבר אחד, כמות מסוכמת
  const dup = buildPickingGroups([line({ quantity: 1 }), line({ quantity: 1 })])[0];
  check("מזהה כפול → חבר אחד", dup.members, [{ pid: PID, quantity: 2 }]);
  check("כמות מסוכמת", dup.item.quantity, 2);
  // כמות מעל המוזמן לא נזרקת בשקט
  const g = buildPickingGroups([line({ quantity: 1 }), gift({ quantity: 1 })])[0];
  check("עודף נזקף לשורה הראשית", distributeQuantity(g, 5),
    { [PID]: 4, [`reward_${PID}_off1`]: 1 });
}

console.log("\n=== 9. איחוד סט הברקודים של כל השורות ===");
{
  const g = buildPickingGroups([
    line({ barcodes: ["111"] }),
    gift({ barcode: "222", barcodes: ["222", "333"] }),
  ])[0];
  check("כל הברקודים", g.item.barcodes.sort(), ["111", "222", "333"]);
}

console.log(`\n${failures.length ? "❌" : "✅"} ${pass} בדיקות עברו, ${failures.length} נכשלו`);
failures.forEach((f) => console.log("   • " + f));
process.exit(failures.length ? 1 : 0);
