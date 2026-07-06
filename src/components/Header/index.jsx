// meshek_Likut_system/src/components/Header/index.jsx
import React, { useContext, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { languageContext } from "../../App";
import "./style.css";
import { getWord } from "../Language";
import { FaLanguage, FaBackward } from "react-icons/fa";
import axios from "axios";
import useLoadingStore from "../../LoadingContext";
import { HiOutlineLogout, HiOutlineDocumentText } from "react-icons/hi";
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

  const backWord = getWord('back');
  const leaveWord = getWord('leaveOrder');
  const areYouSureWord = getWord('leaveConfirm');
  const logOutWord = getWord("logOut");
  const logOutConfirm = getWord("logOutConfirm");
  const unableToLogOut = getWord("unableToLogOut");
  const unableToLeave = getWord("unableToLeave");
  const unableToFoundOrder = getWord("unableToFoundOrder");
  const digitalFormsWord = getWord("digitalForms");
  const chooseDigitalFormWord = getWord("chooseDigitalForm");
  const digitalForm1Word = getWord("digitalForm1");
  const digitalForm2Word = getWord("digitalForm2");
  const digitalForm3Word = getWord("digitalForm3");
  const closeWord = getWord("close");

  const [openMenu, setOpenMenu] = useState(false);
  const [formsModalOpen, setFormsModalOpen] = useState(false);

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
        alert(unableToLeave.props.children);
      } finally {
        setLoading(false);
      }
    } else {
      alert(unableToFoundOrder.props.children);
    }
  };

  // const exit = async (e) => {
  //   setText("saveOrderToYou");
  //   setLoading(true);
  //   await go();
  //   nav(e.target.value);
  // };

  const leaveOrderBtn = async (e) => {
    let areYouSure = confirm(areYouSureWord.props.children);
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
      const confirmed = confirm(logOutConfirm.props.children);
      if (confirmed) {
        localStorage.removeItem("token");
        nav("../login");
      }
    } catch (error) {
      console.error("Failed to log out", error);
      alert(unableToLogOut.props.children);
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
  const onDigitalForm = location.pathname.startsWith("/forms");
  const onOrderDetail =
    location.pathname.startsWith("/items/") &&
    location.pathname !== "/items";

  if (onItemsList || onDigitalForm) {
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

  menuOptions.splice(1, 0, {
    label: (
      <span className="flex items-center gap-2 justify-start">
        <HiOutlineDocumentText size={20} />
        {digitalFormsWord}
      </span>
    ),
    onClick: () => setFormsModalOpen(true),
  });

  const openDigitalForm = (formId) => {
    setFormsModalOpen(false);
    if (formId === 1) nav("/forms/t01");
    if (formId === 2) nav("/forms/t03");
    if (formId === 3) nav("/forms/t02");
  };

  return (
    <div className="fixed z-50 end-1 bottom-1">
      {/* <Language setOpenMenu={setOpenMenu} /> */}
      <DropdownMenu
        options={menuOptions}
        position="bottom-left"
      />
      {formsModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => setFormsModalOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby="digital-forms-title"
            className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-4 text-mainColor shadow-lg dark:border-gray-600 dark:bg-gray-800 dark:text-mainColor-superLight"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="digital-forms-title" className="mb-3 text-center text-lg font-bold">
              {chooseDigitalFormWord}
            </h2>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded-lg border border-mainColor/30 bg-white py-3 text-center font-semibold hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                onClick={() => openDigitalForm(1)}
              >
                {digitalForm1Word}
              </button>
              <button
                type="button"
                className="rounded-lg border border-mainColor/30 bg-white py-3 text-center font-semibold hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                onClick={() => openDigitalForm(2)}
              >
                {digitalForm2Word}
              </button>
              <button
                type="button"
                className="rounded-lg border border-mainColor/30 bg-white py-3 text-center font-semibold hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                onClick={() => openDigitalForm(3)}
              >
                {digitalForm3Word}
              </button>
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-mainColor py-2 font-semibold text-white hover:opacity-90"
              onClick={() => setFormsModalOpen(false)}
            >
              {closeWord}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}