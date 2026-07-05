// src/utils/soundFeedback.js
// חיווי קולי לסריקה — משתמש בקבצי אודיו מקומיים קצרים (public/sounds/*),
// כפי שדורש האפיון ("קבצי אודיו מקומיים... שלא יהיו תלויים ברשת").
// אם ניגון הקובץ נכשל/נחסם — נפילה חזרה לסינתזת Web Audio.
// הקבצים נוצרים ע"י scripts/genSounds.cjs.

const base = (import.meta.env && import.meta.env.BASE_URL) || "/";

function makeAudio(file) {
  try {
    if (typeof Audio === "undefined") return null;
    const a = new Audio(`${base}sounds/${file}`);
    a.preload = "auto";
    return a;
  } catch (_) {
    return null;
  }
}

const successAudio = makeAudio("scan-success.wav");
const errorAudio = makeAudio("scan-error.wav");

function playFile(audio, fallback) {
  if (audio) {
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && p.catch) p.catch(() => fallback());
      return;
    } catch (_) {
      /* נפילה חזרה לסינתזה */
    }
  }
  fallback();
}

// --- Web Audio fallback (עצמאי מהרשת) ---
let audioCtx = null;
function getCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AC();
    } catch (_) {
      return null;
    }
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(freq, startOffset, duration, type = "sine", gainVal = 0.15) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t0 = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(gainVal, t0);
  gain.gain.exponentialRampToValueAtTime(0.01, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration);
}

/** צליל אישור: שני צפצופים גבוהים קצרים + רטט קצר */
export function playScanSuccess() {
  playFile(successAudio, () => {
    tone(1180, 0, 0.09, "sine", 0.16);
    tone(1560, 0.1, 0.1, "sine", 0.16);
  });
  try {
    navigator.vibrate?.(40);
  } catch (_) {}
}

/** צליל שגיאה: באזר נמוך ומחוספס + רטט כפול */
export function playScanError() {
  playFile(errorAudio, () => {
    tone(220, 0, 0.32, "square", 0.14);
  });
  try {
    navigator.vibrate?.([80, 60, 80]);
  } catch (_) {}
}
