import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setFormatLanguage } from './format';
import th from './locales/th';
import en from './locales/en';
import ja from './locales/ja';

/**
 * ระบบหลายภาษาของฝั่งพนักงาน
 *
 * เก็บภาษาที่เลือกไว้ใน localStorage จึงจำได้แม้ปิดเบราว์เซอร์
 * ถ้ายังไม่เคยเลือกให้เริ่มที่ภาษาไทยเสมอ ไม่เดาจากภาษาของเบราว์เซอร์
 * เพราะพนักงานส่วนใหญ่ใช้ภาษาไทย แต่เครื่องมักตั้งค่าเป็นอังกฤษ
 *
 * ข้อความที่ผู้ดูแลระบบกรอกเอง (ชื่อของรางวัล กิจกรรม ประกาศ FAQ ข้อกำหนด)
 * ถูกแปลที่ฝั่งเซิร์ฟเวอร์แล้วส่งมาตามภาษาที่ขอ ดูได้ที่ backend/translate
 */

export const LANGUAGES = [
  { code: 'th', label: 'ไทย', short: 'ไทย' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ja', label: '日本語', short: '日本語' },
];

const DICTIONARIES = { th, en, ja };
const STORAGE_KEY = 'rewards.lang';

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTIONARIES[saved]) return saved;
  } catch {
    /* บางเบราว์เซอร์ปิด storage ในโหมดส่วนตัว */
  }
  return 'th';
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(initialLanguage);

  useEffect(() => {
    setFormatLanguage(lang);
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ไม่เป็นไร แค่จำภาษาไม่ได้ */
    }
  }, [lang]);

  // แทนที่ตัวแปรในข้อความ เช่น ส่ง { points: 20 } ให้ข้อความที่มี {{points}} อยู่
  const translate = useCallback(
    (key, vars) => {
      const table = DICTIONARIES[lang] || th;
      let text = table[key] ?? th[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{{${name}}}`, String(value));
        }
      }
      return text;
    },
    [lang]
  );

  // เปลี่ยนภาษาแล้วมีผลทันทีโดยไม่โหลดหน้าใหม่
  //
  // ข้อความในโปรแกรมเปลี่ยนเองเพราะทุกหน้าอ่านผ่าน t()
  // ส่วนข้อความที่ผู้ดูแลกรอก (ชื่อของรางวัล กิจกรรม ประกาศ) มาจาก API ตามภาษา
  // ทุกหน้าที่ดึงข้อมูลแบบนั้นจึงใส่ lang ไว้ใน dependency ของ useEffect
  // ทำให้ดึงข้อมูลชุดใหม่ให้เองเมื่อภาษาเปลี่ยน
  //
  // เดิมใช้วิธี window.location.reload() ซึ่งได้ผลแต่จอกระพริบและเสียตำแหน่งที่เลื่อนอยู่
  const changeLanguage = useCallback(
    (next) => {
      if (next === lang || !DICTIONARIES[next]) return;
      setLang(next);
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang: changeLanguage, t: translate }),
    [lang, changeLanguage, translate]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage ต้องอยู่ภายใน LanguageProvider');
  return ctx;
}

// ใช้บ่อยที่สุด จึงมีตัวย่อให้เรียกสั้น ๆ
export function useT() {
  return useLanguage().t;
}
