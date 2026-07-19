// meshek_Likut_system/src/components/Header/index.jsx
import React, { useContext, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { languageContext } from "../../App";
import "./style.css";
import { getWord, getWordString } from "../Language";
import { FaLanguage, FaBackward } from "react-icons/fa";
import axios from "axios";
import useLoadingStore from "../../LoadingContext";
import { HiOutlineLogout } from "react-icons/hi";
import { PiTranslateBold } from "react-icons/pi";
import { TbUserX } from "react-icons/tb";
import DropdownMenu from "../menu/DropdownMenu";
import { IoLanguage } from "react-icons/io5";

export default function Header({ id, go, setLoading, loading, orders = [] }) {
  const { language, setLanguage } = useContext(languageContext);

  const [order, setOrder] = useState();
  useEffect(() => {
    const ordered = orders.find((order) => order.invoice == id);
    setOrder(ordered)
  }, [orders, id]);

  // טקסט טעינה
  const { setText } = useLoadingStore();

  const location = useLocation();

  const leaveWord = getWord('leaveOrder');
  const logOutWord = getWord("logOut");

  const [openMenu, setOpenMenu] = useState(false);

  const nav = useNavigate();

  // פונקציית נטישת הזמנה
  const leaveOrder = async () => {
    if (order) {
      setLoading(true);
      try {
        await axios.put(
          `${import.meta.env.VITE_MAIN_SERVER_URL}/app/orders/${order._id}?status=Processing`,
          {},
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        await go();
      } catch (error) {
        console.error("Failed to update order status", error);
        alert(getWordString(language, "unableToLeave"));
      } finally {
        setLoading(false);
      }
    } else {
      alert(getWordString(language, "unableToFoundOrder"));
    }
  };

  // const exit = async (e) => {
  //   setText("saveOrderToYou");
  //   setLoading(true);
  //   await go();
  //   nav(e.target.value);
  // };

  const leaveOrderBtn = async (e) => {
    let areYouSure = confirm(getWordString(language, "leaveConfirm"));
    if (areYouSure) {
      setText("leavingOrder");
      setLoading(false);
      await leaveOrder();
      nav('/items');
      // reload the page:
      window.location.reload();
    }
  };

  const handleClick = () => {
    setOpenMenu(prev => !prev);
  };

  const handleLogOut = () => {
    try {
      const confirmed = confirm(getWordString(language, "logOutConfirm"));
      if (confirmed) {
        localStorage.removeItem("token");
        nav("../login");
      }
    } catch (error) {
      console.error("Failed to log out", error);
      alert(getWordString(language, "unableToLogOut"));
    }
  };

  useEffect(() => {
    // דוחף את המצב הנוכחי כדי למנוע חזרה אחורה מיידית
    window.history.pushState(null, null, window.location.href);

    const handlePopState = (event) => {
      // דוחף שוב את המצב כדי למנוע חזרה אחורה
      window.history.pushState(null, null, window.location.href);
      // תפעל את פונקציית הנטישה במקום לחזור אחורה
      leaveOrderBtn();
    };

    // מאזין לאירועי חזרה אחורה
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [leaveOrderBtn]);

  // ה-loading הגלובלי מנוקה רק ע"י מסך הרשימה, לכן מסתירים את ההדר בזמן טעינה
  // רק במסך הרשימה עצמו. במסך פריט/טפסים תמיד מציגים אותו (אחרת רענון ישיר על
  // /items/:id היה משאיר את ההדר מוסתר לצמיתות).
  if (loading && location.pathname === "/items") return <></>;

  // Create menu options based on current location
  const menuOptions = [
    {
      label: <span className="flex items-center gap-2 justify-start"><IoLanguage size={20} />עברית</span>,
      onClick: () => {
        setLanguage("hebrew");
        localStorage.setItem("language", "hebrew");
      }
    },
    {
      label: <span className="flex items-center gap-2 justify-start"><IoLanguage size={20} />ไทย</span>,
      onClick: () => {
        setLanguage("thai");
        localStorage.setItem("language", "thai");
      }
    },
    {
      label: <span className="flex items-center gap-2 justify-start"><IoLanguage size={20} />English</span>,
      onClick: () => {
        setLanguage("en");
        localStorage.setItem("language", "en");
      }
    }
  ];

  // Add logout or leave order option based on location
  const onItemsList = location.pathname === "/items";
  const onOrderDetail =
    location.pathname.startsWith("/items/") &&
    location.pathname !== "/items";

  if (onItemsList) {
    menuOptions.unshift({
      label: <span className="flex items-center gap-2 justify-start"><HiOutlineLogout size={20} />{logOutWord}</span>,
      onClick: handleLogOut
    });
  } else if (onOrderDetail) {
    menuOptions.unshift({
      label: <span className="flex items-center gap-2 justify-start"><TbUserX size={20} />{leaveWord}</span>,
      onClick: leaveOrderBtn
    });
  }

  return (
    <div className="fixed z-50 end-1 bottom-1">
      {/* <Language setOpenMenu={setOpenMenu} /> */}
      <DropdownMenu
        options={menuOptions}
        position="bottom-left"
      />
    </div>
  );
}