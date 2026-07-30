// src/i18n/productName.js
//
// בחירת מקור השם של מוצר לפי שפת המלקט. פונקציה טהורה בלי React ובלי רשת, כדי
// שהחוק היחיד שקובע מה מוצג יהיה במקום אחד וניתן לבדיקה.
//
// סדר העדיפויות בשפה שאינה עברית:
//   1. שם שהוזן ידנית במסד לאותה שפה (title.th / title.en) — גובר תמיד, וזו
//      דרך העקיפה כשהתרגום האוטומטי יצא לא מוצלח.
//   2. תרגום אוטומטי של השם העברי (נעשה מחוץ לפונקציה הזו).
//   3. נפילה לשם העברי — מסך הליקוט לעולם לא נשאר ריק.

/** מיפוי שפת האפליקציה למפתח השפה באובייקט title שבמסד. */
const TITLE_KEY_BY_LANGUAGE = {
  thai: "th",
  en: "en",
};

/**
 * @returns {{ value: string } | { translateFrom: string }}
 *   value — שם מוכן להצגה כמות שהוא.
 *   translateFrom — הטקסט העברי שצריך לתרגם (עם נפילה חזרה אליו אם אין תרגום).
 */
export function selectProductName(item, language) {
  const he = (item?.title?.he || "").trim();

  if (!language || language === "hebrew") {
    return { value: he || item?.title?.en || "" };
  }

  const manual = item?.title?.[TITLE_KEY_BY_LANGUAGE[language]];
  if (typeof manual === "string" && manual.trim()) {
    return { value: manual.trim() };
  }

  // אין שם עברי לתרגם ממנו — מנסים כל שם אחר שקיים לפני שמוותרים
  if (!he) return { value: item?.title?.en || "" };

  return { translateFrom: he };
}
