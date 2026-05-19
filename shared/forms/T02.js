/** מקור אמת — T02 יומן קבלת סחורה */
export const T02 = {
  formCode: "T02",
  layout: "table",
  title: "טופס יומן קבלת סחורה",
  intro: "הטופס יתבצע באופן ממוחשב – בהתאם לפורמט זה.",
  header: {
    rightLines: ["האיכר – מחסן", { sub: "אבטחת איכות" }],
    metaLines: ["טופס T02", "תאריך עדכון: 20/01/26", "עמוד 1 מתוך 1"],
  },
  tableMinWidthClass: "min-w-[1100px]",
  columns: [
    { key: "receiptDate", label: "תאריך קבלה", type: "date", width: "w-[7rem]" },
    { key: "receiptTime", label: "שעת קבלה", type: "time", width: "w-[7rem]" },
    {
      key: "productName",
      label: "שם המוצר שהתקבל",
      type: "textarea",
      rows: 3,
    },
    {
      key: "frozenTempIntegrity",
      labelShort: "תקינות טמפ' (קפוא)",
      labelTitle:
        "תקינות טמפ' המזון המתקבל (קפוא) בדיקה קשה במגע",
      type: "textarea",
      rows: 3,
    },
    {
      key: "shelfLifeIntegrity",
      label: "תקינות תאריך חיי מדף",
      type: "textarea",
      rows: 2,
    },
    {
      key: "manufacturerSupplier",
      label: "יצרן/ספק המוצר / מענו",
      type: "textarea",
      rows: 2,
    },
    {
      key: "weightQuantity",
      label: "משקל / כמות",
      type: "textarea",
      rows: 2,
      width: "w-[6rem]",
    },
    {
      key: "certificatesVeterinary",
      labelShort: "תעודות וטרינרית",
      labelTitle: "שלימות תעודות, משלוח וטרינרית",
      type: "textarea",
      rows: 2,
    },
    {
      key: "shipmentIntegrityCleanliness",
      labelShort: "שלמות וניקיון משלוח",
      labelTitle: "שלמות וניקיון המשלוח",
      type: "textarea",
      rows: 2,
    },
    {
      type: "group",
      key: "receiverBlock",
      label: "שם וחתימת מקבל",
      fields: [
        { key: "receiverName", type: "text", label: "שם" },
        { key: "signature", type: "signature" },
      ],
    },
  ],
  validation: {
    type: "table",
    requiredKeys: [
      "receiptDate",
      "receiptTime",
      "productName",
      "receiverName",
    ],
    requireSignature: true,
    signatureFieldKey: "signature",
  },
  payload: { wrapDataAs: { entries: "singleRowArray" } },
};
