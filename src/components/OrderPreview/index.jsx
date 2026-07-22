// src/components/OrderPreview/index.jsx
import React, { useContext, useEffect, useState, useRef } from "react";
import { Table } from "antd";
import { useNavigate } from "react-router-dom";
import { languageContext } from "../../App";
import { getWord, getWordString } from "../Language";
import logo from "../../../public/logo.jpeg";
import axios from "axios";
import { FaTimes, FaCheckCircle } from "react-icons/fa";
import dayjs from "dayjs";

export default function OrderPreview({ order, isOpen, onClose, onContinueToOrder }) {
    const { language } = useContext(languageContext);
    const nav = useNavigate();
    const tableContainerRef = useRef(null);

    const [data, setData] = useState([]);
    const [userText, setUserText] = useState("");
    const [maxVisibleItems, setMaxVisibleItems] = useState(0);

    const words = {
        name: getWord('name'),
        phone: getWord('phone'),
        id: getWord('id'),
        orderDate: getWord('orderDate'),
        address: getWord('address'),
        notes: getWord('notes'),
        floor: getWord('floor'),
        image: getWord('image'),
        quantity: getWord('quantity'),
        continueToOrder: getWord('continueToOrder'),
        orderIsCollected: getWord('orderIsCollected'),
        moreItems: getWord('moreItems'),
        totalItems: getWord('totalItems'),
    };

    const translateText = async (text) => {
        try {
            let langpair = "";
            if (language === "thai") {
                langpair = "he|th";
            } else if (language === "en") {
                langpair = "he|en";
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
            return response.data.responseData.translatedText;
        } catch (error) {
            console.error("Error translating text:", error);
            return text;
        }
    };

    const getText = async (text) => {
        if (text) {
            if (language === "hebrew") {
                setUserText(text);
            } else {
                const note = await translateText(text);
                setUserText(note);
            }
        }
    };

    // חישוב כמות המוצרים שיכולים להיות מוצגים במסך
    const calculateMaxVisibleItems = () => {
        if (!tableContainerRef.current || !order?.cart) return;

        const containerHeight = tableContainerRef.current.clientHeight;
        const tableHeaderHeight = 47; // גובה כותרת הטבלה
        const titleHeight = 178; // גובה אזור המידע העליון (בערך; כולל שורת תאריך ההזמנה)
        const itemRowHeight = 80; // גובה שורה (60px תמונה + padding)
        
        const availableHeight = containerHeight - tableHeaderHeight - titleHeight;
        const maxItems = Math.floor(availableHeight / itemRowHeight);
        
        const calculatedMax = Math.max(1, Math.min(maxItems, order.cart.length)) + 1;
        setMaxVisibleItems(calculatedMax);
    };

    useEffect(() => {
        if (order && isOpen) {
            getText(order.customer_note);
            
            // חישוב מספר המוצרים המקסימלי
            setTimeout(() => {
                calculateMaxVisibleItems();
            }, 100);
        }
    }, [order, language, isOpen]);

    // מצב השלמת חוסרים: ההזמנה חזרה ממסך החוסרים, ורק הפריטים שסומנו "החזרה
    // להשלמת ליקוט" רלוונטיים. הצגת העגלה המלאה כאן מטעה — המלקט מצפה ללקט הכל
    // ואז מגלה שהתור מכיל פריט אחד.
    const isShortageCompletion = !!order?.shortageHold?.resolvedAt;
    const repickIds = (order?.repickItems || []).map(String);
    const relevantCart =
        isShortageCompletion && repickIds.length > 0
            ? (order?.cart || []).filter((it) => repickIds.includes(String(it.id ?? it._id)))
            : order?.cart || [];

    useEffect(() => {
        if (order && maxVisibleItems > 0) {
            // הצגת המוצרים לפי המקום הפנוי במסך
            const visibleCart = relevantCart.slice(0, maxVisibleItems);
            setData(
                visibleCart.sort((a, b) => String(a.barcode).localeCompare(String(b.barcode))).map((item, index) => {
                    const barcode = item.barcode || "";
                    const productTitle = language === "hebrew" ? item.title?.he : item.title?.en;
                    return {
                        key: item._id,
                        rowBarcode: barcode,
                        rowTitle: productTitle,
                        // מוצג רק שם המוצר — המחיר הוסר מתצוגת המלקט לפי האפיון (§1: מידע תפעולי בלבד)
                        name: <div>{productTitle}</div>,
                        image: (
                            <img
                                style={{ width: "60px", height: "60px" }}
                                className="mx-auto"
                                src={item.image || logo}
                                alt={productTitle}
                            />
                        ),
                        quantity: item.quantity,
                    };
                })
            );
        }
    }, [maxVisibleItems, order, language]);

    const columns = [
        {
            title: words.image,
            dataIndex: "image",
        },
        {
            title: words.name,
            dataIndex: "name",
        },
        {
            title: words.quantity,
            dataIndex: "quantity",
        },
    ];

    const handleContinueToOrder = () => {
        const melaketId = order?.actualMelaket?._id ?? order?.actualMelaket;
        const isTakenByOther = order.status.name === 'Likut' && melaketId && String(melaketId) !== String(localStorage.melaketId);
        if (!isTakenByOther) {
            onContinueToOrder();
        } else {
            const m = order.actualMelaket;
            const melaketName = (language === 'hebrew' ? (m?.heName || m?.name) : (m?.name || m?.heName)) || 'מלקט אחר';
            alert(`${getWordString(language, 'orderIsCollected')} ${melaketName}`);
        }
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen || !order) return null;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[1000] p-5"
            onClick={handleBackdropClick}
        >
            <div className="bg-white rounded-xl w-[90%] h-[95%] max-w-[800px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                {isShortageCompletion && (
                    <div className="bg-orange-100 text-orange-800 px-4 py-2 text-sm font-bold text-center">
                        {getWordString(language, "shortageCompletionPreview")}
                    </div>
                )}
                <div className="flex-1 p-3 overflow-hidden" ref={tableContainerRef}>
                    <div className="relative h-full">
                        <div className="h-full overflow-hidden">
                            <Table
                                columns={columns}
                                dataSource={data}
                                pagination={false}
                                bordered={true}
                                scroll={false}
                                title={() => (
                                    <div>
                                        <div className="relative">
                                            <button
                                                className="absolute -top-[10px] -end-[10px] z-10 bg-transparent border-none text-xl cursor-pointer text-gray-500 p-1 rounded-lg transition-all duration-200 hover:bg-gray-200 hover:text-gray-700"
                                                onClick={onClose}
                                            >
                                                <FaTimes />
                                            </button>

                                            <p className="mb-1 leading-6">
                                                {words.name.props.children}: {order?.user_info?.name} {order?.user_info?.lastName || ''}
                                            </p>
                                            <p className="mb-1 leading-6"> {words.phone.props.children}: {order?.user_info?.contact}</p>
                                            <p className="mb-1 leading-6"> {words.id.props.children}: {order.invoice}</p>
                                            {order?.createdAt && (
                                                <p className="mb-1 leading-6"> {words.orderDate.props.children}: {dayjs(order.createdAt).format("DD/MM/YYYY HH:mm")}</p>
                                            )}
                                            <p className="mb-1 leading-6"> {words.address.props.children}: {order?.user_info?.address?.city?.city_name_he + ", " + order?.user_info?.address?.street + " " + order?.user_info?.address?.houseNumber + (order?.user_info?.address?.apartmentNumber ? "/" + order?.user_info?.address?.apartmentNumber : '') + (order?.user_info?.address?.floor ? ", " + words.floor.props.children + " " + order?.user_info?.address?.floor : '')}</p>
                                        </div>
                                        <div className="mt-2">
                                            {words.notes.props.children}:<p className="text-red-600 font-bold"> {userText}</p>
                                        </div>
                                    </div>
                                )}
                            />
                        </div>
                        {relevantCart.length > 0 && (
                            <div className="absolute -bottom-[2px] left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent flex items-end justify-center pointer-events-none">
                                <div className="bg-mainColor-superLight bg-opacity-70 text-mainColor px-4 py-2 rounded-full text-xs
                                font-medium mb-2 shadow-sm">
                                    {words.totalItems.props.children.replace('{count}', relevantCart.length)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-5 border-t border-gray-200 bg-gray-50">
                    <button
                        className="w-full border-none text-white rounded-full font-bold text-base px-4 py-3.5 flex items-center justify-center gap-1.5 bg-mainColor transition-all duration-200 hover:bg-mainColor-dark hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mainColor/40 active:translate-y-0 whitespace-nowrap"
                        onClick={handleContinueToOrder}
                    >
                        <FaCheckCircle />
                        {words.continueToOrder.props.children}
                    </button>
                </div>
            </div>
        </div>
    );
}