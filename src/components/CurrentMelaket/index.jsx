import { useContext } from "react";
import { FaUserCircle } from "react-icons/fa";
import { languageContext } from "../../App";
import { getWordString } from "../Language";
import { getCurrentMelaket } from "../../utils/currentMelaket";

// באנר בולט בראש האפליקציה שמציג את שם המלקט המחובר, כדי שכל אחד ידע מי מחובר במכשיר.
export default function CurrentMelaket() {
  const { language } = useContext(languageContext);
  const melaket = getCurrentMelaket();
  if (!melaket) return null;

  const displayName =
    language === "hebrew"
      ? melaket.heName || melaket.name
      : melaket.name || melaket.heName;
  if (!displayName) return null;

  const accent = melaket.color || "#4b7d3f"; // ברירת מחדל בצבע המותג אם למלקט אין צבע

  return (
    <div
      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-white font-bold text-lg shadow-md"
      style={{ backgroundColor: accent }}
    >
      <FaUserCircle size={22} />
      <span className="opacity-90">{getWordString(language, "loggedInAs")}</span>
      <span className="text-xl">{displayName}</span>
    </div>
  );
}
