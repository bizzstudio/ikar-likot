// src/utils/storeTime.js
//
// זמנים שמוצגים למלקט נקראים **בשעון החנות**, לא בשעון המכשיר.
//
// זה לא פורמליזם: מועד איסוף עצמי הוא פגישה עם לקוח בשעה מסוימת. מכשיר שאזור
// הזמן שלו הוגדר שגוי — טאבלט זול שיצא מהקופסה עם ברירת מחדל אחרת, או טלפון
// פרטי של עובד שהוגדר בחו"ל — היה מציג 10:00 במקום 11:00, וההזמנה הייתה מוכנה
// בשעה הלא נכונה בלי שאיש יבחין. השרת שומר את המועד כרגע מוחלט (UTC), ולכן
// ההמרה לשעון ישראל היא הדבר היחיד שמייצר את השעה שהלקוח באמת בחר.
//
// אותו אזור זמן שהבקאנד עובד בו לכל אורכו (ikar-backend/lib/orderingWindow.js).
// הסיומת .js מכוונת: בלעדיה Node מסרב לפתור את הנתיב (dayjs אינו מצהיר על
// subpath exports), והמודול לא ניתן להרצה ולבדיקה ישירה. Vite פותר את שתי
// הצורות, כך שאין לזה מחיר בבנייה — אל תסיר אותה כדי "להתאים" לשאר הפרויקט.
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const STORE_TZ = "Asia/Jerusalem";

/**
 * מפרק רגע לתאריך ולשעה בשעון החנות, לתצוגה דו-שורתית.
 * מחזיר null כשאין ערך או כשהוא פגום — dayjs אינו זורק על ערך לא תקין אלא
 * מחזיר "Invalid Date", והתצוגה הייתה מציגה את המחרוזת הזו למלקט.
 *
 * @returns {{date: string, time: string}|null}
 */
export const formatStoreDateTime = (value) => {
  if (!value) return null;
  const parsed = dayjs(value);
  if (!parsed.isValid()) return null;
  const inStore = parsed.tz(STORE_TZ);
  return { date: inStore.format("DD/MM"), time: inStore.format("HH:mm") };
};
