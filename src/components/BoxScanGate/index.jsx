// src/components/BoxScanGate/index.jsx
//
// שער סריקת הארגזים — נפתח לפני השלמת הזמנה שחזרה ממסך החוסרים.
//
// המלקט חייב לסרוק את הברקוד שעל כל אחד מארגזי ההזמנה (מדבקת הביניים שהודפסה
// בסיום הליקוט הראשון) לפני שהוא ממשיך. המטרה: לוודא שכל ארגזי ההזמנה נאספו
// לפני שמוסיפים אליהם פריטים — מניעת פיצול הזמנות והכנסת פריט להזמנה לא נכונה.
//
// כל ארגז נושא ברקוד ייחודי "<מספר הזמנה>-<אינדקס>" (מדבקת הביניים). הסריקה
// מוודאת שכל N הארגזים נאספו: סריקת אותו ארגז פעמיים מזוהה כ"כבר נסרק" ואינה
// נספרת, וכך מונעים גם ערבוב בין הזמנות וגם ספירה כפולה של אותו ארגז. ברקוד ישן
// (מספר הזמנה בלבד, מדבקות שהודפסו לפני המעבר) עדיין נתמך — אך בלי הבחנה בין ארגזים.
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { FaBoxOpen, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import BarcodeScanner from "../BarcodeScanner";
import spinnerLoadingImage from "/spinner.gif";
import { playScanSuccess, playScanError } from "../../utils/soundFeedback";

const API = import.meta.env.VITE_MAIN_SERVER_URL;

// נרמול זהה לזה שבמסך הליקוט ובבקנד (lib/normalizeBarcode)
const normalizeBarcode = (v) =>
  String(v ?? "").trim().replace(/\s+/g, "").toUpperCase();

export default function BoxScanGate({
  order,
  expectedBoxes,
  hasScanner,
  toggleScanner,
  onVerified,
  onLocked,
  t,
  language,
}) {
  // שומרים את הברקודים שנסרקו בפועל ולא רק מונה — השרת מאמת אותם.
  // נשמר ב-sessionStorage כדי שרענון/נעילת מסך באמצע הסריקה לא יאפסו את העבודה.
  const storageKey = `boxScans_${order?._id}`;
  const [scans, setScans] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const scanned = scans.length;
  // אחרי כל סריקה מוצלחת ממתינים לאישור מפורש שהמלקט עבר לארגז הבא (ראו handleBarcode)
  const [awaitingNextBox, setAwaitingNextBox] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [feedback, setFeedback] = useState(null); // { type, msg }
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const lastScanRef = useRef(0);

  const expected = Math.max(1, Number(expectedBoxes) || 1);
  const orderBarcode = normalizeBarcode(order?.invoice);

  // מזהה הארגז מתוך הברקוד:
  //   פורמט חדש "<מספר הזמנה>-<אינדקס>" (ברקוד ייחודי לכל ארגז) → { kind:"indexed", idx }
  //   פורמט ישן (מספר הזמנה בלבד, מדבקות שהודפסו לפני המעבר) → { kind:"legacy" }
  //   כל דבר אחר (הזמנה אחרת / אינדקס מחוץ לטווח) → { kind:"invalid" }
  const parseBox = (value) => {
    if (!value) return { kind: "invalid" };
    if (value === orderBarcode) return { kind: "legacy" };
    const m = value.match(/^(.+)-(\d+)$/);
    if (m && m[1] === orderBarcode) {
      const idx = parseInt(m[2], 10);
      if (idx >= 1 && idx <= expected) return { kind: "indexed", idx };
    }
    return { kind: "invalid" };
  };

  // פוקוס אוטומטי לסורק החומרה, כמו במסך הליקוט.
  // awaitingNextBox חייב להיות בתלויות: סריקה מוצלחת מסירה את שדה הקלט מה-DOM,
  // ולחיצה על "עברתי לארגז הבא" מרכיבה אותו מחדש. בלי התלות הזו האפקט לא היה
  // רץ שוב, והמלקט היה צריך ללחוץ ידנית על השדה לפני כל ארגז מהשני והלאה.
  useEffect(() => {
    if (awaitingNextBox) return;
    const el = inputRef.current;
    if (!el) return;
    const timer = setTimeout(() => el.focus({ preventScroll: true }), 60);
    return () => clearTimeout(timer);
  }, [scanned, hasScanner, awaitingNextBox]);

  useEffect(() => {
    if (!feedback) return;
    const ms = feedback.type === "success" ? 900 : 2000;
    const timer = setTimeout(() => setFeedback(null), ms);
    return () => clearTimeout(timer);
  }, [feedback]);

  const logScan = (result, barcode) => {
    try {
      axios
        .post(
          `${API}/app/scan-logs`,
          { order: order?._id, barcode, result, quantityAfter: null },
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        )
        .catch(() => {});
    } catch (_) { /* תיעוד בלבד — לא חוסם */ }
  };

  const handleBarcode = (raw) => {
    if (submitting || awaitingNextBox) return;
    const value = normalizeBarcode(raw);
    if (!value) return;

    // מניעת קליטה כפולה מהירה (אותה סריקה נקלטת פעמיים מהסורק).
    // מדווחים למלקט במקום להתעלם בשקט — אחרת שתי סריקות מהירות של שני ארגזים
    // שונים נספרות כאחת והוא לא מבין למה המונה לא זז.
    const now = Date.now();
    if (now - lastScanRef.current < 800) {
      setFeedback({ type: "error", msg: t("boxScanTooFast") });
      return;
    }
    lastScanRef.current = now;

    const parsed = parseBox(value);
    if (parsed.kind === "invalid") {
      playScanError();
      setFeedback({ type: "error", msg: `${t("boxScanWrongOrder")} (${value})` });
      logScan("box_mismatch", value);
      return;
    }

    // ארגז ייחודי שכבר נסרק — מונעים ספירה כפולה של אותו ארגז (הסיבה למעבר
    // לברקוד-לכל-ארגז). ברקוד ישן (legacy) אינו ניתן להבחנה ולכן נספר לפי מונה בלבד.
    if (parsed.kind === "indexed" && scans.some((v) => parseBox(v).idx === parsed.idx)) {
      playScanError();
      setFeedback({ type: "error", msg: t("boxScanDuplicate") });
      logScan("box_duplicate", value);
      return;
    }

    if (scanned >= expected) {
      // כל הארגזים כבר נסרקו — מדווחים במקום להתעלם בשקט
      setFeedback({ type: "error", msg: t("boxScanAllDone") });
      return;
    }

    playScanSuccess();
    // השהיית המצלמה עד לאישור מפורש: בלעדיה החזקת המצלמה מול מדבקה **אחת**
    // מייצרת סריקה מתקבלת כל ~800ms, והמונה מגיע לבדו ל-4/4 בלי שאיש נגע
    // בארגזים. זו הייתה עקיפה מלאה של השער במצב מצלמה.
    setAwaitingNextBox(true);
    logScan("box", value);
    setScans((prev) => {
      const next = [...prev, value];
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch { /* מצב פרטי / אחסון מלא — הסריקה עדיין נספרת בזיכרון */ }
      return next;
    });
    setFeedback({ type: "success", msg: t("boxScanOk") });
  };

  const submitField = () => {
    const val = barcodeValue;
    setBarcodeValue("");
    handleBarcode(val);
  };

  // acknowledge=true — המלקט מאשר במפורש שיש פחות ארגזים מהמצופה (ארגז אוחד/אבד).
  // בלי זה מלקט שההזמנה שלו כווצה מ-4 ארגזים ל-3 היה נתקע במסך בלי שום דרך להמשיך.
  const confirm = async (acknowledge = false) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await axios.post(
        `${API}/app/orders/${order._id}/verify-boxes`,
        {
          scannedBarcodes: scans, // השרת מאמת שכל ברקוד שייך להזמנה הזו
          scannedCount: scanned,  // תאימות לאחור
          acknowledgeMissingBoxes: acknowledge,
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      try {
        sessionStorage.removeItem(storageKey);
      } catch { /* לא קריטי */ }
      onVerified();
    } catch (err) {
      const data = err?.response?.data;
      const msg =
        (language === "hebrew" ? data?.message?.he : data?.message?.en) ||
        data?.message?.he ||
        err?.message;

      // 403 = ההזמנה נעולה למלקט אחר. באנר שנעלם אחרי 2 שניות משאיר את המלקט
      // תקוע במסך בלי הסבר — מוציאים אותו חזרה לרשימה עם הודעה חוסמת.
      if (err?.response?.status === 403) {
        alert(msg);
        onLocked?.();
        return;
      }

      setFeedback({ type: "error", msg });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmFewerBoxes = () => {
    if (!window.confirm(t("boxScanFewerConfirm").replace("{n}", scanned).replace("{total}", expected))) {
      return;
    }
    confirm(true);
  };

  const allScanned = scanned >= expected;

  return (
    <div className="rounded-2xl border-2 border-orange-400 p-5 flex flex-col gap-4">
      <div className="text-center">
        <FaBoxOpen className="text-orange-500 mx-auto" size={44} />
        <h2 className="text-xl font-bold text-gray-900 mt-2">{t("boxScanTitle")}</h2>
        <p className="text-gray-600 text-sm mt-1">{t("boxScanPrompt")}</p>
      </div>

      {/* מונה הארגזים */}
      <div
        className={`rounded-xl text-center py-3 font-bold text-2xl ${
          allScanned ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
        }`}
      >
        {/* dir="ltr" חובה: "/" הוא תו ניטרלי מבחינת כיווניות, ובתוך פסקה RTL
            הוא מתהפך — "1 / 4" היה מוצג כ-"4 / 1", וזה המספר הכי חשוב במסך. */}
        <span dir="ltr">{scanned} / {expected}</span>
        <div className="text-sm font-normal mt-1">{t("boxScanCounter")}</div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg px-3 py-2 text-center font-bold text-sm ${
            feedback.type === "success"
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {feedback.type === "error" && <FaExclamationTriangle className="inline ml-1" />}
          {feedback.msg}
        </div>
      )}

      {/* שער בין-ארגזי: מחייב פעולה אנושית בין סריקה לסריקה */}
      {!allScanned && awaitingNextBox && (
        <button
          type="button"
          onClick={() => setAwaitingNextBox(false)}
          className="border-none text-white rounded-full font-bold text-base py-3 px-6 bg-orange-500 mx-auto"
        >
          {t("boxScanNextBox")}
        </button>
      )}

      {!allScanned && !awaitingNextBox && (
        <div className="border-t pt-3">
          <label className="block text-sm font-bold text-gray-700 mb-1">
            {t("boxScanFieldLabel")}
          </label>
          {/* המצלמה נטענת רק כשאין סורק חומרה — זהה למסך הליקוט */}
          {!hasScanner && (
            <div className="overflow-hidden rounded-lg bg-gray-900 mb-2" style={{ height: 200 }}>
              <BarcodeScanner
                onScan={handleBarcode}
                playSoundOnScan={false}
                style={{ height: "100%", width: "100%" }}
              />
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={barcodeValue}
            onChange={(e) => setBarcodeValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitField();
              }
            }}
            dir="ltr"
            inputMode="none"
            className="w-full rounded-lg border-2 border-mainColor px-3 py-2 text-gray-900 text-lg text-center"
            placeholder={String(order?.invoice ?? "")}
          />
          <button
            type="button"
            onClick={toggleScanner}
            className="mt-2 text-xs font-bold text-gray-500 underline"
          >
            {hasScanner ? t("enableCameraScanner") : t("disableCameraScanner")}
          </button>
        </div>
      )}

      <button
        onClick={() => confirm(false)}
        disabled={!allScanned || submitting}
        className="border-none text-white rounded-full font-bold text-base py-3 px-6 flex items-center justify-center gap-1.5 bg-mainColor mx-auto disabled:opacity-50"
      >
        {submitting ? (
          <img src={spinnerLoadingImage} alt="Loading" width={20} height={20} />
        ) : (
          <FaCheckCircle />
        )}
        {t("boxScanContinue")}
      </button>

      {/* מוצג רק אחרי שנסרק לפחות ארגז אחד וטרם הושלמה הכמות — מוצא מבוקר
          למקרה שמספר הארגזים בפועל קטן ממה שהודפס (ארגזים אוחדו/אבדו). */}
      {!allScanned && scanned > 0 && (
        <button
          type="button"
          onClick={confirmFewerBoxes}
          disabled={submitting}
          className="text-orange-700 underline text-sm disabled:opacity-50"
        >
          {t("boxScanFewerBoxes")}
        </button>
      )}
    </div>
  );
}
