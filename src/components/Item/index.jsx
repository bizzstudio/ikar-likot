// meshek_Likut_system/src/components/Item/index.jsx
// מסך ליקוט מונחה פריט-אחר-פריט (אפיון "אפיון שינויים לתהליך ליקוט").
// עקרונות: מוצג פריט אחד בכל פעם, שדה ברקוד בפוקוס אוטומטי, כל סריקה תקינה +1
// והשלמת הכמות מקפיצה לפריט הבא, שדה כמות קבוע וריק מעל אזור הסריקה (למוצר ללא
// ברקוד / תיקון), חריגה מעל הכמות נחסמת, אפשר לדלג (הפריט חוזר בהמשך), ובאישור
// מיוחד לסמן בחוסר.
// שדה מספר הארגזים מוצג רק במסך הסיום. לוגיקת ה-handleDone נשמרה 1:1 מהגרסה הקודמת.
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { languageContext } from "../../App";
import "./style.css";
import { getWordString } from "../Language";
import BarcodeScanner from "../BarcodeScanner";
import BoxScanGate from "../BoxScanGate";
import {
  FaCheckCircle,
  FaBoxOpen,
  FaForward,
  FaBackward,
  FaListUl,
  FaExclamationTriangle,
  FaKeyboard,
} from "react-icons/fa";
import spinnerLoadingImage from "/spinner.gif";
import dayjs from "dayjs";
import loginImg from "/loginImg.svg";
import { playScanSuccess, playScanError } from "../../utils/soundFeedback";
import { useProductName, useDynamicTranslation } from "../../i18n/DynamicTranslation";
import {
  isWeighted,
  isLineFulfilled,
  formatWeight,
} from "../../utils/weightPricing";
import { sortCartByPickingOrder } from "../../utils/pickingOrder";
import {
  buildPickingGroups,
  distributeQuantity,
  groupPickedFrom,
  groupShortageFrom,
} from "../../utils/pickingGroups";

const API = import.meta.env.VITE_MAIN_SERVER_URL;

// Placeholder ניטרלי לתמונת מוצר חסרה/שבורה (מצבי קצה — "הצגת Placeholder").
// SVG מוטמע כדי שלא יהיה תלוי ברשת.
const IMG_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='#f3f4f6'/><g fill='none' stroke='#9ca3af' stroke-width='3'><circle cx='34' cy='34' r='7'/><path d='M18 72l22-24 14 16 10-10 14 14'/></g></svg>"
  );

// חלון השתקה לסריקת מצלמה חוזרת של **אותו** ברקוד (ms). המצלמה מפענחת מחדש כל
// ~600ms (SCANNER_LOCK_AFTER_SCAN_MS) כל עוד המדבקה בפריים, ולכן מוצר שנשאר מול
// העדשה מייצר זרם סריקות זהות. הזמן נמדד מ*הצפייה* האחרונה ולא מהספירה האחרונה,
// כך שהחסימה נמשכת כל עוד המוצר בפריים ומשתחררת רק אחרי שהוצא ממנו.
// משמש להשתקת רעש בלבד (צלילי שגיאה / רישומי scan-log כפולים); ההגנה על ספירת
// הכמות עצמה היא awaitingNextUnit.
const CAMERA_SAME_CODE_MUTE_MS = 1500;

// ערך מרבי שנחשב "כמות" בשדה הכמות. מעליו מדובר בברקוד שנקלט בטעות לתוך השדה
// (EAN-13/EAN-8 מייצרים מספרים בני 8–13 ספרות; כמות בהזמנת מזון לא מתקרבת לזה).
// ההשוואה על **הערך המספרי** ולא על אורך המחרוזת, כדי ש-"000005" ייקרא כ-5
// ולא ייחשב בטעות לברקוד בגלל אפסים מובילים.
const QTY_MAX_VALUE = 99999;

// נרמול ברקוד להשוואה — עקבי עם lib/normalizeBarcode בבקנד (בלי הסרת אפסים מובילים)
const normalizeBarcode = (v) =>
  String(v ?? "").trim().replace(/\s+/g, "").toUpperCase();
// מזהה **שורת עגלה** ולא מזהה מוצר. `_id` אינו ייחודי: מוצר עם ווריאנטים מייצר
// כמה שורות עם אותו `_id` ו-`id` שונה, ושורת מתנה נבנית מהמוצר עצמו ולכן חולקת
// את ה-`_id` של השורה הרגילה. במוצר ללא ווריאנטים `id === _id`, ולכן תואם לאחור.
//
// מכאן ואילך המסך עובד על **קבוצות ליקוט** ולא על שורות עגלה, ולכן ה-pid שמגיע
// לפונקציה הזו הוא מזהה השורה הראשית של הקבוצה. האיחוד עצמו הוא מכוון ומוגדר
// ב-utils/pickingGroups.js — הוא **אינו** קיפול בשוגג לפי `_id`: ווריאנטים
// נשארים נפרדים, והחלוקה בחזרה לשורות נעשית בסגירה.
const productIdStr = (item) => {
  const key = item?.id ?? item?._id;
  return key != null ? String(key) : null;
};

// הודעות השרת מגיעות כ-{he, en}. ערכי השפה באפליקציה הם "hebrew"|"en"|"thai",
// ולכן גישה ישירה ב-message[language] מחזירה undefined ומדפיסה "[object Object]".
const serverMessage = (data, language) => {
  const msg = data?.message;
  if (!msg) return null;
  if (typeof msg === "string") return msg;
  return (language === "hebrew" ? msg.he : msg.en) || msg.he || msg.en || null;
};

// התאמה מול סט הברקודים של הפריט (ריבוי-ברקודים §6): item.barcodes מגיע מהשרת
// מועשר; נופלים חזרה לשדה הברקוד הבודד אם הסט חסר.
const itemMatchesBarcode = (item, scanned) => {
  if (!item || !scanned) return false;
  const set = new Set([
    ...(Array.isArray(item.barcodes) ? item.barcodes.map(normalizeBarcode) : []),
    ...(item.barcode ? [normalizeBarcode(item.barcode)] : []),
  ]);
  return set.has(scanned);
};

export default function Item({ setOrders, setUpdateOrders, setId }) {
  const numberOfOrder = useParams();
  const { language } = useContext(languageContext);
  const nav = useNavigate();
  const t = (key) => getWordString(language, key);
  // קוד השפה שמודול המשקל מכיר ("he"/"en"/"th") מול השם שהאפליקציה שומרת
  // ב-localStorage ("hebrew"/"en"/"thai"). בלי המיפוי מלקט תאילנדי היה מקבל
  // "กก." בעברית — formatWeight נופל לעברית על קוד שאינו מוכר.
  const weightLang = language === "thai" ? "th" : language === "en" ? "en" : "he";
  // שם מוצר בשפת המלקט (תרגום אוטומטי עם מטמון), ותעתיק שם הלקוח
  const productName = useProductName();
  const { tPerson } = useDynamicTranslation();

  const [order, setOrder] = useState();
  const [statuses, setStatuses] = useState([]);
  const [userText, setUserText] = useState("");
  const [numOfBoxes, setNumOfBoxes] = useState("");
  const [submiting, setSubmiting] = useState(false);
  // כשל ביצירת משימת המשלוח בליונוויל. ההזמנה כבר סגורה ומחויבת — אבל בלי
  // משלוח. כל עוד זה מלא, המלקט לא ממשיך הלאה ורואה באנר עם כפתור שליחה חוזרת.
  const [shipmentError, setShipmentError] = useState(null);
  const [resending, setResending] = useState(false);

  const [pickedQuantities, setPickedQuantities] = useState({}); // pid -> כמות שנלקטה בפועל
  const [shortageItems, setShortageItems] = useState({}); // pid -> true (סומן בחוסר)
  const [queue, setQueue] = useState([]); // סדר הפריטים — קבוע (ממוין לפי ברקוד), לא משתנה בניווט
  const [currentIndex, setCurrentIndex] = useState(0); // מצביע לפריט הנוכחי בתוך הרשימה הקבועה

  const [barcodeValue, setBarcodeValue] = useState("");
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', msg }
  const [showList, setShowList] = useState(false);
  const [shortageModal, setShortageModal] = useState(false);
  // שדה הכמות מוצג **תמיד** מעל אזור הסריקה. מתחיל ריק — אין כפתור שפותח אותו
  // ואין "0" מוקדם שצריך למחוק. אחרי סריקה בפריט שדורש יותר מיחידה אחת הוא
  // מתמלא בכמות שנסרקה עד כה (1, 2, ...) כדי שאפשר יהיה לתקן אותה ישירות.
  const [qtyValue, setQtyValue] = useState("");
  // הפוקוס בשדה הכמות חוסם קליטת סריקות: סורק החומרה "מקליד" לתוך האלמנט
  // הממוקד, ואסור גם לגזול את הפוקוס בזמן שהמלקט מקליד.
  // החסימה נקשרת לפוקוס בלבד ולא לקיום טקסט בשדה: כמות שהוקלדה ונזנחה בלי
  // אישור הייתה חוסמת כל סריקה **בשקט**, וזה נקרא כ"הסורק הפסיק לעבוד".
  // ה-state הזה משמש **רק** כטריגר לריצה חוזרת של אפקט הפוקוס. מקור האמת הוא
  // ה-DOM (isQtyFocused) — ראו ההסבר שם.
  const [qtyFocused, setQtyFocused] = useState(false);
  // שער בין-יחידתי למצב מצלמה: אחרי סריקה שהעלתה את הכמות ועדיין חסרות יחידות,
  // נדרש אישור אנושי מפורש לפני הסריקה הבאה. בלעדיו החזקת מוצר **אחד** מול
  // המצלמה מעלה את המונה לבדה עד הכמות הנדרשת — והכמות הזו היא הבסיס לחיוב
  // הלקוח. אותה חולשה כבר תוקנה בשער סריקת הארגזים (BoxScanGate).
  // רלוונטי אך ורק לסריקות מהמצלמה: בסורק חומרה כל לחיצת הדק היא סריקה מכוונת.
  const [awaitingNextUnit, setAwaitingNextUnit] = useState(false);
  // הצעת חוסר חלקי — נדלקת רק אחרי אישור כמות הקטנה מהנדרש: { pid, missing }
  const [shortagePrompt, setShortagePrompt] = useState(null);

  // הגדרה פר-מכשיר: האם למכשיר יש סורק חומרה. אם כן — לא מפעילים מצלמה ולא מציגים
  // preview (חוסך סוללה, שטח מסך ומונע האטה מלולאת עיבוד התמונה של המצלמה).
  const [hasScanner, setHasScanner] = useState(
    () => localStorage.getItem("likut_hasScanner") === "1"
  );
  const toggleScanner = () => {
    setHasScanner((prev) => {
      const next = !prev;
      localStorage.setItem("likut_hasScanner", next ? "1" : "0");
      return next;
    });
  };

  const barcodeInputRef = useRef(null);
  const qtyInputRef = useRef(null);

  // מקור האמת ל"האם הפוקוס בשדה הכמות" הוא ה-DOM ולא דגל state.
  // דגל state נתקע על true כששדה הכמות מוסר מה-DOM בזמן שהפוקוס בתוכו (הצעת
  // חוסר / מסך סיום), או כששדה הברקוד אינו מרונדר ולכן אין למי להעביר את
  // הפוקוס (שער היחידה הבאה) — React אינו משגר blur על אלמנט שהוסר, ואז
  // **כל סריקה נחסמת לצמיתות** והמלקט תקוע בלי דרך מובנת להשתחרר.
  // בדיקת activeElement לא יכולה להיתקע.
  const isQtyFocused = () =>
    !!qtyInputRef.current && document.activeElement === qtyInputRef.current;

  // סיום הזנת כמות: blur מפורש משדה הכמות (מסנכרן גם את qtyFocused), ואז
  // החזרת הפוקוס לשדה הברקוד אם הוא מרונדר, כדי שסורק החומרה ימשיך לעבוד.
  const endQtyEntry = () => {
    qtyInputRef.current?.blur();
    barcodeInputRef.current?.focus({ preventScroll: true });
  };

  const lastScanRef = useRef(0);
  // הברקוד האחרון שהמצלמה ראתה + מועד הצפייה האחרונה (ראו CAMERA_SAME_CODE_MUTE_MS)
  const lastCameraCodeRef = useRef({ code: "", at: 0 });
  // סימון שההזמנה כבר הושלמה (handleDone) — מונע מ-PATCH ההתקדמות ה-debounced
  // לרוץ אחרי הניווט ולהחיות מצב ישן. מחזיק גם את מזהה ה-timer לביטול מיידי.
  const completedRef = useRef(false);
  const progressTimerRef = useRef(null);
  // פרטי המלקט שסגר את ההזמנה — נשמרים לשליחה החוזרת של המשלוח, שמתרחשת
  // אחרי שה-scope של handleDone כבר הסתיים.
  const melaketRef = useRef(null);

  // ---- שליפת ההזמנה ----
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await axios.get(`${API}/app/orders/${numberOfOrder.id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        setOrder(response.data);
        // שחזור מצב "המשלוח נכשל" אחרי רענון דף / כניסה חוזרת: כשיש כשל שמור
        // ואין מזהה משימה, המשלוח עדיין חסר וההתראה חייבת לחזור — אחרת הכשל
        // נעלם ברגע שהמלקט מרענן, וההזמנה נשארת סגורה בלי שליח.
        // status === "error" בלבד: "disabled" פירושו שהאינטגרציה עצמה אינה מוגדרת
        // בשרת (אין מפתח) — זו לא תקלה שהמלקט יכול או צריך לפתור.
        const sh = response.data?.shipment;
        if (sh?.status === "error" && !sh?.taskId) setShipmentError(sh.lastError);
      } catch (error) {
        console.error("Error fetching order:", error);
        alert(t("orderNotFound"));
        nav("/items");
      }
    };
    if (numberOfOrder.id) fetchOrder();
  }, [numberOfOrder.id]);

  // מזהה ההזמנה עבור ההדר (לביטול ליקוט)
  useEffect(() => {
    if (numberOfOrder.id) setId(numberOfOrder.id);
  }, [numberOfOrder.id]);

  // ---- מצב השלמת חוסרים ----
  // הזמנה שסיימה ליקוט עם חוסרים המתינה בסטטוס "ממתין לחוסרים". אחרי שהמנהל הכריע
  // כל פריט במסך החוסרים היא חוזרת לכאן עם shortageHold.resolvedAt חתום. במצב הזה:
  //   1. חייבים לסרוק את ברקודי הארגזים לפני כל דבר אחר (BoxScanGate).
  //   2. התור מצומצם לפריטים שסומנו "החזרה להשלמת ליקוט" (repickItems) בלבד.
  //   3. הסיום קורא ל-finalize (חיוב + חשבונית + מדבקות סופיות) ולא ל-send-and-update.
  const isShortageCompletion = !!order?.shortageHold?.resolvedAt;
  const repickItems = useMemo(
    () => (isShortageCompletion ? (order?.repickItems || []).map(String) : []),
    [isShortageCompletion, order]
  );
  // הנחיה למלקט לפי הכרעת המנהל: אם הוחזר פריט לליקוט (repick) — יש ללקט את החסר;
  // אם כל החוסרים אושרו (approve/approve_hide, ואין repick) — רק לסרוק ארגזים ולסיים.
  const shortageCompletionMsg = repickItems.length > 0
    ? t("shortageCompletionRepick")
    : t("shortageCompletionApproved");
  const repickSet = useMemo(() => new Set(repickItems), [repickItems]);
  // "רצפה": הכמות שכבר נלקטה בסבב הראשון לפריט שהוחזר להשלמה (חוסר חלקי). נשמרת
  // בשרת ב-shortageHold.pickedQuantities. משמשת פעמיים: (1) לקזז מהכמות הנדרשת כך
  // שהמלקט ילקט רק את החסר ולא את הכל מחדש; (2) להוסיף בסגירה לכמות הכוללת שנשלחת
  // לשרת (הבסיס לחיוב). ריק לפריט שאינו repick / מחוץ למצב השלמה.
  // הרצפה נשמרת בשרת לפי **שורת עגלה**, ולכן בקבוצה מאוחדת היא סכום הרצפות של
  // כל השורות שבה — אחרת חצי ממה שכבר לוקט בסבב הראשון היה נדרש שוב.
  const floorOf = (pid) => {
    const memberPids = groupByPid[pid]?.members?.map((m) => m.pid) || [String(pid)];
    if (!memberPids.some((p) => repickSet.has(p))) return 0;
    return memberPids.reduce(
      (sum, p) => sum + (Number(order?.shortageHold?.pickedQuantities?.[p]) || 0),
      0
    );
  };
  // סריקת הארגזים מאומתת בשרת (boxScanVerifiedAt); boxScanDone מאפשר להמשיך מיד
  // אחרי אימות מוצלח בלי לרענן את ההזמנה מהשרת.
  const [boxScanDone, setBoxScanDone] = useState(false);
  const needsBoxScan = isShortageCompletion && !order?.boxScanVerifiedAt && !boxScanDone;

  // ---- מפות עזר ----
  // קבוצות ליקוט: שורות של **אותו מוצר פיזי** מאוחדות לשורה אחת עם סכום
  // הכמויות — מוצר שהוזמן בתשלום וגם ניתן כמתנה יורד מהמדף פעם אחת, וכל עוד
  // הוצג בשתי שורות המלקט עבר עליו פעמיים ושתיהן סומנו יחד. מפתח הקבוצה הוא
  // מזהה השורה הראשית, ולכן בקבוצה בת שורה אחת (המצב הרגיל) שום דבר לא זז.
  // ראו src/utils/pickingGroups.js.
  const groups = useMemo(() => buildPickingGroups(order?.cart || []), [order]);
  const groupByPid = useMemo(() => {
    const m = {};
    groups.forEach((g) => { m[g.key] = g; });
    return m;
  }, [groups]);
  // שורת התצוגה של הקבוצה: השורה הראשית עם הכמות המאוחדת. כל מי שקרא עד היום
  // cartByPid[pid] ממשיך לקבל שורת עגלה רגילה, פשוט עם הכמות הנכונה.
  const cartByPid = useMemo(() => {
    const m = {};
    groups.forEach((g) => { m[g.key] = g.item; });
    return m;
  }, [groups]);

  // הכמות הנדרשת. בהשלמת חוסרים לפריט repick מקזזים את מה שכבר נלקט (הרצפה), כך
  // שהמלקט מתבקש ללקט רק את הכמות החסרה (למשל 4 מתוך 9) ולא את כל הכמות מחדש.
  const reqOf = (pid) => Math.max(0, (cartByPid[pid]?.quantity || 0) - floorOf(pid));
  const pickedOf = (pid) => pickedQuantities[pid] || 0;

  /**
   * האם הפריט "טופל". במוצר רגיל זהה ל-picked >= req כמו תמיד.
   * במוצר שקיל שקילה שנפלה מעט מהמשקל שהוזמן (1.42 במקום 1.5) נחשבת טיפול
   * מלא ולא חוסר — אחרת כל פריט שקיל בכל הזמנה היה תוקע את המלקט על הפריט
   * ומייצר דיווח חוסרים על 80 גרם. הכלל בשרת זהה (lib/weightPricing.js),
   * ולכן מה שהמלקט רואה כ"טופל" הוא בדיוק מה שהשרת יראה כך.
   */
  const isPickedEnough = (pid, picked = pickedQuantities) =>
    isLineFulfilled(cartByPid[pid], reqOf(pid), picked[pid] || 0);
  const isDone = (pid) => !!shortageItems[pid] || isPickedEnough(pid);
  // האם הפריט נמכר לפי משקל — משנה את שדה הכמות ואת התנהגות הסריקה
  const isWeightedPid = (pid) => isWeighted(cartByPid[pid]);
  // כמות לתצוגה: משקל למוצר שקיל, מספר יחידות לכל היתר. כל מסך שמראה כמות
  // עובר דרך כאן, אחרת "1.42" בתור נקרא כ-1.42 יחידות.
  const qtyLabel = (pid, n) =>
    isWeightedPid(pid) ? formatWeight(n, weightLang) : String(n);

  // הפריט הנוכחי = הפריט במיקום המצביע, בתוך הרשימה הקבועה (queue לא משתנה בניווט)
  const currentPid =
    queue.length && currentIndex >= 0 && currentIndex < queue.length
      ? queue[currentIndex]
      : null;
  const currentItem = currentPid ? cartByPid[currentPid] : null;

  // מציאת המיקום של הפריט הבא שעדיין לא טופל (למעבר אוטומטי בהשלמה), עם גלישה מסביב.
  // מקבל doneFn מפורש כדי לעבוד עם ערכי state עדכניים לפני שה-render הבא התרחש.
  const findNextPendingIdx = (from, doneFn) => {
    const n = queue.length;
    if (n === 0) return 0;
    for (let s = 1; s <= n; s++) {
      const idx = (from + s) % n;
      if (!doneFn(queue[idx])) return idx;
    }
    return from; // הכל טופל — נשארים במקום
  };

  // "פריט" מכאן ואילך = קבוצת ליקוט, לא שורת עגלה: זו יחידת העבודה של המלקט,
  // ולכן גם יחידת הספירה במוני ההתקדמות ובחיפוש הברקוד.
  const allItems = useMemo(() => groups.map((g) => g.item), [groups]);
  // מוני ההתקדמות מתייחסים לפריטים שבתור בפועל. בהשלמת חוסרים התור מצומצם
  // לפריטים שהוחזרו לליקוט בלבד, ולכן ספירה על כל העגלה הייתה מציגה למלקט
  // "פריט 1 מתוך 23" כשיש לו בפועל 2 פריטים לטפל בהם.
  const queueItems = useMemo(() => {
    if (!queue.length) return allItems;
    return queue.map((pid) => cartByPid[pid]).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, cartByPid, order]);
  // allHandled נשאר מבוסס-עגלה במכוון: אסור לסגור הזמנה כל עוד קיים פריט
  // כלשהו שלא טופל, גם אם הוא מחוץ לתור הנוכחי.
  const doneCount = allItems.filter((it) => isDone(productIdStr(it))).length;
  // "לוקטו" = פריטים שנלקטו בפועל בלבד. פריט שדווח בחוסר טופל אך לא נלקט,
  // ולכן נספר בנפרד ("בחוסר") ולא מנופח את מונה הליקוט.
  const shortageCount = allItems.filter((it) => !!shortageItems[productIdStr(it)]).length;
  const pickedCount = allItems.filter((it) => {
    const pid = productIdStr(it);
    return !shortageItems[pid] && isPickedEnough(pid) && reqOf(pid) > 0;
  }).length;
  const totalCount = allItems.length;
  const allHandled = totalCount > 0 && doneCount === totalCount;

  // מוני התצוגה — מבוססי-תור, כדי שהמספרים שהמלקט רואה יתארו את מה שיש לו לעשות
  const queueTotal = queueItems.length;
  const queueDone = queueItems.filter((it) => isDone(productIdStr(it))).length;

  // ---- אתחול רשימה קבועה, כמויות ומיקום המצביע (מהשרת או מ-sessionStorage) ----
  useEffect(() => {
    if (!order?.cart) return;
    const id = numberOfOrder.id;

    // סדר תצוגה קבוע: **לפי סדר הליקוט של המוצר** (likutOrder), כלומר לפי סדר
    // המדפים בחנות — src/utils/pickingOrder.js. קודם לכן המיון היה לפי ברקוד,
    // מספר שאין לו שום קשר למיקום הפיזי, והמלקטת הלכה הלוך ושוב בין המדפים.
    // הברקוד נשאר שובר-השוויון, ולכן הסדר עדיין דטרמיניסטי: זהה בכל טעינה ובכל
    // מכשיר, וזה תנאי לכך שהמצביע השמור (currentIndex) יצביע על אותו פריט.
    let stableOrder = sortCartByPickingOrder(allItems)
      .map((it) => productIdStr(it))
      .filter(Boolean);

    // במצב השלמת חוסרים מציגים אך ורק את הפריטים שהמנהל סימן "החזרה להשלמת ליקוט".
    // כל השאר כבר לוקטו או שהחוסר בהם אושר — אין מה לעשות איתם.
    // repickItems הם מזהי **שורות עגלה**; קבוצה נכנסת לתור אם ולו אחת מהשורות
    // שלה הוחזרה לליקוט.
    if (isShortageCompletion && repickItems.length > 0) {
      stableOrder = stableOrder.filter((pid) =>
        (groupByPid[pid]?.members || []).some((m) => repickItems.includes(m.pid))
      );
    }

    // מקור אמת ראשון: התקדמות שנשמרה בשרת (המשך מאותו מצב גם בין מכשירים);
    // נפילה חזרה ל-sessionStorage המקומי.
    const sp = order.likutProgress;
    let picked, short, boxes, savedIdx;
    if (sp && typeof sp === "object") {
      picked = sp.pickedQuantities || {};
      short = sp.shortageItems || {};
      boxes = sp.numOfBoxes;
      savedIdx = Number.isInteger(sp.currentIndex) ? sp.currentIndex : null;
    } else {
      picked = safeParse(sessionStorage.getItem(`pickedQuantities_${id}`)) || {};
      short = safeParse(sessionStorage.getItem(`shortageItems_${id}`)) || {};
      boxes = null;
      const si = safeParse(sessionStorage.getItem(`currentIndex_${id}`));
      savedIdx = Number.isInteger(si) ? si : null;
    }

    // המפות שנקראו זה עתה ממופתחות לפי **קבוצה** (המסך שמר אותן) או לפי
    // **שורת עגלה** (השרת כתב אותן ב-send-and-update). ההמרה לקבוצות מכסה את
    // שני המקרים ומשמיטה מפתחות של שורות שאינן בעגלה עוד.
    picked = Object.fromEntries(
      groups
        .map((g) => [g.key, groupPickedFrom(picked, g)])
        // רק מה שנלקט בפועל, כמו קודם: מפה שמכילה 0 לכל שורה נקראת באדמין
        // כ"השורה כבר טופלה" (likutProgressView בודק נוכחות מפתח).
        .filter(([, qty]) => qty > 0)
    );
    short = Object.fromEntries(
      groups.filter((g) => groupShortageFrom(short, g)).map((g) => [g.key, true])
    );

    // פריט שהוחזר להשלמת ליקוט סומן בחוסר בסבב הקודם. אם נשאיר את הסימון —
    // isDone יחזיר עליו true, הוא ייחשב "טופל" ומסך הסיום ייפתח מיד בלי ללקט אותו.
    if (isShortageCompletion && repickItems.length > 0) {
      short = { ...short };
      const isRepickGroup = (pid) =>
        (groupByPid[pid]?.members || []).some((m) => repickSet.has(m.pid));
      stableOrder.filter(isRepickGroup).forEach((pid) => delete short[pid]);
      // בכניסה ראשונה להשלמה (טרם נסרקו הארגזים) מאפסים את מונה הליקוט של פריטי
      // ה-repick ל-0, כדי שהמלקט ילקט רק את הכמות החסרה (reqOf כבר מקזז את הרצפה,
      // והרצפה תתווסף בחזרה בסגירה). אחרי סריקת הארגזים (boxScanVerifiedAt חתום)
      // שומרים את ההתקדמות מ-likutProgress כדי לא לאבד ליקוט חלקי אם המלקט רענן/
      // יצא וחזר באמצע ההשלמה. הרצפה עצמה נשמרת בשרת (shortageHold) ואינה נדרסת.
      if (!order.boxScanVerifiedAt) {
        picked = { ...picked };
        stableOrder.filter(isRepickGroup).forEach((pid) => { picked[pid] = 0; });
      }
    }

    setPickedQuantities(picked);
    setShortageItems(short);
    // במצב השלמה שואלים שוב על מספר הארגזים (לפי האפיון) — לא ממלאים מראש
    // את הערך הקודם, כדי שהמלקט יאשר במפורש כמה ארגזים יוצאים בפועל.
    if (boxes != null && !isShortageCompletion) setNumOfBoxes(String(boxes));
    setQueue(stableOrder);

    // מיקום התחלתי: המשך מהמיקום השמור, אחרת הפריט הראשון שעדיין לא טופל.
    const reqMap = {};
    groups.forEach((g) => { reqMap[g.key] = g.item.quantity || 0; });
    const doneFn = (pid) =>
      !!short[pid] || isLineFulfilled(cartByPid[pid], reqMap[pid] || 0, picked[pid] || 0);
    let startIdx = 0;
    // במצב השלמה התור צומצם, ולכן המצביע השמור מהסבב הקודם אינו רלוונטי —
    // מתחילים מהפריט הראשון שטרם הושלם.
    if (isShortageCompletion) {
      const fp = stableOrder.findIndex((pid) => !doneFn(pid));
      startIdx = fp >= 0 ? fp : 0;
    } else if (
      savedIdx != null &&
      savedIdx >= 0 &&
      savedIdx < stableOrder.length &&
      // המצביע השמור מכובד רק אם הוא מצביע על פריט שטרם טופל. הוא נשמר כמספר
      // מקום בתור, ולכן כל שינוי בסדר התור מזיז אותו לפריט אחר — למשל מלקטת
      // שהייתה באמצע הזמנה כשעודכן סדר הליקוט של מוצר, או כשהמיון עצמו שונה.
      // הכמויות שנלקטו נשמרות לפי מזהה מוצר ולא לפי מקום, כך שלא אובד דבר; מה
      // שנמנע כאן הוא חזרה לפריט שכבר לוקט במקום להמשיך מהמקום שנעצר.
      !doneFn(stableOrder[savedIdx])
    ) {
      startIdx = savedIdx;
    } else {
      const fp = stableOrder.findIndex((pid) => !doneFn(pid));
      startIdx = fp >= 0 ? fp : 0;
    }
    setCurrentIndex(startIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  // שמירת התקדמות לשרת (debounced) בכל שינוי — מאפשר המשך מאותו מצב אחרי סגירה/החלפת מכשיר
  useEffect(() => {
    if (!order?._id) return;
    if (completedRef.current) return; // ההזמנה כבר הושלמה — לא לשמור מצב ישן
    const timer = setTimeout(() => {
      if (completedRef.current) return; // נבדק שוב ברגע הירי — למקרה שהושלמה בינתיים
      // numOfBoxes נשלח רק כשיש בו ערך אמיתי. במצב השלמת חוסרים השדה מתחיל ריק
      // (שואלים שוב), וה-PATCH הראשון היה כותב numOfBoxes:"" ומוחק את מספר
      // הארגזים שנשמר בסבב הראשון — המספר שעליו מבוסס אימות סריקת הארגזים.
      // ההתקדמות נשלחת לשרת לפי **שורת עגלה** ולא לפי קבוצת ליקוט: מסך ההזמנה
      // באדמין מציג ליקוט חי שורה-שורה (utils/likutProgressView.js), ומפה
      // ממופתחת-קבוצה הייתה מציגה שם שורת מתנה כאילו לא לוקטה עד סגירת ההזמנה.
      // הקריאה חזרה מכוסה משני הכיוונים (groupPickedFrom).
      const perLinePicked = {};
      const perLineShortage = {};
      groups.forEach((g) => {
        const split = distributeQuantity(g, pickedQuantities[g.key] || 0);
        Object.entries(split).forEach(([pid, qty]) => {
          if (qty > 0) perLinePicked[pid] = qty;
        });
        // חוסר מסומן רק על השורות שנשארו חסרות אחרי החלוקה, ולא על כל שורות
        // הקבוצה: בקבוצה מאוחדת שלוקטה חלקית (השורה בתשלום מלאה, המתנה ריקה)
        // סימון גורף היה מציג באדמין את השורה בתשלום כ"בחוסר" עם חוסר 0.
        // זו גם בדיוק ההכרעה שהשרת יגיע אליה בסגירה מתוך pickedItems
        // (isLineFulfilled פר-שורה), כך שהתצוגה החיה והתמונה הסופית מסכימות.
        if (shortageItems[g.key]) {
          const short = g.members.filter(
            (m) => !isLineFulfilled(g.item, m.quantity, split[m.pid] || 0)
          );
          // אם אחרי החלוקה אף שורה אינה חסרה (המלקט סימן בחוסר פריט שכבר לוקט
          // במלואו), הסימון נרשם על השורה הראשית — אחרת הוא היה נעלם בכניסה
          // חוזרת למסך, כלומר פעולה מפורשת של המלקט שנמחקת בשקט.
          (short.length ? short : [{ pid: g.key }]).forEach((m) => {
            perLineShortage[m.pid] = true;
          });
        }
      });
      const progress = {
        pickedQuantities: perLinePicked,
        shortageItems: perLineShortage,
        queue,
        currentIndex,
      };
      const boxes = parseInt(numOfBoxes, 10);
      if (Number.isFinite(boxes) && boxes > 0) progress.numOfBoxes = boxes;

      axios
        .patch(
          `${API}/app/orders/${numberOfOrder.id}/progress`,
          { progress },
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        )
        .catch(() => {});
    }, 800);
    progressTimerRef.current = timer;
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedQuantities, shortageItems, queue, numOfBoxes, currentIndex, groups]);

  // הערת לקוח (בעברית כמו שהיא; שאר השפות — הטקסט המקורי, ללא תרגום חיצוני חוסם)
  useEffect(() => {
    if (order) setUserText(order.customer_note || "");
  }, [order]);

  // ---- נעילת ההזמנה למלקט ----
  useEffect(() => {
    if (!order) return;
    // אם ההזמנה כבר בסטטוס Likut ונעולה למלקט הנוכחי — אין צורך לנעול שוב
    // (קריאה כזו הייתה מחזירה 400 "כבר בליקוט" ורק מייצרת רעש).
    const ownerId = order.actualMelaket?._id ?? order.actualMelaket;
    const alreadyMine =
      order.status?.name === "Likut" &&
      ownerId &&
      String(ownerId) === String(localStorage.melaketId);
    if (alreadyMine) return;
    axios
      .put(`${API}/app/orders/${order._id}`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        params: { status: "Likut" },
      })
      .catch((err) => {
        // 409 = ההזמנה נעולה למישהו אחר / ממתינה לחוסרים / כבר בליקוט. השרת מנסח
        // את הסיבה — מציגים אותה כמו שהיא במקום לנחש. סדר הבדיקות הפוך מבעבר:
        // ההשוואה הישנה (ObjectId מול מחרוזת, בלי String()) הייתה כמעט תמיד אמת
        // ובלעה את ענף ה-409 עם הודעה גנרית + reload מיותר.
        if (err.response?.status === 409) {
          alert(serverMessage(err.response.data, language) || t("alreadyTaken"));
          nav("/items");
          return;
        }
        const ownerNow = order.actualMelaket?._id ?? order.actualMelaket;
        if (String(ownerNow ?? "") !== String(localStorage.melaketId ?? "")) {
          alert(t("alreadyTaken"));
          nav("/items");
          window.location.reload();
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  // ---- כל הסטטוסים (למלקטים) ----
  useEffect(() => {
    axios
      .get(`${API}/app/orders/status/getAll`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      .then((res) => setStatuses(res.data))
      .catch((e) => console.error(e));
  }, []);

  // פוקוס אוטומטי על שדה הברקוד (לסורק חומרה) בכל מעבר פריט / סגירת מודל
  useEffect(() => {
    // needsBoxScan: שער סריקת הארגזים מנהל פוקוס משלו — אסור לגזול לו אותו.
    // awaitingNextUnit חייב להיות גם בתלויות ולא רק בתנאי: השער מסיר את שדה
    // הקלט מה-DOM, ובלי הרצה חוזרת אחרי סגירתו הסורק היה מאבד פוקוס.
    if (!showList && !shortageModal && !isQtyFocused() && !shortagePrompt && !allHandled && !needsBoxScan && !awaitingNextUnit) {
      const el = barcodeInputRef.current;
      // preventScroll: מחזיק פוקוס לסורק החומרה בלי לגלול את הדף מטה בטעינה
      // (אחרת הדפדפן גולל את שדה הברקוד לתצוגה ומסתיר את הלוגו/תמונה/תיאור).
      // ה-cleanup חובה: בלעדיו טיימר שנקבע רגע לפני שהמלקט נגע בשדה הכמות היה
      // יורה 60ms אחר כך וגוזל לו את הפוקוס באמצע ההקלדה.
      if (el) {
        const timer = setTimeout(() => el.focus({ preventScroll: true }), 60);
        return () => clearTimeout(timer);
      }
    }
    // qtyFocused בתלויות במכוון: הוא הטריגר לריצה חוזרת ביציאה משדה הכמות, כדי
    // שהפוקוס יחזור לשדה הברקוד ולא ישאיר את סורק החומרה "מנותק". הבדיקה עצמה
    // נעשית מול ה-DOM (isQtyFocused) ולכן דגל תקוע אינו יכול לחסום את השחזור.
  }, [currentPid, showList, shortageModal, qtyFocused, shortagePrompt, allHandled, hasScanner, needsBoxScan, awaitingNextUnit]);

  // הצעת החוסר החלקי שייכת לפריט הנוכחי בלבד — מתאפסת בכל מעבר פריט.
  // גם שער היחידה הבאה והשתקת המצלמה שייכים לפריט הקודם ומתאפסים איתו, אחרת
  // המלקט היה נוחת על פריט חדש עם שער פתוח שאין לו שום קשר אליו.
  // שדה הכמות מתאפס איתם: כמות ששייכת לפריט אחד לעולם לא תיגרר לפריט הבא.
  useEffect(() => {
    setShortagePrompt(null);
    setAwaitingNextUnit(false);
    setQtyValue("");
    lastCameraCodeRef.current = { code: "", at: 0 };
  }, [currentPid]);

  // ניקוי חיווי אחרי זמן קצר (מספיק להבין, בלי לחסום עבודה)
  useEffect(() => {
    if (!feedback) return;
    const ms = feedback.type === "success" ? 900 : 2000;
    const timer = setTimeout(() => setFeedback(null), ms);
    return () => clearTimeout(timer);
  }, [feedback]);

  // ---- שמירה מתמשכת ----
  const persistPicked = (next) => {
    setPickedQuantities(next);
    sessionStorage.setItem(`pickedQuantities_${numberOfOrder.id}`, JSON.stringify(next));
  };
  const persistShortage = (next) => {
    setShortageItems(next);
    sessionStorage.setItem(`shortageItems_${numberOfOrder.id}`, JSON.stringify(next));
  };
  const persistIndex = (idx) => {
    setCurrentIndex(idx);
    sessionStorage.setItem(`currentIndex_${numberOfOrder.id}`, String(idx));
  };

  // ---- תיעוד סריקה (fire-and-forget; לא חוסם אם ה-endpoint עדיין לא קיים) ----
  const logScan = (result, product, barcode, quantityAfter) => {
    try {
      axios
        .post(
          `${API}/app/scan-logs`,
          { order: order?._id, product, barcode, result, quantityAfter },
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        )
        .catch(() => {});
    } catch (_) {}
  };

  const flashError = (msg) => {
    setFeedback({ type: "error", msg });
    playScanError();
  };

  // ---- טיפול בסריקה מול הפריט הנוכחי ----
  // fromCamera  — פענוח מתמשך של המצלמה (להבדיל מסורק חומרה / הקלדה ידנית).
  // fromQtyField — הברקוד נקלט בטעות בתוך שדה הכמות ומנותב לכאן במפורש, ולכן
  //                אסור לחסום אותו על סמך isQtyFocused (שהוא אמת בדיוק ברגע הזה).
  const handleBarcode = (raw, { fromCamera = false, fromQtyField = false } = {}) => {
    // אין קליטת סריקה בזמן הזנת כמות/מודל/הצעת חוסר/המתנה לאישור היחידה הבאה
    if ((isQtyFocused() && !fromQtyField) || shortageModal || shortagePrompt || awaitingNextUnit) return;
    const scanned = normalizeBarcode(raw);
    if (!scanned) return;
    const now = Date.now();

    // מצלמה: אותו ברקוד שנשאר בפריים מפוענח שוב ושוב. משתיקים בשקט (בלי צליל
    // שגיאה ובלי רישום) עד שהוא יוצא מהפריים. הזמן מתעדכן בכל צפייה, גם חסומה.
    if (fromCamera) {
      const seen = lastCameraCodeRef.current;
      if (seen.code === scanned && now - seen.at < CAMERA_SAME_CODE_MUTE_MS) {
        seen.at = now;
        return;
      }
      lastCameraCodeRef.current = { code: scanned, at: now };
    }

    // מניעת קליטה כפולה מהירה
    if (now - lastScanRef.current < 400) return;
    lastScanRef.current = now;

    if (!currentItem) return;
    const cur = pickedOf(currentPid);

    const matchesCurrent = itemMatchesBarcode(currentItem, scanned);
    if (matchesCurrent) {
      const req = reqOf(currentPid);

      // ---- מוצר שקיל: סריקה אינה +1 ----
      // אין כאן "יחידה" להוסיף — הכמות היא ק"ג. הסריקה מאשרת שזה הפריט הנכון
      // ומעבירה את המלקט לשקילה. בלי זה סריקה של שקית עגבניות הייתה מדווחת
      // "1 ק"ג נלקט" בלי ששקלו כלום.
      //
      // השדה נשאר **ריק** בכוונה, והמשקל שהוזמן מוצג רק בהודעה. מילוי מראש של
      // המשקל שהוזמן היה הופך את "Enter" לדרך מהירה לאשר משקל שאיש לא שקל —
      // והלקוח מחויב על 1.5 ק"ג שקיבל מהם 1.3. שדה ריק נכשל סגור: Enter עליו
      // מבטל (ראו confirmQty), הפריט נשאר פתוח, וההזמנה לא תיסגר בלי טיפול בו.
      if (isWeightedPid(currentPid)) {
        playScanSuccess();
        logScan("valid", currentItem._id, scanned, cur);
        setQtyValue("");
        setFeedback({ type: "success", msg: `${t("weighPrompt")} ${formatWeight(req, weightLang)}` });
        // פוקוס אוטומטי מוצדק כאן דווקא (בניגוד להערה בסריקה הרגילה): הפעולה
        // הבאה של המלקט היא בוודאות הקלדת משקל, ולא סריקה של הפריט הבא.
        setTimeout(() => qtyInputRef.current?.focus(), 0);
        return;
      }

      // חריגה מעל הכמות הנדרשת נחסמת (הפריט כבר הושלם)
      if (cur >= req) {
        flashError(t("overQuantityMsg"));
        logScan("over_quantity", currentItem._id, scanned, cur);
        return;
      }
      // סריקה תקינה → +1 אוטומטית, בלי אישור. המלקט פשוט סורק.
      const next = cur + 1;
      const nextPicked = { ...pickedQuantities, [currentPid]: next };
      persistPicked(nextPicked);
      playScanSuccess();
      logScan("valid", currentItem._id, scanned, next);
      if (next >= req) {
        // הושלמה הכמות הנדרשת → מעבר אוטומטי לפריט הבא שעדיין לא טופל.
        // שדה הכמות מתאפס כדי שהפריט הבא יתחיל נקי (גם אפקט currentPid מנקה).
        setQtyValue("");
        const doneFn = (p) => !!shortageItems[p] || isPickedEnough(p, nextPicked);
        persistIndex(findNextPendingIdx(currentIndex, doneFn));
        setFeedback(null);
      } else {
        // הפריט דורש יותר מיחידה אחת ועוד חסרות יחידות → ממלאים בשדה הכמות את
        // מה שנסרק עד כה (למשל "1"), כדי שאפשר יהיה פשוט לתקן אותו לכמות
        // הסופית ולאשר במקום לסרוק כל יחידה בנפרד. השדה **לא** נכנס לפוקוס:
        // פוקוס אוטומטי היה מפנה אליו את הקלדת סורק החומרה.
        setQtyValue(String(next));
        // "2 מתוך 5" ולא "2/5": ה-feedback מוצג כמחרוזת בתוך פסקה RTL, ותו "/"
        // ניטרלי מבחינת כיווניות (אותה מלכודת שכבר תועדה במונה הארגזים).
        setFeedback({
          type: "success",
          msg: `${t("scanValidMsg")} — ${next} ${t("ofWord")} ${req}`,
        });
        // עוד חסרות יחידות ובמצב מצלמה — עוצרים עד אישור אנושי (ראו awaitingNextUnit)
        if (fromCamera) setAwaitingNextUnit(true);
      }
      return;
    }

    // האם הברקוד שייך לפריט אחר בהזמנה?
    const other = allItems.find((i) => itemMatchesBarcode(i, scanned));
    const expectedName = itemName(currentItem); // שם הפריט הצפוי (§3.6)
    if (other) {
      const otherName = itemName(other);
      flashError(`${t("scanWrongItem")}: ${otherName || ""} — ${t("expectedItem")}: ${expectedName}`);
      logScan("invalid", other._id, scanned, pickedOf(productIdStr(other)));
    } else {
      flashError(`${t("productNotInOrder")} — ${t("expectedItem")}: ${expectedName}`);
      logScan("invalid", null, scanned, null);
    }
  };

  const submitBarcodeField = () => {
    const val = barcodeValue;
    setBarcodeValue("");
    handleBarcode(val);
  };

  const handleCameraScan = (barcode) => {
    handleBarcode(barcode, { fromCamera: true });
  };

  // Enter בשדה הכמות. מקרה נפוץ עכשיו כששדה הכמות קבוע על המסך: הפוקוס נמצא בו
  // והמלקט לוחץ על הדק הסורק — סורק החומרה "מקליד" את הברקוד לתוך השדה ומסיים
  // ב-Enter. מספר באורך ברקוד אינו כמות סבירה (ובוודאי חורג מהנדרש), ולכן
  // מנתבים אותו לטיפול בסריקה במקום להקפיץ "הכמות חורגת מהנדרש".
  const submitQtyField = () => {
    const raw = String(qtyValue).trim();
    if (raw !== "" && Number(raw) > QTY_MAX_VALUE) {
      setQtyValue("");
      handleBarcode(raw, { fromQtyField: true });
      endQtyEntry();
      return;
    }
    confirmQty();
  };

  // אישור אנושי מפורש שהמלקט עבר ליחידה הבאה. מאפס גם את השתקת המצלמה, אחרת
  // היחידה הבאה (אותו ברקוד בדיוק) הייתה מושתקת ולא נספרת.
  const confirmNextUnit = () => {
    lastCameraCodeRef.current = { code: "", at: 0 };
    setAwaitingNextUnit(false);
  };

  // ---- הבא: מעבר לפריט הבא ברשימה הקבועה (חץ קדימה) — לא משנה את סדר הרשימה ----
  const goNext = () => {
    if (queue.length < 2) return;
    setQtyValue(""); // מנקים כמות שהוקלדה ולא אושרה כדי שלא תחול על פריט אחר
    persistIndex((currentIndex + 1) % queue.length);
    setFeedback(null);
  };

  // ---- קודם: מעבר לפריט הקודם ברשימה הקבועה (חץ אחורה) — לא משנה את סדר הרשימה ----
  const goPrev = () => {
    if (queue.length < 2) return;
    setQtyValue("");
    persistIndex((currentIndex - 1 + queue.length) % queue.length);
    setFeedback(null);
  };

  // ---- קפיצה לפריט מתוך הרשימה המלאה — רק מזיז את המצביע, בלי לשנות את סדר הרשימה ----
  const jumpToItem = (pid) => {
    const idx = queue.indexOf(pid);
    if (idx < 0) return;
    setQtyValue("");
    persistIndex(idx);
    setShowList(false);
  };

  // ---- אישור הכמות שהוקלדה בשדה הקבוע ----
  // אין כאן "פתיחה" של שדה: השדה קיים תמיד, ריק, מעל אזור הסריקה.
  const confirmQty = () => {
    if (!currentPid) return;
    const pid = currentPid;
    const req = reqOf(pid);
    const weighed = isWeightedPid(pid);
    // מוצר שקיל — משקל בק"ג, ולכן Number ולא parseInt. parseInt כאן היה הופך
    // את 1.42 שנקרא מהמאזניים ל-1 בשקט, ומחייב את הלקוח על 1 ק"ג בלבד.
    //
    // השדה הריק מטופל **במפורש** ולא דרך Number: Number("") הוא 0, כלומר
    // Enter על שדה ריק היה נרשם כ"נשקלו 0 ק"ג" — דיווח חוסר מלא על פריט
    // שהמלקט רק דילג עליו. parseInt("") מחזיר NaN ולכן במוצר רגיל זה תמיד
    // היה ביטול, וזו ההתנהגות שחייבת להישמר גם כאן.
    const rawQty = String(qtyValue).trim();
    const val = weighed ? (rawQty === "" ? NaN : Number(rawQty)) : parseInt(rawQty, 10);
    if (!Number.isFinite(val) || val < 0) {
      setQtyValue(""); // ריק/לא תקין → ביטול בלי שינוי
      return;
    }
    // חריגה מעבר לנדרש נחסמת (מצב קצה)
    if (val > req) {
      flashError(t("manualQtyOver"));
      return;
    }
    const nextPicked = { ...pickedQuantities, [pid]: val };
    persistPicked(nextPicked);
    logScan("manual", currentItem?._id, currentItem?.barcode, val);
    setQtyValue("");
    // יציאה מפורשת משדה הכמות: אחרי Enter הפוקוס נשאר בו, והסריקה הבאה של סורק
    // החומרה הייתה נוחתת שוב בתוכו. blur מפורש (ולא רק focus על שדה הברקוד)
    // חיוני כי שדה הברקוד אינו מרונדר בזמן שער היחידה הבאה.
    endQtyEntry();
    // הזנת כמות היא פעולה אנושית מפורשת — היא מייתרת את שער היחידה הבאה
    confirmNextUnit();
    setFeedback(null);
    // "הושלם" עובר דרך אותו כלל של השרת: במוצר שקיל שקילה שנפלה מעט מהמשקל
    // שהוזמן היא שקילה רגילה ולא חוסר, ולכן לא נפתחת הצעת החוסר.
    if (isLineFulfilled(cartByPid[pid], req, val)) {
      // הגיע לכמות הנדרשת → מעבר אוטומטי לפריט הבא שעדיין לא טופל
      const doneFn = (p) => !!shortageItems[p] || isPickedEnough(p, nextPicked);
      persistIndex(findNextPendingIdx(currentIndex, doneFn));
    } else {
      // כמות חלקית → מציגים הצעה לסמן את היתרה בחוסר (מופיע רק אחרי אישור)
      setShortagePrompt({ pid, missing: req - val, weighed });
    }
  };

  // ---- חוסר חלקי: לוקטה כמות חלקית (למשל 6 מתוך 10) והיתרה חסרה במלאי ----
  // מופעל מכפתור "סמן בחוסר" בהצעה שנפתחת אחרי אישור כמות חלקית. הכמות שנלקטה
  // כבר נשמרה ב-confirmQty; כאן מסמנים את הפריט בחוסר (כדי שייחשב "מטופל" ותצא
  // זיכוי על היתרה מהשרת), מתעדים לבקרה, ועוברים לפריט הבא.
  const confirmPartialShortage = () => {
    if (!shortagePrompt) return;
    const pid = shortagePrompt.pid;
    const item = cartByPid[pid];
    const nextShort = { ...shortageItems, [pid]: true };
    persistShortage(nextShort);
    logScan("shortage", item?._id, item?.barcode, pickedOf(pid));
    const doneFn = (p) => !!nextShort[p] || isPickedEnough(p);
    persistIndex(findNextPendingIdx(currentIndex, doneFn));
    setShortagePrompt(null);
    setFeedback(null);
  };

  // ---- סימון בחוסר (המלקט מאשר לבד; הפעולה נרשמת לבקרה) ----
  const openShortage = () => {
    setQtyValue(""); // מנקים כמות שהוקלדה ולא אושרה
    confirmNextUnit(); // סימון בחוסר מייתר את ההמתנה ליחידה הבאה
    setShortageModal(true);
  };
  const confirmShortage = () => {
    if (!currentPid) return;
    const pid = currentPid;
    const nextShort = { ...shortageItems, [pid]: true };
    persistShortage(nextShort);
    // תיעוד: מי (מהטוקן בשרת), מתי, איזה פריט
    logScan("shortage", currentItem?._id, currentItem?.barcode, pickedOf(pid));
    // הפריט טופל (חוסר) → מעבר אוטומטי לפריט הבא שעדיין לא טופל
    const doneFn = (p) => !!nextShort[p] || isPickedEnough(p);
    persistIndex(findNextPendingIdx(currentIndex, doneFn));
    setShortageModal(false);
    setFeedback(null);
  };

  // ---- התראות הסיום + חזרה לרשימה ----
  // הופרד מ-handleDone כדי שגם השליחה החוזרת של המשלוח תסיים באותו מסלול בדיוק
  // (הודעת ווטסאפ ללקוח עם קישור המעקב + מייל לצוות), ולא רק בסגירה הראשונה.
  const notifyAndLeave = ({ trackingLink, melaket }) => {
    // אחרי רענון דף melaketRef ריק (המצב שוחזר מה-DB ולא מ-handleDone) — נופלים
    // חזרה למלקט המחובר, אחרת ההודעה ללקוח תצא בלי שם וטלפון של מי שליקט.
    const melaketInfo =
      melaket || statuses.find((s) => s._id === localStorage.getItem("melaketId"));
    const orderReadyPayload = {
      date: order.createdAt,
      userFirstName: order?.user_info?.name,
      userLastName: order?.user_info?.lastName,
      userPhone: order?.user_info?.contact,
      orderInvoice: order.invoice,
      total: order.total,
      shipping: order.shippingCost,
      notes: userText,
      melaketName: melaketInfo?.heName,
      melaketPhone: melaketInfo?.phone,
      tracking_link: trackingLink,
    };
    const kirshnerBase = import.meta.env.VITE_KIRSHNER_WHATSAPP_SERVER_URL;
    const kirshnerHeaders = {
      headers: { "x-api-key": import.meta.env.VITE_KIRSHNER_WHATSAPP_API_KEY },
    };
    const appAuthHeaders = {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    };
    // בונים את משימות ההתראה. הודעת ה-WhatsApp ללקוח נשלחת רק אם כתובת שרת
    // הוואטסאפ מוגדרת (VITE_KIRSHNER_WHATSAPP_SERVER_URL) — אחרת מדלגים עליה
    // במקום לפנות לכתובת שגויה (שהחזירה 405) ולהקפיץ התראת שגיאה מיותרת.
    const notifyTasks = [];
    if (kirshnerBase) {
      notifyTasks.push(
        axios.post(`${kirshnerBase}/send-order-ready`, orderReadyPayload, kirshnerHeaders)
      );
    } else {
      console.warn(
        "VITE_KIRSHNER_WHATSAPP_SERVER_URL is not configured — skipping customer WhatsApp notification"
      );
    }
    notifyTasks.push(
      axios.post(`${API}/app/orders/send-order-ready-email`, orderReadyPayload, appAuthHeaders)
    );
    // התראות ללקוח (וואטסאפ) ולצוות (מייל) נשלחות ברקע — לא חוסמות את חזרת
    // המלקט לרשימה, כי סיום ההזמנה כבר בוצע בשרת (send-and-update הצליח). זה
    // מקצר משמעותית את זמן "סיום ההזמנה". אם שליחה נכשלת עדיין מתריעים כדי
    // שיעדכנו את הלקוח ידנית (ההתראה תופיע לאחר החזרה לרשימה).
    Promise.allSettled(notifyTasks).then((settled) => {
      const failed = settled.filter((r) => r.status === "rejected");
      if (failed.length) {
        console.error("order-ready notifications:", failed.map((r) => r.reason));
        alert(t("errorSendingMessage"));
      }
    });

    setUpdateOrders((prev) => !prev); // מפעיל רענון רשימה מהשרת ב-App
    nav("/items"); // חזרה לרשימת כל ההזמנות אחרי סיום מוצלח
  };

  // ---- סיום הזמנה — הלוגיקה נשמרה 1:1 מהגרסה הקודמת ----
  const handleDone = async () => {
    if (submiting) return;

    const melaketId = localStorage.getItem("melaketId");
    if (!melaketId) {
      localStorage.removeItem("token");
      nav("/login");
      return;
    }

    // כל הפריטים חייבים להיות מטופלים (הושלמו או סומנו בחוסר מאושר)
    const allDone = groups.length > 0 && groups.every((g) => isDone(g.key));
    if (!allDone) {
      alert(t("notAllItemsMarked"));
      return;
    }

    const confirmed = confirm(t("are_you_sure"));
    if (!confirmed) return;

    // מרגע האישור ההזמנה נסגרת — חוסמים כל PATCH התקדמות עתידי (כולל אחד שכבר
    // ממתין ב-debounce) כדי שלא יחיה מצב ישן אחרי הניווט חזרה לרשימה.
    completedRef.current = true;
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);

    setSubmiting(true);
    try {
      const fullValue = statuses.find((status) => status._id === melaketId);

      // בדיקת "האם ההזמנה כבר הושלמה" הוסרה מכאן: היא הייתה סבב רשת שלם לפני כל
      // סגירת הזמנה, בשכפול מדויק של הבדיקה שהשרת עושה ממילא בתחילת
      // send-and-update / finalize. השרת מחזיר במקרה כזה שגיאה עם הדגל
      // alreadyCompleted, והטיפול בה נמצא ב-catch של הקריאה עצמה.
      // (הבדיקה הישנה גם פירשה תקלת רשת כ"כבר הושלמה" ועצרה סגירה תקינה.)

      // בניית pickedItems לפי הכמות שנלקטה בפועל.
      // המסך מלקט לפי **קבוצה** (מוצר פיזי אחד), והשרת מחשב חיוב ודיווח חוסרים
      // לפי **שורת עגלה** (lineKey) — ולכן הכמות מתחלקת כאן בחזרה לשורות
      // המקוריות: שורה בתשלום קודם, שורת מתנה אחרונה, כך שחוסר יורד מהמתנה ולא
      // ממה שהלקוח שילם עליו. בקבוצה בת שורה אחת זו העברה 1:1 כמו קודם.
      const perLine = {};
      groups.forEach((g) => {
        // בהשלמת חוסרים פריט repick נספר מ-0 (הכמות החסרה בלבד); מוסיפים חזרה את
        // הרצפה שנלקטה בסבב הראשון כדי לשלוח לשרת את הכמות הכוללת (הבסיס לחיוב).
        // floorOf מחזיר 0 מחוץ למצב השלמה / לפריט שאינו repick — התנהגות רגילה.
        const total = (pickedQuantities[g.key] || 0) + floorOf(g.key);
        Object.assign(perLine, distributeQuantity(g, total));
      });
      // id = מזהה השורה (מבחין בין ווריאנטים/מתנות של אותו מוצר), _id נשמר
      // לתאימות עם שרת שטרם עודכן. השרת מעדיף את id.
      const pickedItems = order.cart
        .map((item) => {
          const pid = productIdStr(item);
          return { _id: item._id, id: pid, quantity: perLine[pid] || 0 };
        })
        .filter((item) => item.quantity > 0);

      // משלוח לשליח נוצר לכל הזמנה שאינה איסוף עצמי. ההבחנה לפי shippingOption ("1")
      // ולא לפי דמי המשלוח — עלות 0 קיימת גם במשלוח בעיר ללא חיוב. נפילה חזרה
      // ל-shippingCost להזמנות ישנות שנשמרו לפני שהשדה נורמל בשרת.
      const isSelfCollectOrder = order?.shippingOption
        ? String(order.shippingOption) === "1"
        : order.shippingCost == 0;

      // ⚠ ה-payload של ליונוויל נבנה היום **בשרת** מתוך ההזמנה
      // (ikar-backend/lib/lionwheel/buildTaskPayload.js), כולל כתובת האיסוף
      // ו-company_id שמגיעים ממשתני סביבה. מה שנשלח מכאן הוא רק סימון בינארי:
      // null = איסוף עצמי → לא ייווצר משלוח | לא-null = ליצור משלוח.
      // (השרת מזהה איסוף עצמי גם בעצמו; זו שכבת הגנה שנייה.)
      // שינוי כתובת המחסן נעשה ב-.env של הבקנד, לא כאן.
      const lionwheelPayload = isSelfCollectOrder ? null : true;

      // מצב השלמת חוסרים נסגר דרך finalize (חיוב + חשבונית + מדבקות סופיות);
      // סיום ליקוט רגיל נשאר על send-and-update.
      const endpoint = isShortageCompletion
        ? `${API}/app/orders/${order._id}/finalize`
        : `${API}/app/orders/send-and-update/${order._id}`;

      let result;
      try {
        result = await axios.post(
          endpoint,
          { pickedItems, lionwheelPayload, numOfBoxes: Number(numOfBoxes) || 1 },
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );
      } catch (error) {
        console.error("error :>> ", error);
        // המסך מיושן וההזמנה כבר עברה את מסך החוסרים — הסיום שלה עובר דרך
        // finalize. טעינה מחדש של אותו מסך מכניסה את האפליקציה למצב השלמת
        // חוסרים, ולכן כאן דווקא לא מנווטים לרשימה. בלי זה המלקט היה נתקע
        // בלולאה: כל לחיצה חוזרת פונה שוב לאותו מסלול שגוי.
        if (error?.response?.data?.requiresFinalize) {
          alert(serverMessage(error.response.data, language) || t("errorUpdateOrder"));
          window.location.reload();
          return;
        }
        // ההזמנה כבר נסגרה / ממתינה לאישור חוסרים — אין מה לעשות במסך הזה.
        // מציגים את הודעת השרת וחוזרים לרשימה עם טעינה מחדש (מחליף את בדיקת
        // ה-GET המקדימה שהייתה כאן לפני השליחה).
        if (error?.response?.data?.alreadyCompleted) {
          alert(serverMessage(error.response.data, language) || t("alreadyDone"));
          nav("/items");
          window.location.reload();
          return;
        }
        // כישלון חיוב בסגירה הסופית (402) — ההזמנה **לא** נסגרה. מציגים את הודעת
        // השרת כדי שהמלקט ידע לפנות למנהל ולא יחשוב שההזמנה יצאה.
        alert(serverMessage(error?.response?.data, language) || t("errorUpdateOrder"));
        // ניסיון חוזר מותר רק כשברור שהחיוב **לא** בוצע. בתקלת תקשורת מול חברת
        // האשראי (chargeAmbiguous) ייתכן שהכסף כבר ירד — לחיצה נוספת עלולה לחייב
        // פעמיים, ולכן משאירים את ההזמנה נעולה עד בדיקת מנהל.
        if (!error?.response?.data?.chargeAmbiguous) {
          completedRef.current = false;
        }
        return;
      }

      // הזמנה שנכנסה להמתנה לחוסרים לא נסגרה ולא חויבה — לא שולחים ללקוח הודעת
      // "ההזמנה מוכנה", כי היא עדיין לא. מייל הביניים נשלח מהשרת.
      if (result?.data?.holdForShortages) {
        alert(t("orderMovedToShortages"));
        // setUpdateOrders מפעיל את go() ב-App שמרענן את הרשימה מהשרת.
        // (setOrders() בלי ארגומנט היה מאפס את הרשימה ל-undefined ומהבהב מסך ריק.)
        setUpdateOrders((prev) => !prev);
        nav("/items");
        return;
      }

      // ===== כשל ביצירת משימת המשלוח =====
      // ההזמנה כבר נסגרה וחויבה, אבל אף שליח לא קיבל אותה. לא ממשיכים לרשימה
      // ולא שולחים ללקוח "ההזמנה מוכנה" (אין קישור מעקב) — המלקט עומד כאן עכשיו
      // והוא היחיד שיכול לתקן את זה בלחיצה. skipped = איסוף עצמי, זה לא כשל.
      const shipmentInfo = result?.data?.shipment;
      if (shipmentInfo && !shipmentInfo.created && !shipmentInfo.skipped) {
        melaketRef.current = fullValue;
        setShipmentError(shipmentInfo.error || t("shipmentFailedTitle"));
        return;
      }

      notifyAndLeave({
        trackingLink: result?.data?.lionwheelResponse?.tracking_link,
        melaket: fullValue,
      });
    } finally {
      setSubmiting(false);
    }
  };

  // ---- שליחה חוזרת של המשלוח אחרי כשל ----
  // ההזמנה כבר סגורה ומחויבת; כאן נוצרת רק משימת המשלוח החסרה. השרת בונה את
  // ה-payload מחדש מההזמנה, כך שתיקון נתונים (למשל כתובת) ייכנס לתוקף מיד.
  const handleResendShipment = async () => {
    if (resending) return;
    setResending(true);
    try {
      const { data } = await axios.post(
        `${API}/app/orders/${order._id}/resend-shipment`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      setShipmentError(null);
      notifyAndLeave({
        trackingLink: data?.shipment?.trackingLink,
        melaket: melaketRef.current,
      });
    } catch (error) {
      console.error("resend-shipment error :>> ", error);
      setShipmentError(
        serverMessage(error?.response?.data, language) || t("shipmentFailedTitle")
      );
    } finally {
      setResending(false);
    }
  };

  // ---- תצוגה ----
  const itemName = (it) => productName(it);
  const statusOf = (pid) => {
    if (shortageItems[pid]) return { key: "statusShortage", cls: "bg-orange-100 text-orange-700" };
    const p = pickedOf(pid);
    const r = reqOf(pid);
    if (isPickedEnough(pid) && r > 0) return { key: "statusDone", cls: "bg-green-100 text-green-700" };
    if (p > 0) return { key: "statusInProgress", cls: "bg-blue-100 text-blue-700" };
    return { key: "statusWaiting", cls: "bg-gray-100 text-gray-600" };
  };

  const header = (
    <div className="w-full border-b border-gray-200 pb-2 pt-1 px-2 from-mainColor-light/20 to-white bg-gradient-to-b">
      <img src={loginImg} alt="לוגו האיכר - מערכת ליקוט" className="h-14 mx-auto" />
    </div>
  );

  // מסך הפריט שולף את ההזמנה שלו בעצמו (fetchOrder) — לכן ההמתנה תלויה רק ב-order
  // המקומי, ולא ב-loading הגלובלי (שנוקה רק ע"י מסך הרשימה). כך רענון ישיר על
  // /items/:id לא נתקע בספינר אינסופי.
  if (!order) {
    return (
      <div className="orderPage">
        {header}
        <div className="flex justify-center p-10">
          <img src={spinnerLoadingImage} alt="loading" width={40} height={40} />
        </div>
      </div>
    );
  }

  return (
    <div className="orderPage" dir={language === "hebrew" ? "rtl" : "ltr"}>
      {header}

      <div className="max-w-[700px] mx-auto p-4 pb-24">
        {/* פס התקדמות */}
        <div className="flex items-center justify-between mb-3 text-sm font-bold text-gray-700">
          <span>
            {t("id")}: {order.invoice}
          </span>
          {!allHandled && (
            <span>
              {t("itemWord")} {currentIndex + 1} {t("ofWord")} {queueTotal}
            </span>
          )}
        </div>
        <div className="flex gap-2 mb-4">
          <div className="flex-1 rounded-lg bg-blue-50 text-blue-800 text-center py-2 font-bold">
            {t("remainingWord")}: {queueTotal - queueDone}
          </div>
          <div className="flex-1 rounded-lg bg-green-50 text-green-800 text-center py-2 font-bold">
            {t("pickedWord")}: {pickedCount}
          </div>
          {shortageCount > 0 && (
            <div className="flex-1 rounded-lg bg-orange-50 text-orange-700 text-center py-2 font-bold">
              {t("shortageWord")}: {shortageCount}
            </div>
          )}
        </div>

        {/* באנר מצב השלמת חוסרים — הנחיה מפורשת לפי הכרעת המנהל (ליקוט מחדש / אושר) */}
        {isShortageCompletion && (
          <div className="mb-4 rounded-lg bg-orange-100 text-orange-800 px-3 py-2 text-sm font-bold text-center">
            {shortageCompletionMsg}
          </div>
        )}

        {shipmentError ? (
          /* ---- כשל ביצירת המשלוח ---- */
          /* ההזמנה כבר נסגרה וחויבה. המסך הזה גובר על כל השאר כדי שהמלקט לא
             ימשיך הלאה בלי לדעת שאין שליח — הוא היחיד שיכול לתקן את זה עכשיו. */
          <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-6 text-center flex flex-col gap-4">
            <FaExclamationTriangle className="text-red-500 mx-auto" size={48} />
            <h2 className="text-xl font-bold text-red-700">{t("shipmentFailedTitle")}</h2>
            <p className="text-gray-800 font-bold">
              {t("finishOrderTitle")} {order.invoice}
            </p>
            <p className="text-gray-700">{t("shipmentFailedBody")}</p>
            <p className="text-xs text-gray-500 break-words" dir="ltr">
              {shipmentError}
            </p>
            <button
              onClick={handleResendShipment}
              disabled={resending}
              className="border-none text-white rounded-full font-bold text-base py-3 px-6 flex items-center justify-center gap-1.5 bg-red-600 mx-auto disabled:opacity-50"
            >
              {resending ? (
                <img src={spinnerLoadingImage} alt="Loading" width={20} height={20} />
              ) : (
                <FaCheckCircle />
              )}
              {t("resendShipment")}
            </button>
            <button
              onClick={() => {
                if (window.confirm(t("shipmentFailedLeaveConfirm"))) nav("/items");
              }}
              className="text-gray-600 underline text-sm"
            >
              {t("backToListAnyway")}
            </button>
          </div>
        ) : needsBoxScan ? (
          /* ---- שער סריקת הארגזים (לפני כל השלמה) ---- */
          <BoxScanGate
            order={order}
            expectedBoxes={order?.shortageHold?.numOfBoxes || order?.numOfBoxes || 1}
            hasScanner={hasScanner}
            toggleScanner={toggleScanner}
            onVerified={() => setBoxScanDone(true)}
            onLocked={() => nav("/items")}
            t={t}
            language={language}
          />
        ) : allHandled ? (
          /* ---- מסך סיום ---- */
          <div className="rounded-2xl border-2 border-mainColor p-6 text-center flex flex-col gap-4">
            <FaCheckCircle className="text-green-500 mx-auto" size={48} />
            <h2 className="text-xl font-bold text-gray-900">{t("finishOrderTitle")} {order.invoice}</h2>
            <p className="text-gray-600">{t("allItemsHandled")}</p>
            <p className="text-gray-700 font-bold">
              {t("pickedWord")}: {pickedCount} {t("ofWord")} {totalCount}
            </p>
            {shortageCount > 0 && (
              <p className="text-orange-600 font-bold">
                {t("shortageWord")}: {shortageCount}
              </p>
            )}
            <label className="relative border-2 border-mainColor rounded-full font-bold text-base py-2 px-3 flex items-center justify-center gap-2 mx-auto">
              <FaBoxOpen className="text-mainColor w-4 min-w-4" />
              <input
                placeholder={t("numOfBoxes")}
                type="number"
                min={1}
                value={numOfBoxes}
                onChange={(e) => setNumOfBoxes(e.target.value)}
                className="border-none outline-none w-32 bg-transparent text-center"
              />
            </label>
            <button
              onClick={handleDone}
              disabled={submiting || !numOfBoxes || Number(numOfBoxes) <= 0}
              className="border-none text-white rounded-full font-bold text-base py-3 px-6 flex items-center justify-center gap-1.5 bg-mainColor mx-auto disabled:opacity-50"
            >
              {submiting ? (
                <img src={spinnerLoadingImage} alt="Loading" width={20} height={20} />
              ) : (
                <FaCheckCircle />
              )}
              {t("done")}
            </button>
            <button onClick={() => setShowList(true)} className="text-mainColor underline text-sm">
              {t("openItemsList")}
            </button>
          </div>
        ) : currentItem ? (
          /* ---- כרטיס פריט נוכחי ---- */
          <div className="rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex gap-4 p-4">
              <img
                src={currentItem.image || IMG_PLACEHOLDER}
                onError={(e) => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                alt={itemName(currentItem)}
                className="w-28 h-28 rounded-lg object-contain bg-gray-50 border"
              />
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900 leading-tight mb-1">
                  {itemName(currentItem)}
                </h2>
                <p className="text-gray-500 text-sm mb-2">
                  {currentItem.barcode}
                </p>
                {isWeightedPid(currentPid) && (
                  /* סימון מפורש — המלקט חייב לדעת שהפריט הזה נשקל ולא נספר */
                  <p className="inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 mb-1">
                    {t("weighedProduct")}
                  </p>
                )}
                {groupByPid[currentPid]?.merged && (
                  /* הכמות כאן היא סכום של כמה שורות בהזמנה (למשל שורה בתשלום
                     ושורת מתנה של אותו מוצר). אומרים את זה במפורש, אחרת המלקט
                     רואה כמות שאינה תואמת לשום שורה בהזמנה המודפסת. */
                  <p className="inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 mb-1">
                    {t("mergedLineNote").replace("{n}", String(groupByPid[currentPid].lineCount))}
                  </p>
                )}
                <p className="text-gray-700">
                  {t("requiredQty")}: <b>{qtyLabel(currentPid, reqOf(currentPid))}</b>
                </p>
                <p className="text-gray-700">
                  {t("pickedQty")}:{" "}
                  <b className="text-mainColor text-xl">
                    {qtyLabel(currentPid, pickedOf(currentPid))}
                  </b>{" "}
                  {t("ofWord")} {qtyLabel(currentPid, reqOf(currentPid))}
                </p>
              </div>
            </div>

            {/* חיווי */}
            {feedback && (
              <div
                className={`px-4 py-3 text-center font-bold ${
                  feedback.type === "success"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {feedback.msg}
              </div>
            )}

            {shortagePrompt && shortagePrompt.pid === currentPid ? (
              /* ---- אחרי אישור כמות חלקית: הצעה לסמן את היתרה בחוסר ---- */
              <div className="p-4 border-t bg-orange-50">
                <div className="flex items-center gap-2 text-orange-700 font-bold mb-3">
                  <FaExclamationTriangle />
                  {t("partialShortageMsg").replace(
                    "{n}",
                    shortagePrompt.weighed
                      ? formatWeight(shortagePrompt.missing, weightLang)
                      : shortagePrompt.missing
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={confirmPartialShortage}
                    className="flex-1 rounded-lg bg-orange-500 px-4 py-3 text-white font-bold flex items-center justify-center gap-2"
                  >
                    <FaExclamationTriangle /> {t("markShortage")}
                  </button>
                  <button
                    onClick={() => setShortagePrompt(null)}
                    className="rounded-lg border border-gray-300 px-4 py-3 text-gray-700"
                  >
                    {t("keepPicking")}
                  </button>
                </div>
              </div>
            ) : (
              /* מצב מצלמה (ברירת מחדל) או מצב סורק-חומרה בלבד — נקבע פר-מכשיר */
              <div className="p-4 border-t bg-gray-50">
                {/* שדה הכמות — קבוע מעל אזור הסריקה, מתחיל ריק, בלי כפתור פותח
                    ובלי "0" מוקדם. הסריקה הרגילה ממשיכה להעלות +1 לבדה; השדה
                    נועד למוצר ללא ברקוד, לשקילה ולתיקון כמות. */}
                <div className="mb-3 rounded-lg border-2 border-mainColor bg-white p-3">
                  <label className="flex items-center gap-1 text-sm font-bold text-gray-700 mb-1">
                    <FaKeyboard className="text-mainColor" />
                    {/* מוצר שקיל — הכותרת והכמות הנדרשת בק"ג, אחרת "1.5" נקרא
                        כיחידה וחצי ומקבלים שקילה שגויה */}
                    {isWeightedPid(currentPid) ? t("weighedQty") : t("pickedQty")} — {t("requiredQty")}:{" "}
                    {isWeightedPid(currentPid)
                      ? formatWeight(reqOf(currentPid), weightLang)
                      : reqOf(currentPid)}
                  </label>
                  <div className="flex gap-2">
                    <input
                      ref={qtyInputRef}
                      type="number"
                      min={0}
                      max={reqOf(currentPid)}
                      // מוצר שקיל — קלט עשרוני. step="1" (ברירת המחדל) היה
                      // מסמן 1.42 כערך לא תקין בדפדפן ומקפיץ מקלדת מספרים
                      // שלמים בלבד בנייד, כלומר משקל שאי אפשר להקליד.
                      step={isWeightedPid(currentPid) ? "any" : 1}
                      inputMode={isWeightedPid(currentPid) ? "decimal" : "numeric"}
                      value={qtyValue}
                      onChange={(e) => setQtyValue(e.target.value)}
                      onFocus={(e) => {
                        setQtyFocused(true);
                        // בחירת התוכן הקיים: אחרי סריקה יש בשדה "1", והקלדה
                        // פשוט מחליפה אותו במקום לחייב מחיקה ידנית קודם.
                        e.target.select();
                      }}
                      onBlur={() => setQtyFocused(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitQtyField();
                        }
                      }}
                      dir="ltr"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-gray-900 text-lg text-center"
                      placeholder=""
                    />
                    <button
                      type="button"
                      onClick={confirmQty}
                      disabled={qtyValue === ""}
                      className="rounded-lg bg-mainColor px-5 text-white font-bold disabled:opacity-40"
                    >
                      {t("approve")}
                    </button>
                  </div>
                </div>
                {awaitingNextUnit ? (
                  /* שער בין-יחידתי (מצלמה בלבד): המצלמה מוסרת מה-DOM עד לאישור
                     אנושי, כדי שמוצר שנשאר מול העדשה לא ימשיך להעלות את המונה. */
                  <button
                    type="button"
                    onClick={confirmNextUnit}
                    className="w-full rounded-full border-none bg-orange-500 py-3 px-6 font-bold text-base text-white"
                  >
                    {t("scanNextUnit")}
                  </button>
                ) : (
                  <>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                      {hasScanner ? t("scannerModeHardware") : t("scanFieldLabel")}
                    </label>
                    {/* המצלמה נטענת רק כשאין סורק חומרה. כשיש סורק — היא לא מרונדרת כלל,
                        כך ה-stream נסגר ולולאת עיבוד התמונה לא רצה. */}
                    {!hasScanner && (
                      <div className="overflow-hidden rounded-lg bg-gray-900 mb-2" style={{ height: 200 }}>
                        <BarcodeScanner
                          onScan={handleCameraScan}
                          paused={showList || shortageModal}
                          playSoundOnScan={false}
                          style={{ height: "100%", width: "100%" }}
                        />
                      </div>
                    )}
                    {/* שדה טקסט לסורק חומרה/בלוטות' — ממוקד תמיד, בלי מקלדת קופצת */}
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={barcodeValue}
                      onChange={(e) => setBarcodeValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitBarcodeField();
                        }
                      }}
                      dir="ltr"
                      inputMode="none"
                      className="w-full rounded-lg border-2 border-mainColor px-3 py-2 text-gray-900 text-lg text-center"
                      placeholder="7290000000000"
                    />
                    {/* מתג פר-מכשיר: יש סורק חומרה → כיבוי המצלמה (חיסכון בסוללה/מסך/מהירות) */}
                    <button
                      type="button"
                      onClick={toggleScanner}
                      className="mt-2 text-xs font-bold text-gray-500 underline"
                    >
                      {hasScanner ? t("enableCameraScanner") : t("disableCameraScanner")}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* פעולות */}
            <div className="grid grid-cols-4 gap-px bg-gray-200 border-t">
              <button
                onClick={goPrev}
                disabled={queue.length < 2}
                className="bg-white py-3 flex flex-col items-center gap-1 text-gray-700 text-sm disabled:opacity-40"
              >
                <FaBackward /> {t("prevItem")}
              </button>
              <button
                onClick={goNext}
                disabled={queue.length < 2}
                className="bg-white py-3 flex flex-col items-center gap-1 text-gray-700 text-sm disabled:opacity-40"
              >
                <FaForward /> {t("nextItem")}
              </button>
              <button
                onClick={openShortage}
                className="bg-white py-3 flex flex-col items-center gap-1 text-orange-600 text-sm"
              >
                <FaExclamationTriangle /> {t("markShortage")}
              </button>
              <button
                onClick={() => setShowList(true)}
                className="bg-white py-3 flex flex-col items-center gap-1 text-gray-700 text-sm"
              >
                <FaListUl /> {t("openItemsList")}
              </button>
            </div>
          </div>
        ) : (
          /* מצב קצה: אין פריט נוכחי אך ההזמנה לא סומנה כמטופלת במלואה — למשל תור
             השלמת חוסרים שהתרוקן כי מזהי ה-repick לא נמצאו בעגלה. בלי המסך הזה
             המלקט היה נתקע בדף ריק בלי שום דרך להמשיך. */
          <div className="rounded-2xl border-2 border-orange-400 p-6 text-center flex flex-col gap-3">
            <FaExclamationTriangle className="text-orange-500 mx-auto" size={40} />
            <p className="font-bold text-gray-800">{t("noItemsToPick")}</p>
            <button
              onClick={() => setShowList(true)}
              className="text-mainColor underline text-sm"
            >
              {t("openItemsList")}
            </button>
            <button
              onClick={() => nav("/items")}
              className="border-none text-white rounded-full font-bold text-base py-2 px-6 bg-mainColor mx-auto"
            >
              {t("back")}
            </button>
          </div>
        )}

        {/* פרטי לקוח + הערות */}
        <div className="mt-4 text-sm text-gray-600 leading-6">
          <p>
            {t("name")}: {tPerson(`${order?.user_info?.name || ""} ${order?.user_info?.lastName || ""}`.trim())}
          </p>
          <p>
            {t("phone")}: {order?.user_info?.contact}
          </p>
          {order?.createdAt && (
            <p>
              {t("orderDate")}: {dayjs(order.createdAt).format("DD/MM/YYYY HH:mm")}
            </p>
          )}
          {userText && (
            <p>
              {t("notes")}: <span className="text_red">{userText}</span>
            </p>
          )}
        </div>
      </div>

      {/* ---- מודל אישור בחוסר ---- */}
      {shortageModal && (
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/50 p-4"
          dir={language === "hebrew" ? "rtl" : "ltr"}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t("shortageApprovalTitle")}</h3>
            <p className="text-sm text-gray-600 mb-4">{t("shortageApprovalPrompt")}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShortageModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700"
              >
                {t("close")}
              </button>
              <button
                onClick={confirmShortage}
                className="rounded-lg bg-orange-500 px-4 py-2 text-white"
              >
                {t("approve")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- מודל רשימת פריטים מלאה (צפייה + קפיצה, בלי סימון גורף) ---- */}
      {showList && (
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowList(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl max-h-[80vh] overflow-y-auto" dir={language === "hebrew" ? "rtl" : "ltr"}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">{t("itemsListTitle")}</h3>
              <button onClick={() => setShowList(false)} className="text-gray-500 text-xl">
                ×
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {queue.map((pid) => {
                const it = cartByPid[pid];
                if (!it) return null;
                const st = statusOf(pid);
                const isCurrent = pid === currentPid;
                return (
                  <button
                    key={pid}
                    onClick={() => jumpToItem(pid)}
                    className={`flex items-center gap-3 rounded-lg border p-2 text-right ${
                      isCurrent ? "border-mainColor border-2 bg-mainColor-light/10" : ""
                    }`}
                  >
                    <img
                      src={it.image || IMG_PLACEHOLDER}
                      onError={(e) => { e.currentTarget.src = IMG_PLACEHOLDER; }}
                      alt={itemName(it)}
                      className="w-10 h-10 rounded object-contain bg-gray-50"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-gray-800">{itemName(it)}</div>
                      <div className="text-xs text-gray-500">
                        {qtyLabel(pid, pickedOf(pid))} {t("ofWord")} {qtyLabel(pid, reqOf(pid))}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${st.cls}`}>
                      {t(st.key)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function safeParse(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch (_) {
    return null;
  }
}
