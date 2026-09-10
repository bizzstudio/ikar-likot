// meshek_Likut_system/src/components/Items/index.jsx
import React, { useContext, useEffect, useState } from "react";
import { Table } from "antd";
import { json, useNavigate } from "react-router-dom";
import Loader from "../Loader";
import { languageContext } from "../../App";
import "./style.css";
import { getWord, getWordString } from "../Language";
import axios from "axios";
import TabSwitcher from "../TabSwitcher";
import loginImg from "/loginImg.svg"
import OrderPreview from "../OrderPreview";
import BarcodeStockModal from "../BarcodeStockModal";
import { FiCamera } from "react-icons/fi";
import { sortOrdersByDeliveryArea, sortOrdersByPickupSlot, isAreaStart } from "../../utils/likutQueueSort";
import { formatStoreDateTime } from "../../utils/storeTime";
import { buildPickingGroups } from "../../utils/pickingGroups";
import { useDynamicTranslation } from "../../i18n/DynamicTranslation";
import { customerFullName } from "../../utils/customerName";

import dayjs from 'dayjs';
import 'dayjs/locale/he'; // ייבוא תמיכת השפה העברית
import 'dayjs/locale/en'; // ייבוא תמיכת השפה האנגלית

export default function Items({ orders, loading, setLoading, go }) {
  const { language } = useContext(languageContext);
  // שם הלקוח מגיע מה-DB ולכן מתורגם בתרגום הדינמי (ולא בטבלת המחרוזות הקבועה).
  const { tPerson } = useDynamicTranslation();

  const nav = useNavigate();

  const [data, setData] = useState([]);
  const [cityNames, setCityNames] = useState({});
  const [shippingStatus, setShippingStatus] = useState();
  const [shippings, setShippings] = useState({
    selfCollecting: [],
    deliver: [],
  });
  
  // State for order preview
  const [previewOrder, setPreviewOrder] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isBarcodeStockOpen, setIsBarcodeStockOpen] = useState(false);
  const [barcodeEntryMode, setBarcodeEntryMode] = useState("scan");

  useEffect(() => {
    go();
  }, []);

  const formatDate = (date) => {
    const formattedDate = language === 'hebrew'
      ? dayjs(date).locale('he').format('DD/MM')
      : dayjs(date).locale('en').format('DD/MM');

    const formattedTime = language === 'hebrew'
      ? dayjs(date).locale('he').format('HH:mm')
      : dayjs(date).locale('en').format('HH:mm');

    return (
      <div className="time">
        {formattedDate}
        <br />
        {formattedTime}
      </div>
    );
  };


  // מועד האיסוף מוצג באותו מבנה דו-שורתי של עמודת השעה, אבל בשעון החנות:
  // זו פגישה עם לקוח בשעה מסוימת, ומכשיר עם אזור זמן שגוי היה מכין את ההזמנה
  // בשעה הלא נכונה. מועד חסר או פגום מחזיר null, והעמודה מציגה "—".
  const renderPickupSlot = (value) => {
    const slot = formatStoreDateTime(value);
    if (!slot) return null;
    return (
      <div className="time">
        {slot.date}
        <br />
        {slot.time}
      </div>
    );
  };

  const shipment = getWord('shipment')?.props?.children;
  const selfCollected = getWord('selfCollected')?.props?.children;
  const floorWord = getWord('floor')?.props?.children;

  const rowClassName = (record, index) => {
    // קו מפריד בין אזורים — נוסף על מחלקת הצבע הקיימת ולא במקומה.
    const area = record?.areaStart && index > 0 ? " areaStart" : "";

    if (record?.status?.name === "PendingShortages") {
      return "t_red" + area;
    }
    if (record?.status?.name === "Likut") {
      if (record?.actualMelaket?.color) {
        return area.trim(); // בלי מחלקת צבע — הצבע מגיע מ-onRowStyle
      } else {
        return "t_red" + area;
      }
    } else {
      return area.trim();
    }
  };

  const onRowStyle = (orderRaw, rowIndex) => {
    if (orderRaw?.status?.name === "Likut" && orderRaw?.actualMelaket?.color) {
      return {
        style: {
          backgroundColor: `${orderRaw.actualMelaket.color}66`,
        },
      };
    }
    return {};
  };

  const translateText = async (text) => {
    try {
      let response = await axios.get(
        "https://api.mymemory.translated.net/get",
        {
          params: {
            q: text,
            langpair: "he|en",
          },
        }
      );
      return (response.data.responseData.translatedText);
    } catch (error) {
      console.error("Error translating text:", error);
    }
  };

  const columns = [
    // בלשונית האיסוף העצמי אין משמעות לכתובת — הלקוח מגיע לחנות, ומה שהמלקט
    // צריך לדעת הוא מתי ההזמנה נדרשת. לכן העמודה הראשונה שם היא מועד האיסוף
    // שהלקוח בחר, ולא כתובתו. לא מדובר בעמודה נוספת: מועד האיסוף הוצג קודם
    // בעמודה נפרדת בסוף השורה, והשארתה כאן הייתה מכפילה את אותו נתון.
    shippingStatus === 'selfCollecting'
      ? {
        title: getWord('pickupTime'),
        dataIndex: "pickupSlot",
        // הזמנות שנוצרו לפני שמועדי האיסוף הונהגו אינן נושאות מועד כלל.
        render: (value) => value || "—",
      }
      : {
        // שם הלקוח מעל הכתובת באותה עמודה: המלקט מזהה הזמנה לפי הלקוח, והכתובת
        // לבדה לא מספיקה כשיש כמה הזמנות באותה עיר. עמודה נפרדת לשם הייתה צרה
        // מדי במסך הטלפון.
        title: getWord('customerDetails'),
        dataIndex: "city",
        render: (city, record) => (
          <div>
            <div className="font-bold">
              {record.customerName ? tPerson(record.customerName) : "—"}
            </div>
            <div>{city}</div>
          </div>
        ),
      },
    {
      title: getWord('id'),
      dataIndex: "number",
      // הזמנה שממתינה להכרעת חוסרים מסומנת ב-✕ אדום בולט — סימן למלקטים שאין
      // לסגור אותה עד שהמנהל יאשר את החוסרים או יחזיר פריטים להשלמה.
      render: (text, record) =>
        record?.status?.name === "PendingShortages" ? (
          <span className="text-red-600 font-bold whitespace-nowrap">✕ {text}</span>
        ) : (
          text
        ),
    },
    // עמודות סכום וכמות הוסרו מתצוגת המלקט לפי האפיון —
    // המלקט צריך רק מידע תפעולי: כתובת, מספר הזמנה, שעה.
    //
    // בלשונית האיסוף העצמי שעת ההזמנה חסרת ערך תפעולי — מועד האיסוף כבר מוצג
    // בעמודה הראשונה, ומתי ההזמנה נקלטה באתר אינו אומר למלקט דבר. מה שכן נדרש
    // שם הוא שם הלקוח: לקוח שמגיע לחנות והזמנתו טרם לוקטה מזוהה לפי שמו, ובלעדיו
    // צריך לפתוח כל הזמנה בנפרד כדי לדעת של מי היא.
    shippingStatus === 'selfCollecting'
      ? {
        title: getWord('customerName'),
        dataIndex: "customerName",
        // התרגום נקרא בזמן הרינדור ולא בבניית הנתונים: תרגום שמגיע מאוחר יותר
        // מהשרת מרנדר מחדש דרך ההקשר, בעוד ערך שנשמר ב-state היה נשאר בעברית.
        render: (value) => (value ? tPerson(value) : "—"),
      }
      : {
        title: getWord('createAt'),
        dataIndex: "createAt",
      },
  ];

  useEffect(() => {
    if (orders && orders.length > 0) {
      orders.forEach(async order => {
        // בניית כתובת מלאה
        const cityName = language === 'hebrew' ? 
          order?.user_info?.address?.city?.city_name_he : 
          order?.user_info?.address?.city?.city_name_en;
        
        const street = order?.user_info?.address?.street || '';
        const houseNumber = order?.user_info?.address?.houseNumber || '';
        const apartmentNumber = order?.user_info?.address?.apartmentNumber;
        const floor = order?.user_info?.address?.floor;
        
        // בניית הכתובת המלאה
        let fullAddress = cityName;
        if (street) fullAddress += `, ${street}`;
        if (houseNumber) fullAddress += ` ${houseNumber}`;
        if (apartmentNumber) fullAddress += `/${apartmentNumber}`;
        // if (floor) fullAddress += `, ${floorWord} ${floor}`;
        
        setCityNames(prev => ({ ...prev, [order.invoice]: fullAddress }))
      })

      // איסוף עצמי נקבע לפי shippingOption ("1"), ולא לפי דמי משלוח: מאז שהאיסוף העצמי
      // זמין גם בערים שיש אליהן חלוקה, וגם כשעלות המשלוח של עיר היא 0, הסכום כבר לא
      // מבחין בין השניים. נפילה חזרה ל-shippingCost להזמנות ישנות שאין בהן shippingOption.
      const isSelfCollect = (o) =>
        o?.shippingOption ? String(o.shippingOption) === "1" : o?.shippingCost === 0;

      setShippings((prev) => ({
        selfCollecting: orders.filter(isSelfCollect),
        deliver: orders.filter((o) => !isSelfCollect(o)),
      }));

      if (sessionStorage.getItem("shippingStatus")) {
        setShippingStatus(sessionStorage.getItem("shippingStatus"))
      }
      else {
        setShippingStatus('deliver')
      }

      setLoading(false);

    } else if (orders) {
      // רשימה ריקה — חייבים לנקות גם את המצב הנגזר. בלי זה shippings (ולכן גם
      // הטבלה) שומרים את התוכן הקודם, והמלקט שסיים את ההזמנה האחרונה חוזר לרשימה
      // ורואה אותה עדיין שם, ניתנת ללחיצה.
      setShippings({ selfCollecting: [], deliver: [] });
      setData([]);
      setLoading(false);
    }
  }, [orders, language]);

  useEffect(() => {
    if (shippingStatus) {
      // סדר התור — שני מדדים שונים לשתי הלשוניות (src/utils/likutQueueSort.js):
      // במשלוחים קיבוץ לפי אזור גאוגרפי (כל עיר ברצף), ובאיסוף עצמי לפי מועד
      // האיסוף שהלקוח בחר — שם השאלה היא מתי הלקוח מגיע, לא לאן נוסעים.
      const sourceOrders =
        shippingStatus === "deliver"
          ? sortOrdersByDeliveryArea(shippings.deliver)
          : sortOrdersByPickupSlot(shippings.selfCollecting);

      setData(
        sourceOrders
          .map((item, index) => {
            return {
              key: item._id,
              city: cityNames[item.invoice],
              number: item.invoice,
              total: item.total,
              // collected: (sessionStorage.getItem(item.number) ? JSON.parse(sessionStorage.getItem(item.number)).length : '0') + "/" + item.cart.length,
              // מספר שורות הליקוט, לא שורות העגלה: שורות של אותו מוצר פיזי
              // (למשל תשלום + מתנה) מאוחדות במסך הליקוט, וספירה שונה כאן
              // הייתה מבטיחה למלקט מספר פריטים אחר ממה שיקבל בפועל.
              collected: buildPickingGroups(item.cart).length,
              createAt: formatDate(item.createdAt),
              // המקור בעברית כפי שנשמר בהזמנה — התרגום נעשה בעמודה עצמה.
              customerName: customerFullName(item),
              // מועד האיסוף שהלקוח בחר (איסוף עצמי בלבד). הזמנות שנוצרו לפני
              // שהמועדים הוצגו, וכל הזמנות המשלוח, יגיעו בלי הערך הזה.
              // נקרא בשעון החנות ולא בשעון המכשיר — src/utils/storeTime.js.
              pickupSlot: renderPickupSlot(item.pickupSlot),
              status: item.status,
              actualMelaket: item.actualMelaket,
              // פותחת קבוצת עיר חדשה — מצייר קו מפריד דק, כדי שהרצף הגאוגרפי
              // ייראה לעין. תמיד false באיסוף עצמי, שאינו מקובץ לפי עיר.
              areaStart: shippingStatus === "deliver" && isAreaStart(sourceOrders, index),
            };
          })
      );
    }
  }, [shippingStatus, cityNames]);

  console.log('orders: ', orders
    // ?.map(o => ({ actualMelaket: o.actualMelaket, invoice: o.invoice })).sort((a, b) => a.invoice - b.invoice)
  );

  const handleRowClick = (record, rowIndex) => {
    const orderData = orders.find(o => String(o.invoice) === String(record.number));
    setPreviewOrder(orderData);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewOrder(null);
  };

  const handleContinueToOrder = () => {
    if (previewOrder) {
      const melaketId = previewOrder?.actualMelaket?._id ?? previewOrder?.actualMelaket;
      const isTakenByOther = previewOrder.status.name === 'Likut' && melaketId && String(melaketId) !== String(localStorage.melaketId);
      if (!isTakenByOther) {
        nav("../items/" + previewOrder.invoice);
      } else {
        const m = previewOrder.actualMelaket;
        const melaketName = (language === 'hebrew' ? (m?.heName || m?.name) : (m?.name || m?.heName)) || 'מלקט אחר';
        alert(`${getWordString(language, 'orderIsCollected')} ${melaketName}`);
      }
    }
    handleClosePreview();
  };

  return (
    <div className="itemsContainer">
      {loading ? (
        <Loader />
      ) : (
        <>
          <div className="w-full border-b border-gray-200 pb-2 pt-1 px-2 from-mainColor-light/20 to-white bg-gradient-to-b">
            <img src={loginImg} alt="לוגו האיכר - מערכת ליקוט" className="h-14 mx-auto" />
          </div>

          <div className="sticky top-0 z-10 px-3 py-1.5 border-b border-gray-200 bg-white bg-opacity-90 backdrop-blur-sm">
            <TabSwitcher
              tabs={[
                {
                  id: 'selfCollecting',
                  label: `${selfCollected} (${shippings.selfCollecting ? shippings.selfCollecting.length : "0"})`,
                  content: null
                },
                {
                  id: 'deliver',
                  label: `${shipment} (${shippings.deliver ? shippings.deliver.length : "0"})`,
                  content: null
                }
              ]}
              activeTabId={shippingStatus}
              setActiveTabId={(value) => {
                sessionStorage.setItem('shippingStatus', value);
                setShippingStatus(value);
              }}
            />
            {shippingStatus === "selfCollecting" && (
              <div className="mt-24 w-full flex justify-center pb-8">
                <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setBarcodeEntryMode("scan"); setIsBarcodeStockOpen(true); }}
                  className="flex items-center gap-2 rounded-full bg-mainColor px-4 py-2 text-white hover:opacity-90"
                >
                  <FiCamera size={18} />
                  {getWord("scanBarcode")}
                </button>
                <button
                  type="button"
                  onClick={() => { setBarcodeEntryMode("manual"); setIsBarcodeStockOpen(true); }}
                  className="flex items-center gap-2 rounded-full border-2 border-mainColor bg-white px-4 py-2 text-mainColor hover:bg-mainColor/10"
                >
                  {getWord("manualBarcodeEntry")}
                </button>
                </div>
              </div>
            )}
          </div>
          <div className="p-3 pb-20 max-w-[1300px] mx-auto">
            {data.length > 0 && <Table
              onRow={(record, rowIndex) => ({
                onClick: (event) => {
                  // הזמנה שממתינה להכרעת חוסרים נעולה — אין מה לעשות בה עד
                  // שהמנהל יכריע, והשרת גם דוחה כל ניסיון לנעול אותה מחדש.
                  if (data[rowIndex]?.status?.name === "PendingShortages") {
                    alert(getWordString(language, 'orderWaitingForShortages'));
                    return;
                  }
                  const melaketId = data[rowIndex]?.actualMelaket?._id ?? data[rowIndex]?.actualMelaket;
                  const isTakenByOther = data[rowIndex].status.name === 'Likut' && melaketId && String(melaketId) !== String(localStorage.melaketId);
                  if (!isTakenByOther) {
                    handleRowClick(record, rowIndex);
                  } else {
                    const m = record.actualMelaket;
                    const melaketName = (language === 'hebrew' ? (m?.heName || m?.name) : (m?.name || m?.heName)) || 'מלקט אחר';
                    alert(`${getWordString(language, 'orderIsCollected')} ${melaketName}`);
                  }
                },
                ...onRowStyle(record, rowIndex)
              })}
              pagination={false}
              bordered={true}
              dataSource={data}
              columns={columns}
              rowClassName={rowClassName}
            />}
          </div>

          <OrderPreview
            order={previewOrder}
            isOpen={isPreviewOpen}
            onClose={handleClosePreview}
            onContinueToOrder={handleContinueToOrder}
          />

          <BarcodeStockModal
            isOpen={isBarcodeStockOpen}
            onClose={() => setIsBarcodeStockOpen(false)}
            onSuccess={() => setIsBarcodeStockOpen(false)}
            entryMode={barcodeEntryMode}
          />
        </>
      )}
    </div>
  );
};