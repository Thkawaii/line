import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';

/**
 * ช่องเลือกที่พิมพ์ค้นหาได้ พร้อมตัวเลือก "อื่นๆ" สำหรับค่าที่ไม่มีในรายการ
 *
 * ทำไมไม่ใช้ <select> ธรรมดา: รายการตำแหน่งงานมี 34 รายการและแผนกมี 30 รายการ
 * การเลื่อนหาทีละบรรทัดช้าและพลาดง่าย พิมพ์สองสามตัวอักษรแล้วเจอเลยเร็วกว่ามาก
 *
 * ค่าที่ไม่อยู่ในรายการจะถูกถือว่าเป็น "อื่นๆ" โดยอัตโนมัติและเปิดช่องพิมพ์ให้
 * ข้อมูลเก่าที่กรอกไว้ก่อนมีรายการมาตรฐานจึงไม่หายไปตอนเปิดฟอร์มแก้ไข
 *
 * options     รายการตัวเลือก (อาเรย์ของ string)
 * value       ค่าปัจจุบัน
 * onChange    เรียกเมื่อค่าเปลี่ยน
 * allowCustom เปิดตัวเลือก "อื่นๆ" ให้พิมพ์เอง (ค่าเริ่มต้นคือเปิด)
 */
export default function ComboBox({
  id,
  options = [],
  value = '',
  onChange,
  placeholder = 'พิมพ์เพื่อค้นหา',
  allowCustom = true,
  customLabel = 'อื่นๆ',
  required = false,
  // รายการสั้นไม่ต้องมีช่องค้นหา กดแล้วเห็นครบอยู่แล้ว
  // ไม่กำหนดมาก็ตัดสินเองจากจำนวนตัวเลือก
  searchable,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  // รับได้ทั้งอาเรย์ของข้อความ และอาเรย์ของ {value,label}
  // เพื่อให้ช่องอย่าง "ระดับสมาชิก" ที่เก็บค่าอังกฤษแต่แสดงคำไทยใช้ตัวเดียวกันได้
  const items = useMemo(
    () =>
      options.map((item) =>
        typeof item === 'string' ? { value: item, label: item } : item
      ),
    [options]
  );

  const showSearch = searchable ?? items.length > 8;
  const selected = items.find((item) => item.value === value);

  // ค่าที่ไม่อยู่ในรายการแปลว่าผู้ใช้เคยกรอกเอง จึงอยู่ในโหมดพิมพ์เองตั้งแต่เปิดฟอร์ม
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    setCustom(!!value && !items.some((item) => item.value === value));
  }, [value, items]);

  // กดนอกกล่องแล้วปิดเอง
  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    // คำที่ขึ้นต้นตรงกันมาก่อน แล้วค่อยคำที่มีคำค้นอยู่ตรงกลาง
    const text = (item) => item.label.toLowerCase();
    const starts = items.filter((item) => text(item).startsWith(keyword));
    const contains = items.filter(
      (item) => !text(item).startsWith(keyword) && text(item).includes(keyword)
    );
    return [...starts, ...contains];
  }, [items, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function pick(item) {
    onChange(item.value);
    setCustom(false);
    setQuery('');
    setOpen(false);
  }

  function pickCustom() {
    setCustom(true);
    setQuery('');
    setOpen(false);
    onChange('');
    // รอให้ช่องพิมพ์ปรากฏก่อนค่อยโฟกัส ไม่งั้นโฟกัสไปที่ปุ่มเดิม
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const last = matches.length - 1 + (allowCustom ? 1 : 0);
      setHighlight((current) => {
        const next = current + (event.key === 'ArrowDown' ? 1 : -1);
        return Math.max(0, Math.min(last, next));
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (highlight < matches.length) pick(matches[highlight]);
      else if (allowCustom) pickCustom();
      return;
    }
    if (event.key === 'Escape') setOpen(false);
  }

  // โหมดพิมพ์เอง: แสดงช่องข้อความพร้อมปุ่มกลับไปเลือกจากรายการ
  if (custom) {
    return (
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={id}
          className="field"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="โปรดระบุ"
          required={required}
        />
        <button
          type="button"
          onClick={() => {
            setCustom(false);
            onChange('');
          }}
          className="btn-ghost btn-sm shrink-0"
        >
          เลือกจากรายการ
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => {
          setOpen((current) => !current);
          setQuery('');
        }}
        onKeyDown={open ? onKeyDown : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field flex items-center justify-between text-left"
      >
        <span className={value ? 'text-ink' : 'text-muted'}>
          {selected?.label || value || placeholder}
        </span>
        <span className={`shrink-0 text-muted ${open ? 'rotate-180' : ''}`}>
          <Icon.Chevron size={16} />
        </span>
      </button>

      {open && (
        <div
          className="absolute z-40 mt-1 w-full overflow-hidden rounded-[10px] border border-line bg-white shadow-pop"
          onKeyDown={onKeyDown}
        >
          {showSearch && (
            <div className="border-b border-line p-2">
              {/* โฟกัสอัตโนมัติ ผู้ใช้จึงพิมพ์ค้นหาได้ทันทีที่กดเปิด */}
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                className="field h-9 py-0"
              />
            </div>
          )}

          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {matches.map((item, index) => (
              <li key={item.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.value === value}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(item)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    index === highlight ? 'bg-primary-wash' : ''
                  } ${item.value === value ? 'font-semibold text-primary-dark' : 'text-slate'}`}
                >
                  {item.label}
                  {item.value === value && <Icon.Check size={16} />}
                </button>
              </li>
            ))}

            {matches.length === 0 && (
              <li className="px-3 py-3 text-center text-sm text-muted">ไม่พบตัวเลือกที่ตรงกับคำค้น</li>
            )}

            {allowCustom && (
              <li className="border-t border-line">
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(matches.length)}
                  onClick={pickCustom}
                  className={`w-full px-3 py-2 text-left text-sm text-primary ${
                    highlight === matches.length ? 'bg-primary-wash' : ''
                  }`}
                >
                  {customLabel}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Select — ช่องเลือกที่หน้าตาเหมือน ComboBox แต่ไม่มีตัวเลือก "อื่นๆ"
 *
 * ใช้แทน <select> ของเบราว์เซอร์ เพราะรายการที่เบราว์เซอร์วาดเองจัดสไตล์ไม่ได้
 * หน้าตาจึงหลุดจากส่วนอื่นของระบบ และต่างกันไปในแต่ละเครื่อง
 *
 * options รับได้ทั้ง ['A','B'] และ [{ value: 'A', label: 'ตัวเลือก A' }]
 */
export function Select({ id, options = [], value, onChange, placeholder = 'เลือก' }) {
  return (
    <ComboBox
      id={id}
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      allowCustom={false}
    />
  );
}
