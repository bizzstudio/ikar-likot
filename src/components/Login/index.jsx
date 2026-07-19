import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./style.css";
import loginImg from "/loginImg.svg"
import leaf from "/leaf.svg"
import { getWord } from "../Language";

function Login() {
    const [phone, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post(`${import.meta.env.VITE_MAIN_SERVER_URL}/app/login`, {
                phone,
                password,
            });
            localStorage.setItem("token", res.data.token);
            localStorage.setItem("melaketId", res.data.melaketId);
            navigate("/items");
        } catch (err) {
            setError(
                err?.response?.data?.message ||
                (typeof err?.response?.data === "string" ? err.response.data : null) ||
                err?.message ||
                "שגיאה"
            );
        }
    };

    const phoneWord = getWord('phone');
    const passwordWord = getWord('password');
    const loginWord = getWord('login');

    return (
        <div className="loginPage">
            <div className="card">
                {/* <span className="title">ברוכים הבאים למערכת הליקוט של</span> */}
                <img src={leaf} alt="leaf" className="leaf" />
                <img src={loginImg} alt="לוגו האיכר - מערכת ליקוט" className="loginImg" />
                <form className="form" onSubmit={handleLogin}>
                    <div className="group">
                        <input
                            placeholder=""
                            type="phone"
                            id="phone"
                            required
                            value={phone}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                        <label htmlFor="phone">{phoneWord}</label>
                    </div>
                    <div className="group">
                        <input
                            placeholder=""
                            type="password"
                            id="password"
                            name="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <label htmlFor="password">{passwordWord}</label>
                    </div>
                    <button type="submit">{loginWord}</button>
                </form>
                {error && <p className="loginError">{error}</p>}
            </div>
        </div>
    );
}

export default Login;