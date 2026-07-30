// src/i18n/DynamicTranslation.jsx
//
// תרגום טקסט דינמי שמגיע מה-DB — שמות מוצרים ושמות לקוחות. הטקסטים האלה לא
// יכולים לשבת בטבלת המחרוזות הקבועה שב-components/Language, כי יש מהם אלפים
// והם משתנים כל יום.
//
// איך זה עובד:
//   1. רכיב מבקש תרגום דרך tProduct/tPerson.
//   2. אם התרגום כבר במטמון המקומי — הוא מוחזר מיד, בלי שום קריאת רשת.
//   3. אם לא — מוחזר המקור בעברית (המסך לעולם לא ריק ולא ממתין), והבקשה
//      נאספת לאצווה שנשלחת לשרת אחרי השהייה קצרה. כשהתשובה חוזרת הרכיב מתרנדר
//      מחדש עם התרגום.
// השרת מחזיק מטמון קבוע ב-DB, כך שבפועל כל מחרוזת מתורגמת פעם אחת אי פעם
// (ראה ikar-backend/lib/translator.js). המטמון המקומי כאן חוסך גם את הקריאה הזו.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { languageContext } from "../App";
import { selectProductName } from "./productName";

const API = import.meta.env.VITE_MAIN_SERVER_URL || "";
const STORAGE_KEY = "dynTranslations";
// השהייה לפני שליחת אצווה — מספיקה כדי שכל הפריטים של מסך אחד ייאספו לבקשה אחת
const BATCH_DELAY_MS = 120;
// תקרת ההגנה בשרת היא 300 לבקשה
const MAX_PER_REQUEST = 300;
// כמה כשלי רשת לפני שמוותרים על מחרוזת עד רענון הדף
const MAX_FAILURES = 3;

// ערכי ברירת מחדל לשימוש מחוץ לספק (בדיקות, רינדור בודד של רכיב) — מחזירים את
// המקור כמו שהוא, בלי שום קריאת רשת.
export const dynamicTranslationContext = createContext({
  tProduct: (text) => text,
  tPerson: (text) => text,
});

const loadCache = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveCache = (cache) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // מכסת אחסון מלאה — המטמון בזיכרון ימשיך לעבוד, רק לא ישרוד רענון
  }
};

export const DynamicTranslationProvider = ({ children }) => {
  const { language } = useContext(languageContext);

  // { [lang]: { [kind]: { [source]: translation } } }
  // kind חלק מהמפתח, בדיוק כמו במטמון השרת: אותה מחרוזת מתורגמת אחרת כשם מוצר
  // וכשם אדם, ובלי ההפרדה לקוח ששמו כשם מוצר היה מקבל את התרגום הלא נכון.
  const [cache, setCache] = useState(loadCache);

  // מחרוזות שהשרת לא הצליח לתרגם — לא מבקשים אותן שוב ושוב באותה הפעלה,
  // אחרת כל רינדור היה יורה בקשה נוספת על טקסט שאין לו תרגום.
  const unresolvedRef = useRef(new Set());
  // מה שממתין לאצווה הבאה: { [kind]: Set<string> }
  const pendingRef = useRef({});
  // מה שכבר בטיסה, כדי לא לשלוח פעמיים
  const inFlightRef = useRef(new Set());
  // ספירת כשלי רשת למחרוזת. בלי זה, שרת שנפל היה גורם לבקשה חוזרת בכל רינדור —
  // מסך הליקוט מתרנדר הרבה (סריקות, טיימרים), וזה היה מציף אותו בלולאה.
  const failuresRef = useRef(new Map());
  const timerRef = useRef(null);

  // הפניה לגרסה העדכנית של flush, לצורך תזמון מחדש מתוך flush עצמו (עודף תור)
  const flushRef = useRef(null);

  const flush = useCallback(async () => {
    timerRef.current = null;
    const lang = language;
    const pending = pendingRef.current;
    pendingRef.current = {};

    const token = localStorage.getItem("token");
    if (!token || !lang || lang === "hebrew") return;

    for (const kind of Object.keys(pending)) {
      const all = [...pending[kind]];
      const texts = all.slice(0, MAX_PER_REQUEST);
      if (!texts.length) continue;

      // עודף מעל תקרת הבקשה חוזר לתור במקום להיעלם
      const overflow = all.slice(MAX_PER_REQUEST);
      if (overflow.length) {
        if (!pendingRef.current[kind]) pendingRef.current[kind] = new Set();
        overflow.forEach((t) => pendingRef.current[kind].add(t));
        if (!timerRef.current) timerRef.current = setTimeout(flushRef.current, BATCH_DELAY_MS);
      }

      texts.forEach((t) => inFlightRef.current.add(`${lang}|${kind}|${t}`));

      try {
        const { data } = await axios.post(
          `${API}/app/translate`,
          { texts, lang, kind },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const translations = data?.translations || {};

        // מה שחזר ריק — סימן שהשרת לא הצליח לתרגם; מסמנים כדי לא לנסות בלולאה
        texts.forEach((t) => {
          const key = `${lang}|${kind}|${t}`;
          if (translations[t]) failuresRef.current.delete(key);
          else unresolvedRef.current.add(key);
        });

        if (Object.keys(translations).length) {
          // הכתיבה ל-localStorage נעשית ב-effect ולא כאן: פונקציית העדכון של
          // useState חייבת להיות טהורה (ב-StrictMode היא נקראת פעמיים).
          setCache((prev) => ({
            ...prev,
            [lang]: {
              ...(prev[lang] || {}),
              [kind]: { ...(prev[lang]?.[kind] || {}), ...translations },
            },
          }));
        }
      } catch (err) {
        // כשל רשת/שרת הוא לרוב זמני, ולכן מותר לנסות שוב — אבל לא בלי גבול.
        // אחרי MAX_FAILURES ניסיונות מוותרים על המחרוזת עד לרענון הדף.
        texts.forEach((t) => {
          const key = `${lang}|${kind}|${t}`;
          const count = (failuresRef.current.get(key) || 0) + 1;
          failuresRef.current.set(key, count);
          if (count >= MAX_FAILURES) unresolvedRef.current.add(key);
        });
        console.error("[dynamicTranslation] batch failed:", err?.message || err);
      } finally {
        texts.forEach((t) => inFlightRef.current.delete(`${lang}|${kind}|${t}`));
      }
    }
  }, [language]);

  flushRef.current = flush;

  const schedule = useCallback(
    (text, kind) => {
      if (!pendingRef.current[kind]) pendingRef.current[kind] = new Set();
      pendingRef.current[kind].add(text);
      if (timerRef.current) return;
      timerRef.current = setTimeout(flush, BATCH_DELAY_MS);
    },
    [flush]
  );

  // החלפת שפה מנקה בקשות תלויות ושוברת מטמון "לא ניתן לתרגום" של השפה הקודמת
  useEffect(() => {
    pendingRef.current = {};
    unresolvedRef.current = new Set();
    failuresRef.current = new Map();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [language]);

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

  // שמירת המטמון לדיסק אחרי כל עדכון, כדי שהוא ישרוד רענון וסגירת דפדפן
  useEffect(() => {
    saveCache(cache);
  }, [cache]);

  const translate = useCallback(
    (text, kind) => {
      const source = typeof text === "string" ? text.trim() : "";
      if (!source || !language || language === "hebrew") return text || "";

      const hit = cache?.[language]?.[kind]?.[source];
      if (hit) return hit;

      const key = `${language}|${kind}|${source}`;
      if (!unresolvedRef.current.has(key) && !inFlightRef.current.has(key)) {
        schedule(source, kind);
      }
      // נפילה לעברית — עדיף שם קריא בשפה אחרת מאשר מסך ריק בזמן ליקוט
      return text;
    },
    // cache בתלויות: כשמגיעים תרגומים חדשים זהות הפונקציה משתנה, וכך גם רכיבים
    // שמחשבים שמות בתוך useEffect (OrderPreview) מקבלים אותם ולא נתקעים על עברית
    [cache, language, schedule]
  );

  const tProduct = useCallback((text) => translate(text, "product"), [translate]);
  const tPerson = useCallback((text) => translate(text, "person"), [translate]);

  // ממומו כדי שהאובייקט לא ייווצר מחדש בכל רינדור של App (שמתרנדר על כל רענון
  // הזמנות) ויגרור רינדור מיותר של כל הצרכנים
  const value = useMemo(() => ({ tProduct, tPerson }), [tProduct, tPerson]);

  return (
    <dynamicTranslationContext.Provider value={value}>
      {children}
    </dynamicTranslationContext.Provider>
  );
};

export const useDynamicTranslation = () => useContext(dynamicTranslationContext);

/**
 * שם מוצר בשפה הנוכחית.
 * עברית → title.he. שפה אחרת → קודם שם שהוזן ידנית במסד (title.th / title.en),
 * ואם אין — תרגום אוטומטי של השם העברי.
 */
export const useProductName = () => {
  const { language } = useContext(languageContext);
  const { tProduct } = useDynamicTranslation();

  return useCallback(
    (item) => {
      const selected = selectProductName(item, language);
      if (selected.value !== undefined) return selected.value;
      return tProduct(selected.translateFrom) || selected.translateFrom;
    },
    [language, tProduct]
  );
};
