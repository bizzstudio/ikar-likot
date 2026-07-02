// meshek_Likut_system/src/components/Item/index.jsx
import React, { useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Select, Table } from "antd";
import Loader from "../Loader";
import axios from "axios";
import logo from "../../../public/logo.jpeg";
import { languageContext } from "../../App";
import "./style.css";
import { getWord, getWordString } from "../Language";
import BarcodeScanner from "../BarcodeScanner";
import { FaCheckCircle, FaBoxOpen, FaPlus, FaMinus, FaCheck, FaBarcode, FaCamera } from "react-icons/fa";
import { FaXmark } from "react-icons/fa6";
import spinnerLoadingImage from "/spinner.gif";
import dayjs from "dayjs";
import loginImg from "/loginImg.svg"

export default function Item({ setOrders, orders, setUpdateOrders, setId, loading, setLoading }) {
  const numberOfOrder = useParams();

  const { language } = useContext(languageContext);

  const nav = useNavigate();

  const [data, setData] = useState([]);
  const [cityName, setCityName] = useState();
  const [order, setOrder] = useState();
  const [statuses, setStatuses] = useState([]);
  const [userText, setUserText] = useState("");
  const [numOfBoxes, setNumOfBoxes] = useState(0);
  // const [isLikut, setIsLikut] = useState();
  const [submiting, setSubmiting] = useState(false);
  const [pickedQuantities, setPickedQuantities] = useState({});
  const [markedItems, setMarkedItems] = useState({});
  const [scanProductModalOpen, setScanProductModalOpen] = useState(false);
  const [scanProductBarcode, setScanProductBarcode] = useState("");
  const [scanProductError, setScanProductError] = useState(null);
  const [showScannerInScanProduct, setShowScannerInScanProduct] = useState(false);
  const [loadScanProductScanner, setLoadScanProductScanner] = useState(false);

  const numOfBoxesWord = getWord('numOfBoxes');
  const choseMelaket = getWord('choseMelaket');
  const pickedAllWord = getWord('pickedAll');
  const unmarkAllWord = getWord('unmarkAll');
  const notAllItemsMarked = getWord('notAllItemsMarked');
  const words = {
    name: getWord('name'),
    id: getWord('id'),
    address: getWord('address'),
    phone: getWord('phone'),
    notes: getWord('notes'),
    floor: getWord('floor'),
    chooseStatus: getWord('chooseStatus'),
    are_you_sure: getWord('are_you_sure'),
    done: getWord('done'),
    orderNotFound: getWord('orderNotFound')
  };

  // console.log('order: ', order)
  // console.log('orders: ', orders)
  useEffect(() => {
    // תמיד למשוך את ההזמנה מהשרת כדי לקבל עגלה עם ברקודים (לסריקת מוצר)
    const fetchOrder = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_MAIN_SERVER_URL}/app/orders/${numberOfOrder.id}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        setOrder(response.data);
      } catch (error) {
        console.error("Error fetching order:", error);
        alert(words.orderNotFound.props.children);
        nav("/items");
      }
    };
    if (numberOfOrder.id) fetchOrder();
  }, [numberOfOrder.id, nav]);

  console.log('order: ', order)

  // פונקציה לשינוי כמות שנלוקטה
  const updatePickedQuantity = (productId, newQuantity) => {
    const updatedQuantities = {
      ...pickedQuantities,
      [productId]: Math.max(0, newQuantity) // מינימום 0
    };
    setPickedQuantities(updatedQuantities);

    // שמירה ב-sessionStorage
    sessionStorage.setItem(
      `pickedQuantities_${numberOfOrder.id}`,
      JSON.stringify(updatedQuantities)
    );
  };

  // פונקציה לסימון/ביטול סימון כל הצ'קבוקסים
  const toggleAllItems = () => {
    const allItemsMarked = order?.cart?.every((item) => markedItems[item._id != null ? String(item._id) : item._id] === true);

    if (allItemsMarked) {
      const allUnmarked = {};
      order.cart.forEach((item) => {
        const pid = item._id != null ? String(item._id) : item._id;
        if (pid) allUnmarked[pid] = false;
      });
      setMarkedItems(allUnmarked);

      // שמירה ב-sessionStorage
      sessionStorage.setItem(
        `markedItems_${numberOfOrder.id}`,
        JSON.stringify(allUnmarked)
      );
    } else {
      const allMarked = {};
      order.cart.forEach((item) => {
        const pid = item._id != null ? String(item._id) : item._id;
        if (pid) allMarked[pid] = true;
      });
      setMarkedItems(allMarked);

      // שמירה ב-sessionStorage
      sessionStorage.setItem(
        `markedItems_${numberOfOrder.id}`,
        JSON.stringify(allMarked)
      );
    }
  };

  // פונקציה לסימון/ביטול סימון מוצר ספציפי
  const toggleItemMark = (productId) => {
    const isCurrentlyMarked = markedItems[productId] || false;
    const updatedMarked = {
      ...markedItems,
      [productId]: !isCurrentlyMarked
    };
    setMarkedItems(updatedMarked);

    // שמירה ב-sessionStorage
    sessionStorage.setItem(
      `markedItems_${numberOfOrder.id}`,
      JSON.stringify(updatedMarked)
    );
  };

  const closeScanProductModal = () => {
    setScanProductModalOpen(false);
    setScanProductBarcode("");
    setScanProductError(null);
    setShowScannerInScanProduct(false);
    setLoadScanProductScanner(false);
    setScanSuccessItem(null);
    setDeductSubmitting(false);
  };

  const openScanProductScanner = () => {
    setShowScannerInScanProduct(true);
    setLoadScanProductScanner(true);
  };

  const handleScanProductScan = (barcode) => {
    if (!barcode?.trim()) return;
    const trimmed = barcode.trim();
    setScanProductBarcode(trimmed);
    setShowScannerInScanProduct(false);
    applyScannedBarcode(trimmed);
  };

  const productIdStr = (item) => (item?._id != null ? String(item._id) : null);
  const normalizeBarcode = (v) => String(v ?? "").trim().replace(/^0+/, "") || "";
  const [scanSuccessItem, setScanSuccessItem] = useState(null);
  const [deductSubmitting, setDeductSubmitting] = useState(false);

  const applyScannedBarcode = (barcode) => {
    const trimmed = normalizeBarcode(barcode);
    if (!trimmed || !order?.cart) return;
    const item = order.cart.find((i) => normalizeBarcode(i.barcode) === trimmed);
    if (!item) {
      setScanProductError(getWordString(language, "productNotInOrder"));
      return;
    }
    setScanProductError(null);
    const pid = productIdStr(item);
    if (!pid) return;
    const nextQuantities = { ...pickedQuantities, [pid]: item.quantity };
    setPickedQuantities(nextQuantities);
    sessionStorage.setItem(`pickedQuantities_${numberOfOrder.id}`, JSON.stringify(nextQuantities));
    const nextMarked = { ...markedItems, [pid]: true };
    setMarkedItems(nextMarked);
    sessionStorage.setItem(`markedItems_${numberOfOrder.id}`, JSON.stringify(nextMarked));
    setScanSuccessItem({ barcode: trimmed, quantity: item.quantity, title: item.title?.he || item.title?.en });
  };

  const handleDeductFromStock = async () => {
    if (!scanSuccessItem?.barcode || !scanSuccessItem?.quantity) return;
    setDeductSubmitting(true);
    try {
      await axios.patch(
        `${import.meta.env.VITE_MAIN_SERVER_URL}/products/barcode/${encodeURIComponent(scanSuccessItem.barcode)}/deduct-stock-app`,
        { quantity: scanSuccessItem.quantity },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      alert(getWordString(language, "stockDeductedSuccess"));
      closeScanProductModal();
    } catch (err) {
      alert(err?.response?.data?.message?.he || err?.response?.data?.message?.en || getWordString(language, "errorUpdateOrder"));
    } finally {
      setDeductSubmitting(false);
    }
  };

  const columns = [
    {
      title: "",
      dataIndex: "select",
      align: "center",
      width: 60,
      render: (_, record) => {
        const productId = record.key != null ? String(record.key) : record.key;
        const isMarked = markedItems[productId] || false;

        return (
          <div className="flex justify-center">
            <input
              type="checkbox"
              checked={isMarked}
              onChange={() => toggleItemMark(productId)}
            />
          </div>
        );
      }
    },
    {
      title: getWord('image'),
      dataIndex: "image",
      align: "center",
    },
    {
      title: getWord('name'),
      dataIndex: "name",
    },
    {
      title: getWord('quantity'),
      dataIndex: "quantity",
      render: (originalQuantity, record) => {
        const productId = record.key != null ? String(record.key) : record.key;
        const pickedQty = pickedQuantities[productId] !== undefined ? pickedQuantities[productId] : 0;

        return (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => updatePickedQuantity(productId, pickedQty - 1)}
              className={`w-7 h-7 border-2 border-white text-white rounded-full flex items-center justify-center transition-all duration-300 ${pickedQty <= 0
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-red-500 hover:brightness-125 active:scale-95'
                }`}
              disabled={pickedQty <= 0}
            >
              <FaMinus size={9} />
            </button>

            <div className="text-center">
              <span className="text-black font-bold text-xl">
                {pickedQty}
              </span>
            </div>

            <button
              onClick={() => updatePickedQuantity(productId, pickedQty + 1)}
              className={`w-7 h-7 border-2 border-white text-white rounded-full flex items-center justify-center transition-all duration-300 ${pickedQty >= originalQuantity
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-mainColor hover:brightness-125 active:scale-95'
                }`}
              disabled={pickedQty >= originalQuantity}
            >
              <FaPlus size={9} />
            </button>
          </div>
        );
      }
    },
    {
      title: getWord('scanForPick'),
      dataIndex: "scan",
      align: "center",
      width: 120,
      render: (_, record) => (
        <button
          type="button"
          title={getWordString(language, "scanForPick") || "סרוק מוצר"}
          onClick={() => {
            setScanProductError(null);
            setScanProductBarcode("");
            setScanSuccessItem(null);
            setScanProductModalOpen(true);
            setShowScannerInScanProduct(true);
            setLoadScanProductScanner(true);
          }}
          className="flex items-center justify-center rounded-lg bg-mainColor p-2 text-white hover:opacity-90 min-w-[44px]"
        >
          <FaBarcode size={18} />
        </button>
      ),
    },
  ];

  const translateText = async (text) => {
    try {
      let langpair = "";
      if (language === "india") {
        langpair = "he|hi"; // תרגום מעברית להודית
      } else if (language === "en") {
        langpair = "he|en"; // תרגום מעברית לאנגלית
      }

      let response = await axios.get(
        "https://api.mymemory.translated.net/get",
        {
          params: {
            q: text,
            langpair: langpair,
          },
        }
      );
      return (response.data.responseData.translatedText);
    } catch (error) {
      console.error("Error translating text:", error);
    }
  };

  const getText = async (text) => {
    if (text) {
      if (language === "hebrew") setUserText(text);
      else {
        const note = await translateText(text);
        setUserText(note)
      }
    }
  };

  // קבלת שם העיר וההערות על פי השפה
  useEffect(() => {
    if (order) {
      getText(order.customer_note)
      setCityName(language === 'hebrew' ?
        order?.user_info?.address?.city?.city_name_he :
        order?.user_info?.address?.city?.city_name_en
      )
    }
  }, [language, order]);

  // שינוי ההזמנה לסטטוס ליקוט והוצאת המשתמש במידה והיא תפוסה
  useEffect(() => {
    if (order) {
      // setLoading(true);
      const res = (async () =>
        await axios.put(
          `${import.meta.env.VITE_MAIN_SERVER_URL}/app/orders/${order._id}`, {},
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            params: {
              status: "Likut",
            },
          }
        ))().catch(err => {
          setLoading(false);
          if (order.actualMelaket?._id !== localStorage.melaketId) {
            const msgToAlert = orderAlreadyTaken.props.children;
            alert(msgToAlert);
            nav("../items");
            window.location.reload();
          } else if (err.response?.status === 409) {
            alert(err.response.data?.message?.[language] || err.response.data?.message || '');
            nav("../items");
          }
        })
    }
  }, [order]);

  const orderAlreadyTaken = getWord("alreadyTaken");

  // קבלת כל הסטטוסים
  useEffect(() => {
    const getAllStatuses = async () => {
      const res = await axios.get(
        `${import.meta.env.VITE_MAIN_SERVER_URL}/app/orders/status/getAll`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      setStatuses(res.data);
    };
    getAllStatuses();
  }, []);

  const rowClassName = () => "";

  useEffect(() => {
    if (order) {
      getText(order.customer_note);
      setData(
        order.cart.sort((a, b) => String(a.barcode || "").localeCompare(String(b.barcode || ""))).map((item) => {
          const pid = item._id != null ? String(item._id) : item._id;
          return {
            key: pid,
            name: <div>
              <div>{language === "hebrew" ? item.title.he : item.title.en}</div>
              <div>₪{item.price || item.originalPrice}</div>
            </div>,
            image: (
              <div className="flex justify-center">
                <img
                  src={item.image || logo}
                  alt={language === "hebrew" ? item.title.he : item.title.en}
                  className="rounded max-w-full h-12 object-contain"
                />
              </div>
            ),
            quantity: item.quantity,
          };
        })
      );

      // אתחול כמויות שלוקטו - טעינה מ-sessionStorage או ברירת מחדל
      const savedQuantities = sessionStorage.getItem(`pickedQuantities_${numberOfOrder.id}`);
      let initialPickedQuantities = {};

      if (savedQuantities) {
        try {
          initialPickedQuantities = JSON.parse(savedQuantities);
          order.cart.forEach((item) => {
            const pid = item._id != null ? String(item._id) : item._id;
            if (pid && initialPickedQuantities[pid] === undefined) initialPickedQuantities[pid] = item.quantity;
          });
        } catch (error) {
          console.error('Error parsing saved quantities:', error);
          order.cart.forEach((item) => {
            const pid = item._id != null ? String(item._id) : item._id;
            if (pid) initialPickedQuantities[pid] = item.quantity;
          });
        }
      } else {
        order.cart.forEach((item) => {
          const pid = item._id != null ? String(item._id) : item._id;
          if (pid) initialPickedQuantities[pid] = item.quantity;
        });
      }

      setPickedQuantities(initialPickedQuantities);

      // אתחול צ'קבוקסים - טעינה מ-sessionStorage או ברירת מחדל
      const savedMarkedItems = sessionStorage.getItem(`markedItems_${numberOfOrder.id}`);
      let initialMarkedItems = {};

      if (savedMarkedItems) {
        try {
          initialMarkedItems = JSON.parse(savedMarkedItems);
          order.cart.forEach((item) => {
            const pid = item._id != null ? String(item._id) : item._id;
            if (pid && initialMarkedItems[pid] === undefined) initialMarkedItems[pid] = false;
          });
        } catch (error) {
          console.error('Error parsing saved marked items:', error);
          order.cart.forEach((item) => {
            const pid = item._id != null ? String(item._id) : item._id;
            if (pid) initialMarkedItems[pid] = false;
          });
        }
      } else {
        order.cart.forEach((item) => {
          const pid = item._id != null ? String(item._id) : item._id;
          if (pid) initialMarkedItems[pid] = false;
        });
      }

      setMarkedItems(initialMarkedItems);
    }
  }, [order]);

  // הגדרת האי-די של ההזמנה כדי שההדר יוכל להשתמש בו לבטל את הליקוט אם יש צורך
  useEffect(() => {
    if (numberOfOrder.id) setId(numberOfOrder.id);
  }, [numberOfOrder])

  const alertMsg = getWord("alreadyDone")
  const errorUpdateOrder = getWord("errorUpdateOrder");
  const errorSendingMessage = getWord("errorSendingMessage");

  const handleDone = async () => {
    // 1) חסימה מיידית אם כבר בתהליך
    if (submiting) return;

    const melaketId = localStorage.getItem("melaketId");
    if (!melaketId) {
      localStorage.removeItem("token");
      nav("/login");
      return;
    }

    // בדיקה שכל הצ'קבוקסים מסומנים
    const allItemsMarked = order?.cart?.every((item) => markedItems[item._id != null ? String(item._id) : item._id] === true);
    if (!allItemsMarked) {
      alert(notAllItemsMarked.props.children);
      return;
    }

    // confirm לפני שמדליקים submiting כדי לא "לתקוע" את הכפתור אם המשתמש ביטל
    const confirmed = confirm(words.are_you_sure.props.children);
    if (!confirmed) return;

    // 2) עכשיו מתחילים באמת -> נועלים
    setSubmiting(true);

    try {
      const fullValue = statuses.find((status) => status._id === melaketId);

      // בדיקה שההזמנה לא נמצאת כבר בסטטוס מלקט אחר
      const isOrderAlreadyTaken = await axios
        .get(`${import.meta.env.VITE_MAIN_SERVER_URL}/app/orders/${order._id}`, {
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
            console.log("ההזמנה כבר על שם מלקט אחר!");
            return true;
          } else {
            console.log("ההזמנה לא על שם מלקט אחר");
            return false;
          }
        })
        .catch((err) => {
          console.log(err);
          return true;
        });

      if (isOrderAlreadyTaken) {
        alert(alertMsg.props.children);
        nav("../items");
        window.location.reload();
        return;
      }

      // בניית pickedItems
      const pickedItems = order.cart
        .map((item) => {
          const pid = item._id != null ? String(item._id) : item._id;
          return { _id: item._id, quantity: pickedQuantities[pid] || 0 };
        })
        .filter((item) => item.quantity > 0);

      // בניית payload ל-LionWheel (אם יש משלוח)
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

      // שליחה לפונקציה המאוחדת בשרת
      let result;
      try {
        result = await axios.post(
          `${import.meta.env.VITE_MAIN_SERVER_URL}/app/orders/send-and-update/${order._id}`,
          { pickedItems, lionwheelPayload, numOfBoxes: Number(numOfBoxes) || 1 },
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
        );
      } catch (error) {
        console.error("error :>> ", error);
        alert(errorUpdateOrder.props.children);
        return;
      }

      // שליחת נתוני ההזמנה לוואטסאפ ולמייל (אותה תבנית; לא מפיל את ה-flow אם נכשל)
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
      const mainApi = import.meta.env.VITE_MAIN_SERVER_URL;
      const appAuthHeaders = {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      };
      try {
        const settled = await Promise.allSettled([
          axios.post(
            `${kirshnerBase}/send-order-ready`,
            orderReadyPayload,
            kirshnerHeaders
          ),
          axios.post(
            `${mainApi}/app/orders/send-order-ready-email`,
            { ...orderReadyPayload, to: "EXECUTIVE@nmplus.co.il" },
            appAuthHeaders
          ),
        ]);
        const failed = settled.filter((r) => r.status === "rejected");
        if (failed.length) {
          console.error("order-ready notifications:", failed.map((r) => r.reason));
          alert(errorSendingMessage.props.children);
        }
      } catch (error) {
        console.error(error);
        alert(errorSendingMessage.props.children);
      }

      // סיום
      nav("../items");
      setUpdateOrders((prev) => !prev);
      setOrders();
    } finally {
      // 3) תמיד משחררים את הכפתור גם אם היה return באמצע או שגיאה
      setSubmiting(false);
    }
  };

  return (
    <div className="orderPage">
      {loading ? (
        <Loader />
      ) : (
        <>
          <div className="w-full border-b border-gray-200 pb-2 pt-1 px-2 from-mainColor-light/20 to-white bg-gradient-to-b">
            <img src={loginImg} alt="לוגו האיכר - מערכת ליקוט" className="h-[150px] mx-auto" />
          </div>
          <div className="flex flex-col gap-4 p-4 pb-0 max-w-[1300px] mx-auto">
            <div className="flex items-center justify-between gap-4">
              <label className="relative border-2 border-mainColor rounded-full font-bold text-base py-2 px-3 flex items-center justify-center gap-2 w-1/2 sm:w-auto focus-within:outline-1 focus-within:outline-mainColor transition-all duration-300">
                <FaBoxOpen className='text-mainColor w-4 min-w-4' />
                <input
                  placeholder={numOfBoxesWord.props.children}
                  type="number"
                  onChange={(e) => setNumOfBoxes(e.target.value)}
                  className="border-none outline-none w-full bg-transparent"
                />
              </label>
              <button
                onClick={handleDone}
                disabled={
                  // בדיקה שיש לפחות מוצר אחד שנלוקט עם כמות גדולה מ-0
                  !Object.values(pickedQuantities).some(qty => qty > 0) ||
                  numOfBoxes == 0
                }
                className='border-none text-white rounded-full font-bold text-base py-2.5 px-4 flex items-center justify-center gap-1.5 bg-mainColor w-1/2 sm:w-auto whitespace-nowrap disabled:opacity-50'>
                {submiting ? <img
                  src={spinnerLoadingImage}
                  alt="Loading"
                  width={20}
                  height={20}
                /> : <FaCheckCircle />}{words.done}
              </button>
            </div>

            <div className="flex gap-2 justify-center">
              {(() => {
                const allItemsMarked = order?.cart?.every((item) => markedItems[item._id != null ? String(item._id) : item._id] === true);
                return (
                  <button
                    onClick={toggleAllItems}
                    className='border-none text-white rounded-full font-bold text-base py-2.5 px-4 flex items-center justify-center gap-1.5 bg-mainColor sm:flex-grow-0 flex-grow whitespace-nowrap'
                  >
                    {allItemsMarked ? <FaXmark size={21} /> : <FaCheck size={16} />}
                    {allItemsMarked ? unmarkAllWord : pickedAllWord}
                  </button>
                );
              })()}
            </div>
          </div>
          {order ? (
            <div className="p-4 pb-20 max-w-[1300px] mx-auto">
              <Table
                columns={columns}
                dataSource={data}
                pagination={false}
                bordered={true}
                rowClassName={rowClassName}
                title={() => (
                  <div>
                    <div>
                      <p>
                        {words.name}: {order?.user_info?.name} {order?.user_info?.lastName || ''}
                      </p>
                      <p> {words.phone}: {order?.user_info?.contact}</p>
                      <p> {words.id}: {numberOfOrder.id}</p>
                      <p> {words.address}: {order?.user_info?.address?.city?.city_name_he + ", " + order?.user_info?.address?.street + " " + order?.user_info?.address?.houseNumber + (order?.user_info?.address?.apartmentNumber ? "/" + order?.user_info?.address?.apartmentNumber : '') + (order?.user_info?.address?.floor ? ", " + words.floor.props.children + " " + order?.user_info?.address?.floor : 1)}</p>
                    </div>
                    <div>
                      {words.notes}:<p className="text_red"> {userText}</p>
                    </div>
                  </div>
                )}
              />
            </div>
          ) : (
            <Loader />
          )}

          {/* מודל סריקת מוצר – עדכון כמות לפי ההזמנה + הורד ממלאי */}
          {scanProductModalOpen && (
            <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/50 p-4" dir="rtl" onClick={(e) => e.target === e.currentTarget && closeScanProductModal()}>
              <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">{getWordString(language, "scanForPick")}</h3>
                  <button type="button" onClick={closeScanProductModal} className="text-gray-500 hover:text-gray-700 text-xl leading-none">×</button>
                </div>
                {scanSuccessItem ? (
                  <>
                    <p className="mb-2 text-sm text-green-700 font-medium">הכמות עודכנה לכמות בהזמנה.</p>
                    {scanSuccessItem.title && <p className="mb-2 text-sm text-gray-600 truncate">{scanSuccessItem.title}</p>}
                    <p className="mb-3 text-sm text-gray-500">כמות: {scanSuccessItem.quantity}</p>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={closeScanProductModal} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700">{getWordString(language, "close")}</button>
                      <button
                        type="button"
                        onClick={handleDeductFromStock}
                        disabled={deductSubmitting}
                        className="rounded-lg bg-mainColor px-4 py-2 text-white disabled:opacity-50"
                      >
                        {deductSubmitting ? "..." : getWordString(language, "deductFromStock")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-2 text-sm text-gray-600">{getWordString(language, "scanInstructions")}</p>
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={openScanProductScanner}
                        className="w-full flex items-center justify-center rounded-lg bg-mainColor py-3 px-4 text-white hover:opacity-90 mb-2 min-h-[48px]"
                        title={getWordString(language, "scanBarcode")}
                      >
                        <FaCamera size={24} />
                      </button>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{getWordString(language, "enterBarcode")}</label>
                      <input
                        type="text"
                        value={scanProductBarcode}
                        onChange={(e) => { setScanProductBarcode(e.target.value); setScanProductError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") applyScannedBarcode(e.target.value); }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                        dir="ltr"
                        placeholder="7290000048437"
                      />
                      {showScannerInScanProduct && (
                        <div className="mt-2 overflow-hidden rounded-lg bg-gray-100" style={{ height: 200 }}>
                          {loadScanProductScanner ? (
                            <BarcodeScanner
                              onScan={handleScanProductScan}
                              paused={false}
                              style={{ height: "100%", width: "100%" }}
                            />
                          ) : null}
                        </div>
                      )}
                      {showScannerInScanProduct && (
                        <button type="button" onClick={() => setShowScannerInScanProduct(false)} className="mt-1 text-sm text-gray-500 hover:text-gray-700">
                          {getWordString(language, "close")}
                        </button>
                      )}
                    </div>
                    {scanProductError && <p className="mb-2 text-sm text-red-600">{scanProductError}</p>}
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={closeScanProductModal} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700">{getWordString(language, "close")}</button>
                      <button
                        type="button"
                        onClick={() => applyScannedBarcode(scanProductBarcode)}
                        disabled={!scanProductBarcode?.trim()}
                        className="rounded-lg bg-mainColor px-4 py-2 text-white disabled:opacity-50"
                      >
                        {getWordString(language, "scanProductApply")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};