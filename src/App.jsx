// meshek_Likut_system/src/App.jsx
import { createContext, useEffect, useState } from "react";
import "./App.css";
import axios from "axios";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Login from "./components/Login";
import PrivateRoute from "./components/PrivateRoute";
import Items from "./components/Items";
import Item from "./components/Item";
import Header from "./components/Header";

export const languageContext = createContext()

// Interceptor גלובלי אחד לכל בקשות הצוות (כולם משתמשים ב-axios ברירת המחדל):
// טוקן מלקט פג אחרי 7 ימים בבקנד → בכל 401 מנקים את הטוקן ומחזירים למסך התחברות
// כדי שהמלקט יתחבר מחדש במקום לראות רשימות ריקות/שגיאות שקטות. נרשם פעם אחת ברמת
// המודול כדי שלא ישוכפל בכל render.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("melaketId");
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

function App() {
  const [orders, setOrders] = useState();
  const [updateOrders, setUpdateOrders] = useState(false);
  const [language, setLanguage] = useState('hebrew');
  const [id, setId] = useState('');
  const [loading, setLoading] = useState(true);

  const location = useLocation();

  const nav = useNavigate();

  const go = async () => {
    try {
      let token = localStorage.getItem("token");
      if (!token) return nav('/login');
      let melaketId = localStorage.getItem("melaketId");
      if (!melaketId) {
        return localStorage.removeItem("token"), nav('/login');
      }
      
      // בדיקה אם יש query parameter של getAll=true ב-URL
      const urlParams = new URLSearchParams(window.location.search);
      const getAll = urlParams.get('getAll') === 'true';
      
      // בניית URL עם query parameter אם נדרש
      const apiUrl = getAll 
        ? `${import.meta.env.VITE_MAIN_SERVER_URL}/app/orders?getAll=true`
        : `${import.meta.env.VITE_MAIN_SERVER_URL}/app/orders`;
      
      const res = await axios.get(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      console.log('res.data: ', res.data);
      // מציגים הזמנות ששולמו וממתינות לליקוט ("Processing"), כאלה שכבר בליקוט ("Likut")
      // וכן "TransferToLikut" אם קיים. כך הזמנה ששולמה מופיעה אוטומטית בתור הליקוט.
      const allOrders = res?.data?.orders ?? [];
      const forLikut = allOrders.filter((o) => {
        const name = o?.status?.name;
        return (
          name === "Processing" ||
          name === "Likut" ||
          (name && /^TransferToLikut$/i.test(name))
        );
      });
      setOrders(forLikut);
    } catch (error) {
      // if error is 401 navigate to login
      if (error?.response?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("melaketId");
        nav('/login');
      }
      console.error("Failed to fetch orders", error);
    }
  };

  useEffect(() => {
    go();
  }, [updateOrders]);

  useEffect(() => {
    const lang = localStorage.getItem("language") || 'hebrew';
    setLanguage(lang);
    document.documentElement.dir = lang === "hebrew" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    if (location.pathname == '/') {
      nav('/items');
    }
  }, [location.pathname]);

  return (
    <languageContext.Provider value={{ language, setLanguage }}>
      {location.pathname.includes("items") && (
        <Header id={id} go={go} loading={loading} setLoading={setLoading} orders={orders} />
      )}
      <main className="main">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/items"
            element={
              <PrivateRoute>
                <Items orders={orders} loading={loading} setLoading={setLoading} go={go} />
              </PrivateRoute>
            }
          />
          <Route
            path="/items/:id"
            element={
              <PrivateRoute>
                <Item
                  orders={orders}
                  setOrders={setOrders}
                  setUpdateOrders={setUpdateOrders}
                  setId={setId}
                  loading={loading}
                  setLoading={setLoading}
                />
              </PrivateRoute>
            }
          />
        </Routes>
      </main>
    </languageContext.Provider>
  );
}

export default App;
