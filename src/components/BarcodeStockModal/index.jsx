import React, { useState, useEffect, useRef, useContext } from "react";
import { languageContext } from "../../App";
import { getWord, getWordString } from "../Language";
import axios from "axios";
import BarcodeScanner from "../BarcodeScanner";

const BASE = import.meta.env.VITE_MAIN_SERVER_URL || "";

export default function BarcodeStockModal({ isOpen, onClose, onSuccess, entryMode = "scan" }) {
  const { language } = useContext(languageContext);
  const t = (key) => getWordString(language, key);

  const [step, setStep] = useState("scan");
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [manualBarcodeInput, setManualBarcodeInput] = useState("");
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loadScanner, setLoadScanner] = useState(false);

  const [newProduct, setNewProduct] = useState({
    productTitle: "",
    productImage: "",
    supplier: "",
    sortCode: "",
    weight: "",
    weightUnit: "",
    kashrut: "",
    categories: "",
    stockQuantity: "",
    expiryDate: "",
    minStockAlert: "",
    salePrice: "",
    purchasePrice: "",
  });
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadImageError, setUploadImageError] = useState(null);
  const galleryInputRef = useRef(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setStep("scan");
      setScannedBarcode(null);
      setManualBarcodeInput("");
      setProduct(null);
      setQuantity("");
      setLoading(false);
      setSubmitting(false);
      setError(null);
      setLoadScanner(false);
      setNewProduct({
        productTitle: "",
        productImage: "",
        supplier: "",
        sortCode: "",
        weight: "",
        weightUnit: "",
        kashrut: "",
        categories: "",
        stockQuantity: "",
        expiryDate: "",
        minStockAlert: "",
        salePrice: "",
        purchasePrice: "",
      });
      setCreatingProduct(false);
      setUploadingImage(false);
      setUploadImageError(null);
      setShowCameraModal(false);
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    } else {
      const id = setTimeout(() => setLoadScanner(true), 100);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // ניקוי בטוח בהסרת הרכיב: עוצר את המצלמה ללא תנאי כדי שנורית המצלמה לא תישאר
  // דולקת אם המודל הוסר מה-DOM בזמן שהמצלמה פתוחה.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
    };
  }, []);

  const token = localStorage.getItem("token");

  const fetchProductByBarcode = async (barcode) => {
    if (!barcode?.trim() || loading) return;
    const trimmed = String(barcode).trim();
    setScannedBarcode(trimmed);
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(
        `${BASE}/products/barcode/${encodeURIComponent(trimmed)}/app`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const prod = res?.data;
      if (prod && (prod._id || prod.id)) {
        setProduct(prod);
        setStep("quantity");
      } else {
        setError(t("productNotFoundBarcode"));
      }
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 400) {
        setError(t("productNotFoundBarcode"));
      } else {
        setError(err?.response?.data?.message?.he || err?.response?.data?.message?.en || "שגיאה");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleScan = (barcode) => {
    if (loading || !barcode?.trim()) return;
    fetchProductByBarcode(barcode.trim());
  };

  const handleManualSearch = () => {
    if (!manualBarcodeInput?.trim()) return;
    fetchProductByBarcode(manualBarcodeInput.trim());
  };

  const handleAddStock = async () => {
    const qty = parseInt(quantity, 10);
    if (!scannedBarcode || !Number.isFinite(qty) || qty < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      await axios.patch(
        `${BASE}/products/barcode/${encodeURIComponent(scannedBarcode)}/add-stock-app`,
        { quantity: qty },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(t("stockAddedSuccess"));
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message?.he || err?.response?.data?.message?.en || "שגיאה בעדכון מלאי");
    } finally {
      setSubmitting(false);
    }
  };

  const uploadImageFile = async (file) => {
    if (!file || !file.type?.startsWith("image/")) return;
    setUploadImageError(null);
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "products");
      const res = await axios.post(`${BASE}/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      const link = res?.data?.link;
      if (link) {
        updateNewProduct("productImage", link);
      } else {
        setUploadImageError(language === "hebrew" ? "לא התקבל קישור לתמונה" : "No image link received");
      }
    } catch (err) {
      setUploadImageError(err?.response?.data?.message || err?.message || (language === "hebrew" ? "שגיאה בהעלאת תמונה" : "Error uploading image"));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageSelect = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    await uploadImageFile(file);
    e.target.value = "";
  };

  useEffect(() => {
    if (!showCameraModal || !videoRef.current) return;
    setCameraError(null);
    const video = videoRef.current;
    const constraints = { video: { facingMode: "environment" } };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        streamRef.current = stream;
        video.srcObject = stream;
        video.play().catch(() => {});
      })
      .catch((err) => {
        setCameraError(language === "hebrew" ? "לא ניתן לפתוח את המצלמה" : "Could not open camera");
        console.error(err);
      });
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      video.srcObject = null;
    };
  }, [showCameraModal, language]);

  const closeCameraModal = () => {
    setShowCameraModal(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleCapturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.srcObject || !streamRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
        closeCameraModal();
        await uploadImageFile(file);
      },
      "image/jpeg",
      0.9
    );
  };

  const handleCreateProduct = async () => {
    const { productTitle, productImage, supplier, sortCode, weight, weightUnit, kashrut, categories, stockQuantity, expiryDate, minStockAlert, salePrice, purchasePrice } = newProduct;
    if (!scannedBarcode?.trim() || !productTitle?.trim()) {
      setError(language === "hebrew" ? "נא למלא שם מוצר" : "Please fill product name");
      return;
    }
    setCreatingProduct(true);
    setError(null);
    try {
      const payload = {
        barcode: scannedBarcode.trim(),
        title: { he: (productTitle || "").trim(), en: (productTitle || "").trim() },
        image: (productImage || "").trim() || undefined,
        supplier: (supplier || "").trim() || undefined,
        sortCode: (sortCode || "").trim() || undefined,
        weight: weight === "" ? undefined : parseFloat(weight),
        weightUnit: (weightUnit || "").trim() || undefined,
        kashrut: (kashrut || "").trim() || undefined,
        categories: (categories || "").trim() ? (categories || "").split(/[,،]/).map((s) => s.trim()).filter(Boolean) : undefined,
        stockQuantity: stockQuantity === "" ? 0 : parseInt(stockQuantity, 10),
        expiryDate: (expiryDate || "").trim() || undefined,
        minStockAlert: minStockAlert === "" ? undefined : parseInt(minStockAlert, 10),
        salePrice: salePrice === "" ? undefined : parseFloat(salePrice),
        purchasePrice: purchasePrice === "" ? undefined : parseFloat(purchasePrice),
      };
      const res = await axios.post(
        `${BASE}/app/products`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const created = res?.data;
      if (created && (created._id || created.id)) {
        alert(t("productCreatedSuccess"));
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setError("המוצר נוצר אך לא התקבל בחזרה – ניתן להוסיף כמות ידנית לפי ברקוד");
        setStep("quantity");
        setProduct({ _id: created?.id || created?._id, title: payload.title, barcode: scannedBarcode });
      }
    } catch (err) {
      setError(err?.response?.data?.message?.he || err?.response?.data?.message?.en || err?.message || "שגיאה ביצירת מוצר");
    } finally {
      setCreatingProduct(false);
    }
  };

  const updateNewProduct = (field, value) => {
    setNewProduct((prev) => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {entryMode === "manual" ? getWord("manualBarcodeEntry") : getWord("scanBarcode")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
            aria-label="סגירה"
          >
            ×
          </button>
        </div>

        {error && (
          <p className="mb-3 text-center text-red-600">{error}</p>
        )}

        {step === "addProduct" && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <p className="text-sm text-gray-600">ברקוד: <strong dir="ltr">{scannedBarcode}</strong></p>
            <label className="block text-sm font-medium text-gray-700">{t("productTitle")}</label>
            <input type="text" value={newProduct.productTitle} onChange={(e) => updateNewProduct("productTitle", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" placeholder="שם המוצר" />
            <label className="block text-sm font-medium text-gray-700">{t("productImageUpload")}</label>
            <div className="space-y-2">
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                disabled={uploadingImage}
                className="absolute w-0 h-0 opacity-0 pointer-events-none"
                aria-hidden="true"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCameraModal(true)}
                  disabled={uploadingImage}
                  className="flex-1 rounded-lg bg-mainColor py-3 px-4 text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                >
                  {uploadingImage ? (
                    <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    t("openCamera")
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="flex-1 rounded-lg border-2 border-mainColor text-mainColor py-3 px-4 font-medium flex items-center justify-center gap-2 hover:bg-mainColor hover:text-white disabled:opacity-50 transition-colors"
                >
                  {uploadingImage ? (
                    <span className="h-4 w-4 border-2 border-mainColor border-t-transparent rounded-full animate-spin" />
                  ) : (
                    t("openGallery")
                  )}
                </button>
              </div>
              {uploadingImage && <p className="text-sm text-gray-500">מעלה תמונה...</p>}
              {uploadImageError && <p className="text-sm text-red-600">{uploadImageError}</p>}
              {newProduct.productImage && (
                <div className="relative inline-block">
                  <img src={newProduct.productImage} alt="" className="h-20 w-20 rounded-lg object-cover border border-gray-200" />
                  <button type="button" onClick={() => updateNewProduct("productImage", "")} className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center">×</button>
                </div>
              )}
            </div>
            <label className="block text-sm font-medium text-gray-700">{t("supplier")}</label>
            <input type="text" value={newProduct.supplier} onChange={(e) => updateNewProduct("supplier", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" />
            <label className="block text-sm font-medium text-gray-700">{t("sortCode")}</label>
            <input type="text" value={newProduct.sortCode} onChange={(e) => updateNewProduct("sortCode", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" dir="ltr" />
            <label className="block text-sm font-medium text-gray-700">{t("weight")}</label>
            <input type="number" step="any" value={newProduct.weight} onChange={(e) => updateNewProduct("weight", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" />
            <label className="block text-sm font-medium text-gray-700">{t("weightUnit")}</label>
            <input type="text" value={newProduct.weightUnit} onChange={(e) => updateNewProduct("weightUnit", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" placeholder="ק״ג, גרם" />
            <label className="block text-sm font-medium text-gray-700">{t("kashrut")}</label>
            <input type="text" value={newProduct.kashrut} onChange={(e) => updateNewProduct("kashrut", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" placeholder="חלבי, פרווה" />
            <label className="block text-sm font-medium text-gray-700">{t("categories")}</label>
            <input type="text" value={newProduct.categories} onChange={(e) => updateNewProduct("categories", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" placeholder="מופרד בפסיקים" />
            <label className="block text-sm font-medium text-gray-700">{t("stockQuantity")}</label>
            <input type="number" min={0} value={newProduct.stockQuantity} onChange={(e) => updateNewProduct("stockQuantity", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" />
            <label className="block text-sm font-medium text-gray-700">{t("expiryDate")}</label>
            <input type="date" value={newProduct.expiryDate} onChange={(e) => updateNewProduct("expiryDate", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" />
            <label className="block text-sm font-medium text-gray-700">{t("minStockAlert")}</label>
            <input type="number" min={0} value={newProduct.minStockAlert} onChange={(e) => updateNewProduct("minStockAlert", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" />
            <label className="block text-sm font-medium text-gray-700">{t("salePrice")}</label>
            <input type="number" step="any" min={0} value={newProduct.salePrice} onChange={(e) => updateNewProduct("salePrice", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" />
            <label className="block text-sm font-medium text-gray-700">{t("purchasePrice")}</label>
            <input type="number" step="any" min={0} value={newProduct.purchasePrice} onChange={(e) => updateNewProduct("purchasePrice", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" />
          </div>
        )}

        {step === "scan" && (
          <>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-mainColor border-t-transparent" />
                <p className="mt-2 text-gray-600">בודק מוצר...</p>
              </div>
            ) : entryMode === "manual" ? (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700">
                  {getWord("enterBarcode")}
                </label>
                <input
                  type="text"
                  value={manualBarcodeInput}
                  onChange={(e) => setManualBarcodeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                  placeholder="7290012345678"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handleManualSearch}
                  disabled={!manualBarcodeInput?.trim()}
                  className="w-full rounded-lg bg-mainColor py-2 text-white disabled:opacity-50"
                >
                  {getWord("search")}
                </button>
              </div>
            ) : (
              <>
                <p className="mb-3 text-center text-gray-600">{getWord("scanInstructions")}</p>
                <div className="overflow-hidden rounded-lg bg-gray-100" style={{ height: 260 }}>
                  {loadScanner ? (
                    <BarcodeScanner
                      onScan={handleScan}
                      onError={() => setError(t("cameraError"))}
                      paused={loading}
                      style={{ height: "100%", width: "100%" }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-mainColor border-t-transparent" />
                    </div>
                  )}
                </div>
              </>
            )}
            {error && (
              <button
                type="button"
                onClick={() => { setError(null); setStep("addProduct"); }}
                className="mt-3 w-full rounded-lg bg-mainColor py-2 text-white hover:opacity-90"
              >
                {t("addProduct")}
              </button>
            )}
          </>
        )}

        {step === "quantity" && product && (
          <div className="space-y-4">
            <p className="font-medium text-gray-800">
              {product?.title?.he || product?.title?.en || scannedBarcode}
            </p>
            <p className="text-sm text-gray-500">ברקוד: {scannedBarcode}</p>
            <label className="block text-sm font-medium text-gray-700">
              {getWord("quantityInStock")}
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              placeholder="0"
            />
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2 border-t border-gray-200 pt-4">
          {step === "quantity" ? (
            <>
              <button
                type="button"
                onClick={() => { setStep("scan"); setError(null); setQuantity(""); setProduct(null); setScannedBarcode(null); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                {getWord("back")}
              </button>
              <button
                type="button"
                onClick={handleAddStock}
                disabled={submitting || !quantity || parseInt(quantity, 10) < 1}
                className="rounded-lg bg-mainColor px-4 py-2 text-white disabled:opacity-50"
              >
                {submitting ? "..." : getWord("addToStock")}
              </button>
            </>
          ) : step === "addProduct" ? (
            <>
              <button
                type="button"
                onClick={() => { setStep("scan"); setError(null); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                {getWord("back")}
              </button>
              <button
                type="button"
                onClick={handleCreateProduct}
                disabled={creatingProduct || !newProduct.productTitle?.trim()}
                className="rounded-lg bg-mainColor px-4 py-2 text-white disabled:opacity-50"
              >
                {creatingProduct ? "..." : t("createProduct")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              {getWord("close")}
            </button>
          )}
        </div>
      </div>

      {showCameraModal && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black" dir="rtl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 w-full object-cover"
            style={{ maxHeight: "100vh" }}
          />
          {cameraError && (
            <p className="absolute top-4 right-4 left-4 text-center text-red-400 bg-black/70 py-2 rounded-lg">{cameraError}</p>
          )}
          <div className="absolute bottom-0 left-0 right-0 p-4 flex gap-3 bg-gradient-to-t from-black/80 to-transparent">
            <button
              type="button"
              onClick={closeCameraModal}
              className="flex-1 rounded-full py-3 px-4 bg-white/20 text-white font-medium"
            >
              {getWord("close")}
            </button>
            <button
              type="button"
              onClick={handleCapturePhoto}
              className="flex-1 rounded-full py-3 px-4 bg-mainColor text-white font-medium"
            >
              {t("takePhoto")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
