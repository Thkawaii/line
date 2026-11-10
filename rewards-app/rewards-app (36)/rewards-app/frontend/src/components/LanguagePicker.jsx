import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { LANGUAGES, useLanguage } from '../lib/i18n';

/**
 * ปุ่มเลือกภาษา เปลี่ยนแล้วมีผลทันทีทั้งแอปและจำไว้ให้ครั้งถัดไป
 */
export default function LanguagePicker({ className = '' }) {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // กดนอกกล่องแล้วปิดเอง
  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('common.language')}
        className="flex items-center gap-1.5 text-sm text-slate"
      >
        <Icon.Globe size={18} />
        {current.short}
        <span className={open ? 'rotate-180' : ''}>
          <Icon.Chevron size={14} />
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-40 mt-2 w-36 overflow-hidden rounded-[10px] border border-line bg-white py-1 shadow-pop"
        >
          {LANGUAGES.map((item) => (
            <li key={item.code}>
              <button
                type="button"
                role="option"
                aria-selected={item.code === lang}
                onClick={() => {
                  setLang(item.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                  item.code === lang ? 'bg-primary-wash font-semibold text-primary-dark' : 'text-slate'
                }`}
              >
                {item.label}
                {item.code === lang && <Icon.Check size={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
