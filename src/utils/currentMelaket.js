// פענוח פרטי המלקט המחובר מתוך ה-JWT ששמור ב-localStorage.
// הבקנד כבר טומן בטוקן את name / heName / phone / color (ראה config/auth.js loginApp),
// לכן אין צורך בקריאת רשת נוספת כדי להציג מי מחובר.

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    // המרה מ-base64url ל-base64 תקני לפני atob
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// מחזיר { name, heName, color } של המלקט המחובר, או null אם אין טוקן/פענוח נכשל.
export function getCurrentMelaket() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  return {
    name: payload.name || "",
    heName: payload.heName || "",
    color: payload.color || "",
  };
}
