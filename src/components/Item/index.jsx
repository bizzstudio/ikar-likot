// meshek_Likut_system/src/components/Item/index.jsx
// מסך ליקוט מונחה פריט-אחר-פריט (אפיון "אפיון שינויים לתהליך ליקוט").
// עקרונות: מוצג פריט אחד בכל פעם, שדה ברקוד בפוקוס אוטומטי, כל סריקה תקינה +1,
// חריגה מעל הכמות נחסמת, אפשר לדלג (הפריט חוזר בהמשך), ובאישור מיוחד לסמן בחוסר.
// שדה מספר הארגזים מוצג רק במסך הסיום. לוגיקת ה-handleDone נשמרה 1:1 מהגרסה הקודמת.
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { languageContext } from "../../App";
import "./style.css";
import { getWordString } from "../Language";
import BarcodeScanner from "../BarcodeScanner";
import {
  FaCheckCircle,
  FaBoxOpen,
  FaForward,
  FaCamera,
  FaListUl,
  FaExclamationTriangle,
  FaPlus,
  FaMinus,
} from "react-icons/fa";
import spinnerLoadingImage from "/spinner.gif";
import dayjs from "dayjs";
import loginImg from "/loginImg.svg";
import { playScanSuccess, playScanError } from "../../utils/soundFeedback";

const API = import.meta.env.VITE_MAIN_SERVER_URL;

// Placeholder ניטרלי לתמונת מוצר חסרה/שבורה (מצבי קצה — "הצגת Placeholder").
// SVG מוטמע כדי שלא יהיה תלוי ברשת.
const IMG_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='#f3f4f6'/><g fill='none' stroke='#9ca3af' stroke-width='3'><circle cx='34' cy='34' r='7'/><path d='M18 72l22-24 14 16 10-10 14 14'/></g></svg>"
  );

// נרמול ברקוד להשוואה — עקבי עם lib/normalizeBarcode בבקנד (בלי הסרת אפסים מובילים)
const normalizeBarcode = (v) =>
  String(v ?? "").trim().replace(/\s+/g, "").toUpperCase();
const productIdStr = (item) => (item?._id != null ? String(item._id) : null);

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

export default function Item({ setOrders, setUpdateOrders, setId, loading }) {
  const numberOfOrder = useParams();
  const { language } = useContext(languageContext);
  const nav = useNavigate();
  const t = (key) => getWordString(language, key);

  const [order, setOrder] = useState();
  const [statuses, setStatuses] = useState([]);
  const [userText, setUserText] = useState("");
  const [numOfBoxes, setNumOfBoxes] = useState("");
  const [submiting, setSubmiting] = useState(false);

  const [pickedQuantities, setPickedQuantities] = useState({}); // pid -> כמות שנלקטה בפועל
  const [shortageItems, setShortageItems] = useState({}); // pid -> true (סומן בחוסר)
  const [queue, setQueue] = useState([]); // סדר הפריטים; דילוג מזיז לסוף

  const [barcodeValue, setBarcodeValue] = useState("");
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', msg }
  const [showCamera, setShowCamera] = useState(false);
  const [showList, setShowList] = useState(false);
  const [shortageModal, setShortageModal] = useState(false);

  const barcodeInputRef = useRef(null);
  const lastScanRef = useRef(0);

  // ---- שליפת ההזמנה ----
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await axios.get(`${API}/app/orders/${numberOfOrder.id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        setOrder(response.data);
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

  // ---- מפות עזר ----
  const cartByPid = useMemo(() => {
    const m = {};
    (order?.cart || []).forEach((it) => {
      const pid = productIdStr(it);
      if (pid) m[pid] = it;
    });
    return m;
  }, [order]);

  const reqOf = (pid) => cartByPid[pid]?.quantity || 0;
  const pickedOf = (pid) => pickedQuantities[pid] || 0;
  const isDone = (pid) => !!shortageItems[pid] || pickedOf(pid) >= reqOf(pid);

  // הפריט הנוכחי = הראשון בתור שעדיין לא הושלם/סומן בחוסר
  const currentPid = useMemo(
    () => queue.find((pid) => !isDone(pid)) ?? null,
    [queue, pickedQuantities, shortageItems, cartByPid]
  );
  const currentItem = currentPid ? cartByPid[currentPid] : null;

  const allItems = order?.cart || [];
  const doneCount = allItems.filter((it) => isDone(productIdStr(it))).length;
  const totalCount = allItems.length;
  const allHandled = totalCount > 0 && doneCount === totalCount;

  // ---- אתחול תור וכמויות מ-sessionStorage או מהשרת ----
  useEffect(() => {
    if (!order?.cart) return;
    const id = numberOfOrder.id;

    // סדר תצוגה: לפי ברקוד (יציב), אלא אם נשמר תור קודם
    const defaultOrder = [...order.cart]
      .sort((a, b) => String(a.barcode || "").localeCompare(String(b.barcode || "")))
      .map((it) => productIdStr(it))
      .filter(Boolean);

    // מקור אמת ראשון: התקדמות שנשמרה בשרת (המשך מאותו מצב גם בין מכשירים).
    // נפילה חזרה ל-sessionStorage המקומי, ואז לברירת מחדל.
    const sp = order.likutProgress;
    if (sp && typeof sp === "object") {
      setPickedQuantities(sp.pickedQuantities || {});
      setShortageItems(sp.shortageItems || {});
      if (sp.numOfBoxes != null) setNumOfBoxes(String(sp.numOfBoxes));
      setQueue(
        Array.isArray(sp.queue) && sp.queue.length === defaultOrder.length
          ? sp.queue
          : defaultOrder
      );
    } else {
      const savedQueue = safeParse(sessionStorage.getItem(`queue_${id}`));
      setQueue(
        Array.isArray(savedQueue) && savedQueue.length === defaultOrder.length
          ? savedQueue
          : defaultOrder
      );
      setPickedQuantities(safeParse(sessionStorage.getItem(`pickedQuantities_${id}`)) || {});
      setShortageItems(safeParse(sessionStorage.getItem(`shortageItems_${id}`)) || {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  // שמירת התקדמות לשרת (debounced) בכל שינוי — מאפשר המשך מאותו מצב אחרי סגירה/החלפת מכשיר
  useEffect(() => {
    if (!order?._id) return;
    const timer = setTimeout(() => {
      axios
        .patch(
          `${API}/app/orders/${numberOfOrder.id}/progress`,
          { progress: { pickedQuantities, shortageItems, queue, numOfBoxes } },
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        )
        .catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedQuantities, shortageItems, queue, numOfBoxes]);

  // הערת לקוח (בעברית כמו שהיא; שאר השפות — הטקסט המקורי, ללא תרגום חיצוני חוסם)
  useEffect(() => {
    if (order) setUserText(order.customer_note || "");
  }, [order]);

  // ---- נעילת ההזמנה למלקט ----
  useEffect(() => {
    if (!order) return;
    axios
      .put(`${API}/app/orders/${order._id}`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        params: { status: "Likut" },
      })
      .catch((err) => {
        if (order.actualMelaket?._id !== localStorage.melaketId) {
          alert(t("alreadyTaken"));
          nav("../items");
          window.location.reload();
        } else if (err.response?.status === 409) {
          alert(err.response.data?.message?.[language] || err.response.data?.message || "");
          nav("../items");
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

  // פוקוס אוטומטי על שדה הברקוד בכל מעבר פריט / סגירת מודל
  useEffect(() => {
    if (!showCamera && !showList && !shortageModal && !allHandled) {
      const el = barcodeInputRef.current;
      if (el) setTimeout(() => el.focus(), 60);
    }
  }, [currentPid, showCamera, showList, shortageModal, allHandled]);

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
  const persistQueue = (next) => {
    setQueue(next);
    sessionStorage.setItem(`queue_${numberOfOrder.id}`, JSON.stringify(next));
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

  const flashSuccess = (msg) => {
    setFeedback({ type: "success", msg });
    playScanSuccess();
  };
  const flashError = (msg) => {
    setFeedback({ type: "error", msg });
    playScanError();
  };

  // ---- טיפול בסריקה מול הפריט הנוכחי ----
  const handleBarcode = (raw) => {
    const scanned = normalizeBarcode(raw);
    if (!scanned) return;
    // מניעת קליטה כפולה מהירה
    const now = Date.now();
    if (now - lastScanRef.current < 400) return;
    lastScanRef.current = now;

    if (!currentItem) return;
    const pid = currentPid;
    const req = reqOf(pid);
    const cur = pickedOf(pid);

    const matchesCurrent = itemMatchesBarcode(currentItem, scanned);
    if (matchesCurrent) {
      if (cur >= req) {
        // חריגה — חסימה + התראה
        flashError(t("overQuantityMsg"));
        logScan("over_quantity", currentItem._id, scanned, cur);
        return;
      }
      const nextVal = cur + 1;
      persistPicked({ ...pickedQuantities, [pid]: nextVal });
      flashSuccess(t("scanValidMsg"));
      logScan("valid", currentItem._id, scanned, nextVal);
      return;
    }

    // האם הברקוד שייך לפריט אחר בהזמנה?
    const other = allItems.find((i) => itemMatchesBarcode(i, scanned));
    const expectedName = itemName(currentItem); // שם הפריט הצפוי (§3.6)
    if (other) {
      const otherName = language === "hebrew" ? other.title?.he : other.title?.en;
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
    setShowCamera(false);
    handleBarcode(barcode);
  };

  // ---- עדכון כמות ידני (מותר תמיד; ברירת המחדל היא סריקה) ----
  const manualAdjust = (delta) => {
    if (!currentPid) return;
    const req = reqOf(currentPid);
    const next = Math.max(0, Math.min(req, pickedOf(currentPid) + delta)); // חסימת חריגה גם ידנית
    persistPicked({ ...pickedQuantities, [currentPid]: next });
  };

  // ---- דילוג: הפריט הנוכחי יוצג שוב בהמשך ----
  const skipCurrent = () => {
    if (!currentPid) return;
    const rest = queue.filter((p) => p !== currentPid);
    persistQueue([...rest, currentPid]);
    setFeedback(null);
  };

  // ---- קפיצה לפריט מתוך הרשימה המלאה ----
  const jumpToItem = (pid) => {
    if (isDone(pid)) return;
    const rest = queue.filter((p) => p !== pid);
    persistQueue([pid, ...rest]);
    setShowList(false);
  };

  // ---- סימון בחוסר (המלקט מאשר לבד; הפעולה נרשמת לבקרה) ----
  const openShortage = () => setShortageModal(true);
  const confirmShortage = () => {
    if (!currentPid) return;
    persistShortage({ ...shortageItems, [currentPid]: true });
    // תיעוד: מי (מהטוקן בשרת), מתי, איזה פריט
    logScan("shortage", currentItem?._id, currentItem?.barcode, pickedOf(currentPid));
    setShortageModal(false);
    setFeedback(null);
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
    const allDone = order?.cart?.every((item) => isDone(productIdStr(item)));
    if (!allDone) {
      alert(t("notAllItemsMarked"));
      return;
    }

    const confirmed = confirm(t("are_you_sure"));
    if (!confirmed) return;

    setSubmiting(true);
    try {
      const fullValue = statuses.find((status) => status._id === melaketId);

      const isOrderAlreadyTaken = await axios
        .get(`${API}/app/orders/${order._id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        })
        .then((res) => {
          if (
            res.data.status.name !== "Cancel" &&
            res.data.status.name !== "Pending" &&
            res.data.status.name !== "Likut" &&
            res.data.status.name !== "Processing" &&
            res.data.status.name !== "Delivered"
          ) {
            return true;
          }
          return false;
        })
        .catch(() => true);

      if (isOrderAlreadyTaken) {
        alert(t("alreadyDone"));
        nav("../items");
        window.location.reload();
        return;
      }

      // בניית pickedItems לפי הכמות שנלקטה בפועל
      const pickedItems = order.cart
        .map((item) => {
          const pid = productIdStr(item);
          return { _id: item._id, quantity: pickedQuantities[pid] || 0 };
        })
        .filter((item) => item.quantity > 0);

      let lionwheelPayload = null;
      if (order.shippingCost != 0) {
        lionwheelPayload = {
          pickup_at: new Date().toISOString(),
          "תאריך יצירת ההזמנה": order.createdAt
            ? dayjs(order.createdAt).format("DD/MM/YYYY HH:mm")
            : dayjs().format("DD/MM/YYYY HH:mm"),
          company_id: "71145",
          original_order_id: numberOfOrder.id,
          notes: `${order.customer_note ? order.customer_note + "." : ""}
  ${order.callOnArrival === false ? "נא להניח את ההזמנה ליד הדלת." : ""}`,
          source_city: "מושב קדרון",
          source_street: "הרימון",
          source_number: "12",
          source_recipient_name: "האיכר",
          source_phone: "0586692614",
          destination_city: order?.user_info?.address?.city?.city_name_he,
          destination_street: order?.user_info?.address?.street,
          destination_number: order?.user_info?.address?.houseNumber,
          destination_floor: (() => {
            const floorValue = parseInt(order?.user_info?.address?.floor, 10);
            return isNaN(floorValue) || floorValue <= 0 ? 1 : floorValue;
          })(),
          destination_apartment: order?.user_info?.address?.apartmentNumber,
          destination_notes: order?.user_info?.address?.entryCode
            ? "קוד כניסה לבניין: " + order?.user_info?.address?.entryCode
            : "",
          destination_recipient_name: `${order?.user_info?.name} ${order?.user_info?.lastName || ""}`,
          destination_phone: order?.user_info?.contact,
          line_items: [{ name: "ארגזים", quantity: numOfBoxes }],
          packages_quantity: numOfBoxes,
          money_collect: 0,
        };
      }

      let result;
      try {
        result = await axios.post(
          `${API}/app/orders/send-and-update/${order._id}`,
          { pickedItems, lionwheelPayload, numOfBoxes: Number(numOfBoxes) || 1 },
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );
      } catch (error) {
        console.error("error :>> ", error);
        alert(t("errorUpdateOrder"));
        return;
      }

      const orderReadyPayload = {
        date: order.createdAt,
        userFirstName: order?.user_info?.name,
        userLastName: order?.user_info?.lastName,
        userPhone: order?.user_info?.contact,
        orderInvoice: order.invoice,
        total: order.total,
        shipping: order.shippingCost,
        notes: userText,
        melaketName: fullValue?.heName,
        melaketPhone: fullValue?.phone,
        tracking_link: result?.data?.lionwheelResponse?.tracking_link,
      };
      const kirshnerBase = import.meta.env.VITE_KIRSHNER_WHATSAPP_SERVER_URL;
      const kirshnerHeaders = {
        headers: { "x-api-key": import.meta.env.VITE_KIRSHNER_WHATSAPP_API_KEY },
      };
      const appAuthHeaders = {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      };
      try {
        const settled = await Promise.allSettled([
          axios.post(`${kirshnerBase}/send-order-ready`, orderReadyPayload, kirshnerHeaders),
          axios.post(`${API}/app/orders/send-order-ready-email`, orderReadyPayload, appAuthHeaders),
        ]);
        const failed = settled.filter((r) => r.status === "rejected");
        if (failed.length) {
          console.error("order-ready notifications:", failed.map((r) => r.reason));
          alert(t("errorSendingMessage"));
        }
      } catch (error) {
        console.error(error);
        alert(t("errorSendingMessage"));
      }

      nav("../items");
      setUpdateOrders((prev) => !prev);
      setOrders();
    } finally {
      setSubmiting(false);
    }
  };

  // ---- תצוגה ----
  const itemName = (it) => (language === "hebrew" ? it?.title?.he : it?.title?.en) || it?.title?.he || "";
  const statusOf = (pid) => {
    if (shortageItems[pid]) return { key: "statusShortage", cls: "bg-orange-100 text-orange-700" };
    const p = pickedOf(pid);
    const r = reqOf(pid);
    if (p >= r && r > 0) return { key: "statusDone", cls: "bg-green-100 text-green-700" };
    if (p > 0) return { key: "statusInProgress", cls: "bg-blue-100 text-blue-700" };
    return { key: "statusWaiting", cls: "bg-gray-100 text-gray-600" };
  };

  const header = (
    <div className="w-full border-b border-gray-200 pb-2 pt-1 px-2 from-mainColor-light/20 to-white bg-gradient-to-b">
      <img src={loginImg} alt="לוגו האיכר - מערכת ליקוט" className="h-[150px] mx-auto" />
    </div>
  );

  if (loading || !order) {
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
              {t("itemWord")} {Math.min(doneCount + 1, totalCount)} {t("ofWord")} {totalCount}
            </span>
          )}
        </div>
        <div className="flex gap-2 mb-4">
          <div className="flex-1 rounded-lg bg-blue-50 text-blue-800 text-center py-2 font-bold">
            {t("remainingWord")}: {totalCount - doneCount}
          </div>
          <div className="flex-1 rounded-lg bg-green-50 text-green-800 text-center py-2 font-bold">
            {t("pickedWord")}: {doneCount}
          </div>
        </div>

        {allHandled ? (
          /* ---- מסך סיום ---- */
          <div className="rounded-2xl border-2 border-mainColor p-6 text-center flex flex-col gap-4">
            <FaCheckCircle className="text-green-500 mx-auto" size={48} />
            <h2 className="text-xl font-bold text-gray-900">{t("finishOrderTitle")} {order.invoice}</h2>
            <p className="text-gray-600">{t("allItemsHandled")}</p>
            <p className="text-gray-700 font-bold">
              {t("pickedWord")}: {doneCount} {t("ofWord")} {totalCount}
            </p>
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
                <p className="text-gray-700">
                  {t("requiredQty")}: <b>{reqOf(currentPid)}</b>
                </p>
                <p className="text-gray-700">
                  {t("pickedQty")}: <b className="text-mainColor text-xl">{pickedOf(currentPid)}</b>{" "}
                  {t("ofWord")} {reqOf(currentPid)}
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

            {/* שדה ברקוד בפוקוס אוטומטי */}
            <div className="p-4 border-t bg-gray-50">
              <label className="block text-sm font-bold text-gray-700 mb-1">
                {t("scanFieldLabel")}
              </label>
              <div className="flex gap-2">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  autoFocus
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
                  className="flex-1 rounded-lg border-2 border-mainColor px-3 py-2 text-gray-900 text-lg"
                  placeholder="7290000000000"
                />
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="rounded-lg bg-mainColor px-4 text-white flex items-center"
                  title={t("scanBarcode")}
                >
                  <FaCamera size={20} />
                </button>
              </div>

              {/* עדכון כמות ידני — מותר תמיד, משני לסריקה */}
              <div className="mt-3 flex items-center justify-center gap-3">
                <span className="text-sm text-gray-500">{t("manualQtyUpdate")}:</span>
                <button
                  onClick={() => manualAdjust(-1)}
                  disabled={pickedOf(currentPid) <= 0}
                  className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center disabled:bg-gray-300"
                >
                  <FaMinus size={10} />
                </button>
                <span className="font-bold text-lg w-6 text-center">{pickedOf(currentPid)}</span>
                <button
                  onClick={() => manualAdjust(1)}
                  disabled={pickedOf(currentPid) >= reqOf(currentPid)}
                  className="w-8 h-8 rounded-full bg-mainColor text-white flex items-center justify-center disabled:bg-gray-300"
                >
                  <FaPlus size={10} />
                </button>
              </div>
            </div>

            {/* פעולות */}
            <div className="grid grid-cols-3 gap-px bg-gray-200 border-t">
              <button
                onClick={skipCurrent}
                className="bg-white py-3 flex flex-col items-center gap-1 text-gray-700 text-sm"
              >
                <FaForward /> {t("skipItem")}
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
        ) : null}

        {/* פרטי לקוח + הערות */}
        <div className="mt-4 text-sm text-gray-600 leading-6">
          <p>
            {t("name")}: {order?.user_info?.name} {order?.user_info?.lastName || ""}
          </p>
          <p>
            {t("phone")}: {order?.user_info?.contact}
          </p>
          {userText && (
            <p>
              {t("notes")}: <span className="text_red">{userText}</span>
            </p>
          )}
        </div>
      </div>

      {/* ---- מודל מצלמה ---- */}
      {showCamera && (
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowCamera(false)}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-bold">{t("scanBarcode")}</h3>
              <button onClick={() => setShowCamera(false)} className="text-gray-500 text-xl">
                ×
              </button>
            </div>
            <div className="overflow-hidden rounded-lg bg-gray-100" style={{ height: 240 }}>
              <BarcodeScanner
                onScan={handleCameraScan}
                paused={false}
                playSoundOnScan={false}
                style={{ height: "100%", width: "100%" }}
              />
            </div>
          </div>
        </div>
      )}

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
              {allItems.map((it) => {
                const pid = productIdStr(it);
                const st = statusOf(pid);
                return (
                  <button
                    key={pid}
                    onClick={() => jumpToItem(pid)}
                    disabled={isDone(pid)}
                    className="flex items-center gap-3 rounded-lg border p-2 text-right disabled:opacity-60"
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
                        {pickedOf(pid)}/{reqOf(pid)}
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
