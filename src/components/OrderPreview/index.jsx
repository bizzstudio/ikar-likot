// src/components/OrderPreview/index.jsx
import React, { useContext, useEffect, useState, useRef } from "react";
import { Table } from "antd";
import { useNavigate } from "react-router-dom";
import { languageContext } from "../../App";
import { getWord, getWordString } from "../Language";
import logo from "../../../public/logo.jpeg";
import axios from "axios";
import BarcodeScanner from "../BarcodeScanner";
import { FaTimes, FaCheckCircle, FaBarcode, FaCamera } from "react-icons/fa";

export default function OrderPreview({ order, isOpen, onClose, onContinueToOrder }) {
    const { language } = useContext(languageContext);
    const nav = useNavigate();
    const tableContainerRef = useRef(null);

    const [data, setData] = useState([]);
    const [userText, setUserText] = useState("");
    const [maxVisibleItems, setMaxVisibleItems] = useState(0);
    const [deductModal, setDeductModal] = useState({ open: false, barcode: "", productTitle: "" });
    const [deductQuantity, setDeductQuantity] = useState("");
    const [deductSubmitting, setDeductSubmitting] = useState(false);
    const [deductError, setDeductError] = useState(null);
    const [showScannerInDeduct, setShowScannerInDeduct] = useState(false);
    const [loadDeductScanner, setLoadDeductScanner] = useState(false);

    const BASE = import.meta.env.VITE_MAIN_SERVER_URL || "";

    const words = {
        name: getWord('name'),
        phone: getWord('phone'),
        id: getWord('id'),
        address: getWord('address'),
        notes: getWord('notes'),
        floor: getWord('floor'),
        image: getWord('image'),
        quantity: getWord('quantity'),
        continueToOrder: getWord('continueToOrder'),
        close: getWord('close'),
        orderIsCollected: getWord('orderIsCollected'),
        moreItems: getWord('moreItems'),
        totalItems: getWord('totalItems'),
        scanForPick: getWord('scanForPick'),
        quantityPicked: getWord('quantityPicked'),
        deductFromStock: getWord('deductFromStock'),
        enterBarcode: getWord('enterBarcode'),
        scanBarcode: getWord('scanBarcode'),
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
        const titleHeight = 150; // גובה אזור המידע העליון (בערך)
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

    useEffect(() => {
        if (order && maxVisibleItems > 0) {
            // הצגת המוצרים לפי המקום הפנוי במסך
            const visibleCart = order.cart.slice(0, maxVisibleItems);
            setData(
                visibleCart.sort((a, b) => a.barcode - b.barcode).map((item, index) => {
                    const barcode = item.barcode || "";
                    const productTitle = language === "hebrew" ? item.title?.he : item.title?.en;
                    return {
                        key: item._id,
                        rowBarcode: barcode,
                        rowTitle: productTitle,
                        name: (
                            <div>
                                <div>{productTitle}</div>
                                <div>₪{item.price || item.originalPrice}</div>
                            </div>
                        ),
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

    const handleDeductSubmit = async () => {
        const barcode = deductModal.barcode?.trim();
        const qty = parseInt(deductQuantity, 10);
        if (!barcode || !Number.isFinite(qty) || qty < 1) return;
        setDeductSubmitting(true);
        setDeductError(null);
        try {
            await axios.patch(
                `${BASE}/products/barcode/${encodeURIComponent(barcode)}/deduct-stock-app`,
                { quantity: qty },
                { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
            );
            alert(getWordString(language, "stockDeductedSuccess"));
            setDeductModal({ open: false, barcode: "", productTitle: "" });
            setDeductQuantity("");
        } catch (err) {
            setDeductError(err?.response?.data?.message?.he || err?.response?.data?.message?.en || "שגיאה");
        } finally {
            setDeductSubmitting(false);
        }
    };

    const closeDeductModal = () => {
        setDeductModal({ open: false, barcode: "", productTitle: "" });
        setDeductQuantity("");
        setDeductError(null);
        setShowScannerInDeduct(false);
        setLoadDeductScanner(false);
    };

    const openDeductScanner = () => {
        setShowScannerInDeduct(true);
        setLoadDeductScanner(true);
    };

    const handleDeductScan = (barcode) => {
        if (!barcode?.trim()) return;
        setDeductModal((m) => ({ ...m, barcode: barcode.trim() }));
        setShowScannerInDeduct(false);
    };

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
            alert(`${words.orderIsCollected.props.children} ${melaketName}`);
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
                                            <p className="mb-1 leading-6"> {words.address.props.children}: {order?.user_info?.address?.city?.city_name_he + ", " + order?.user_info?.address?.street + " " + order?.user_info?.address?.houseNumber + (order?.user_info?.address?.apartmentNumber ? "/" + order?.user_info?.address?.apartmentNumber : '') + (order?.user_info?.address?.floor ? ", " + words.floor.props.children + " " + order?.user_info?.address?.floor : '')}</p>
                                        </div>
                                        <div className="mt-2">
                                            {words.notes.props.children}:<p className="text-red-600 font-bold"> {userText}</p>
                                        </div>
                                    </div>
                                )}
                            />
                        </div>
                        {order.cart && order.cart.length > 0 && (
                            <div className="absolute -bottom-[2px] left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent flex items-end justify-center pointer-events-none">
                                <div className="bg-mainColor-superLight bg-opacity-70 text-mainColor px-4 py-2 rounded-full text-xs 
                                font-medium mb-2 shadow-sm">
                                    {words.totalItems.props.children.replace('{count}', order.cart.length)}
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

            {/* מודל הורדה ממלאי לכל מוצר */}
            {deductModal.open && (
                <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/50 p-4" dir="rtl" onClick={(e) => e.target === e.currentTarget && closeDeductModal()}>
                    <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900">{words.scanForPick}</h3>
                            <button type="button" onClick={closeDeductModal} className="text-gray-500 hover:text-gray-700 text-xl leading-none">×</button>
                        </div>
                        {deductModal.productTitle && <p className="mb-2 text-sm text-gray-600 truncate">{deductModal.productTitle}</p>}
                        <div className="mb-3">
                            <button
                                type="button"
                                onClick={openDeductScanner}
                                className="w-full flex items-center justify-center gap-2 rounded-lg bg-mainColor py-3 px-4 text-white text-base font-medium hover:opacity-90 mb-2"
                            >
                                <FaCamera size={20} />
                                {words.scanBarcode}
                            </button>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{words.enterBarcode}</label>
                            <input
                                type="text"
                                value={deductModal.barcode}
                                onChange={(e) => setDeductModal((m) => ({ ...m, barcode: e.target.value }))}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                                dir="ltr"
                                placeholder="7290000048437"
                            />
                            {showScannerInDeduct && (
                                <div className="mt-2 overflow-hidden rounded-lg bg-gray-100" style={{ height: 200 }}>
                                    {loadDeductScanner ? (
                                        <BarcodeScanner
                                            onScan={handleDeductScan}
                                            paused={false}
                                            style={{ height: "100%", width: "100%" }}
                                        />
                                    ) : null}
                                </div>
                            )}
                            {showScannerInDeduct && (
                                <button type="button" onClick={() => setShowScannerInDeduct(false)} className="mt-1 text-sm text-gray-500 hover:text-gray-700">
                                    {getWordString(language, "close")}
                                </button>
                            )}
                        </div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{words.quantityPicked}</label>
                        <input
                            type="number"
                            min={1}
                            value={deductQuantity}
                            onChange={(e) => setDeductQuantity(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 mb-3 text-gray-900"
                        />
                        {deductError && <p className="mb-2 text-sm text-red-600">{deductError}</p>}
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={closeDeductModal} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700">{words.close}</button>
                            <button
                                type="button"
                                onClick={handleDeductSubmit}
                                disabled={deductSubmitting || !deductModal.barcode?.trim() || !deductQuantity || parseInt(deductQuantity, 10) < 1}
                                className="rounded-lg bg-mainColor px-4 py-2 text-white disabled:opacity-50"
                            >
                                {deductSubmitting ? "..." : words.deductFromStock}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 