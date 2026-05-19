/**
 * מקור אמת — טופס T01 (בדיקת ניקיון ותשתיות)
 * לשכפול לבקאנד/אדמין: העתק את תיקיית shared/forms (או symlink).
 */
export const T01 = {
  formCode: "T01",
  layout: "matrix",
  title: "טופס בדיקת ניקיון ותשתיות",
  header: {
    rightLines: ["האיכר – מחסן", { sub: "אבטחת איכות" }],
    metaLines: ["טופס T01", "תאריך עדכון: 20/01/26", "עמוד 1 מתוך 1"],
  },
  instructions: {
    parts: [
      { bold: "תדירות:", text: " מילוי שבועי – בתחילת שבוע עבודה." },
      { bold: "סימון תקין (V)", text: " — סמן את התא." },
      { bold: "לא תקין", text: " — השאר ללא סימון (לציין ליקוי שנמצא)." },
    ],
  },
  matrix: {
    cornerHeaderLabel: "שם החדר / תאריך",
    rows: [
      { key: "cleaning", label: "ניקיון" },
      {
        key: "foreign_body_control",
        label: "בקרת גופים זרים (מנורות, תשתיות, אחסון, אריזות)",
      },
      { key: "employee_hygiene", label: "היגיינת עובדים" },
      { key: "corrective_action", label: "פעולה מתקנת" },
      { key: "corrective_verification", label: "אימות פ. מתקנת" },
    ],
    columns: [
      {
        key: "goods_in_out",
        label:
          "אזור קבלת והוצאת סחורה: רצפה, קירות ותקרה, דלתות, תאורה, עמדת מחשב, כיור ומשטח",
      },
      {
        key: "freezer_fridge",
        label: "מקפיא/מקרר: רצפה, קירות ותקרה, דלתות, מדפים, תאורה",
      },
      {
        key: "employee_washrooms",
        label: "שירותי עובדים: רצפה, קירות ותקרה, אסלה, כיור",
      },
      {
        key: "yard_trash",
        label: "חצר ופחי אשפה: אזור כניסה, אזור אשפה",
      },
    ],
  },
  footer: {
    rows: [
      {
        cells: [
          { type: "date", key: "inspectionDate", label: "תאריך" },
          {
            type: "signature",
            key: "signature",
            label: "חתימה דיגיטלית",
            spanRest: true,
          },
        ],
      },
    ],
  },
  validation: {
    type: "matrix",
    requiredFooterKeys: ["inspectionDate"],
    requireSignature: true,
  },
};
