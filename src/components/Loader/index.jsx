import React from "react";
import "./style.css";
import logo from "/logo.svg";
import useLoadingStore from "../../LoadingContext";
import { getWord } from "../Language";

export default function Loader() {

  const { text } = useLoadingStore();

  const translatedText = getWord(text);
  const loading = translatedText.props.children || 'טוען';

  return (
    <div className="loader-container">
      <div className="imageHolder">
        <img className="logo" src={logo}></img>
        <div className="absolute bottom-3 flex flex-col items-center justify-center">
          {/* <div className="loader" /> */}
          <div className="newtons-cradle">
            <div className="newtons-cradle__dot"></div>
            <div className="newtons-cradle__dot"></div>
            <div className="newtons-cradle__dot"></div>
            <div className="newtons-cradle__dot"></div>
          </div>
          {/* טקסט מותאם אישית */}
          <h2>{loading}...</h2>
        </div>
      </div>
    </div>
  );
}
