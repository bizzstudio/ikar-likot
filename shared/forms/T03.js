/** מקור אמת — T03 ספר תקלות */
export const T03 = {
  formCode: "T03",
  layout: "table",
  title: "ספר תקלות",
  intro: `תקלה לרבות הפסקות חשמל מעל ארבע שעות, תקלת ציוד, תקלות רישום ביומני טמפרטורה וכו׳. אם התרחשה תקלה בחדר קירור יש לרשום בספר תקלות זה ולדווח ללשכה העירונית לבריאות בתוך 24 שעות ממועד התחלת התקלה. יש לשמור את הספר במשך שנה מתאריך הרישום האחרון.`,
  header: {
    rightLines: ["האיכר", { sub: "אבטחת איכות" }],
    metaLines: ["טופס T03", "תאריך עדכון: 02/11/25", "עמוד 1 מתוך 1"],
  },
  tableMinWidthClass: "min-w-[900px]",
  columns: [
    { key: "faultDate", label: "התאריך", type: "date", width: "w-[7.5rem]" },
    { key: "faultNature", label: "מהות התקלה", type: "textarea", rows: 3 },
    {
      key: "correctiveAction",
      label: "פעולה מתקנת / מונעת",
      type: "textarea",
      rows: 3,
    },
    {
      key: "repairDate",
      label: "תאריך ביצוע תיקון",
      type: "date",
      width: "w-[7.5rem]",
    },
    {
      key: "healthBureauReport",
      labelShort: "דיווח ללשכת הבריאות",
      labelTitle:
        "תאריך דיווח ללשכת הבריאות, שמו של האדם בלשכת הבריאות (תוך 24 מתחילת התקלה)",
      type: "textarea",
      rows: 3,
    },
    { key: "conclusions", label: "מסקנות וסיכום", type: "textarea", rows: 3 },
    {
      key: "signature",
      label: "חתימה אחראי",
      type: "signature",
    },
  ],
  validation: {
    type: "table",
    requiredKeys: ["faultDate"],
    requireSignature: true,
    signatureFieldKey: "signature",
    /** לפחות אחד משדות התוכן (מלבד חתימה) — לשמירה על אותה משמעות כמו קודם */
    requireAnyContentKeys: [
      "faultDate",
      "faultNature",
      "correctiveAction",
      "repairDate",
      "healthBureauReport",
      "conclusions",
    ],
  },
  payload: { wrapDataAs: { entries: "singleRowArray" } },
};
