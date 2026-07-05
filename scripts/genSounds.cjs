// scripts/genSounds.cjs
// מייצר שני קבצי אודיו מקומיים קצרים לחיווי סריקה (אפיון — "קבצי אודיו מקומיים").
// הרצה: node scripts/genSounds.cjs
const fs = require("fs");
const path = require("path");

const SR = 44100;

function wav(samples) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

function tone(freq, dur, type, gain) {
  const n = Math.floor(SR * dur);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const raw =
      type === "square"
        ? Math.sign(Math.sin(2 * Math.PI * freq * t))
        : Math.sin(2 * Math.PI * freq * t);
    const env = Math.exp((-3 * t) / dur); // דעיכה מעריכית
    out[i] = raw * gain * env;
  }
  return out;
}

const silence = (dur) => new Array(Math.floor(SR * dur)).fill(0);

// הצלחה: שני צפצופים גבוהים קצרים
const success = [
  ...tone(1180, 0.09, "sine", 0.5),
  ...silence(0.02),
  ...tone(1560, 0.1, "sine", 0.5),
];
// שגיאה: באזר נמוך ומחוספס
const error = tone(220, 0.32, "square", 0.35);

const dir = path.join(__dirname, "..", "public", "sounds");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "scan-success.wav"), wav(success));
fs.writeFileSync(path.join(dir, "scan-error.wav"), wav(error));
console.log("wrote", dir);
