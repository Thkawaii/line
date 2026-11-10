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
 * ข้อความที่ผู้ดูแลระบบกรอกเอง (ชื่อของรางวัล กิจกรรม FAQ ข้อกำหนด) ไม่ได้แปล
 * เพราะเป็นข้อมูลในฐานข้อมูล ไม่ใช่ข้อความในโปรแกรม
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

  // ข้อความที่ผู้ดูแลกรอกมาจาก API ตามภาษา เปลี่ยนภาษาแล้วจึงต้องโหลดหน้าใหม่
  // ใช้วิธีโหลดซ้ำทั้งหน้าเพราะง่ายกว่าไล่สั่งทุกหน้าให้ดึงข้อมูลใหม่ และเกิดไม่บ่อย
  const changeLanguage = useCallback(
    (next) => {
      if (next === lang) return;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ไม่เป็นไร */
      }
      setLang(next);
      window.location.reload();
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
