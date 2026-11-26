import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { displayYear, monthNames, thaiDate, weekdayNames } from '../lib/format';

/**
 * ช่องเลือกวันที่พร้อมปฏิทินของเราเอง
 *
 * ทำไมไม่ใช้ <input type="date"> เฉย ๆ: ปฏิทินที่เด้งขึ้นมาเป็นของเบราว์เซอร์
 * ไม่ใช่ของหน้าเว็บ จึงจัดสไตล์ด้วย CSS ไม่ได้เลยแม้แต่สีเดียว
 * ผลคือได้ปฏิทินภาษาอังกฤษ เดือนเป็น November ปีเป็น ค.ศ. และวันที่เป็น mm/dd/yyyy
 * ซึ่งคนละแบบกับทั้งระบบที่เป็นไทยและใช้ปี พ.ศ.
 *
 * ตัวนี้วาดเองทั้งหมด จึงเป็นสีของธีม ใช้ชื่อเดือนไทย ปี พ.ศ. และวันอาทิตย์ขึ้นต้นสัปดาห์
 *
 * รับและส่งค่าเป็น YYYY-MM-DD เหมือน <input type="date"> ทุกประการ
 * และเรียก onChange ด้วยรูปทรง { target: { value } } เหมือนกัน
 * ที่เรียกใช้อยู่เดิมจึงไม่ต้องแก้ตัวจัดการเหตุการณ์เลยสักที่
 */

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => {
  const now = new Date();
  return iso(now.getFullYear(), now.getMonth(), now.getDate());
};

// แปลง YYYY-MM-DD เป็นชิ้นส่วนตัวเลข โดยไม่ผ่าน new Date() ที่จะเลื่อนวันตามเขตเวลา
function parts(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

export default function DateField({
  id,
  value = '',
  onChange,
  min,
  max,
  required = false,
  disabled = false,
  className = 'field',
  placeholder = 'เลือกวันที่',
  clearable = true,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('day'); // day | month
  const [view, setView] = useState(() => parts(value) || parts(todayIso()));
  const boxRef = useRef(null);
  const panelRef = useRef(null);
  const [spot, setSpot] = useState({ top: 0, left: 0 });

  const selected = parts(value);
  const today = parts(todayIso());
  const months = monthNames();
  const weekdays = weekdayNames();

  // เปิดปฏิทินครั้งไหนก็ให้เริ่มที่เดือนของวันที่ที่เลือกไว้ ไม่ใช่เดือนที่เลื่อนค้างไว้รอบก่อน
  useEffect(() => {
    if (open) {
      setView(parts(value) || parts(todayIso()));
      setMode('day');
    }
  }, [open, value]);

  // กดนอกกล่องแล้วปิดเอง แบบเดียวกับ ComboBox
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      // ตัวปฏิทินไปแขวนอยู่ที่ body จึงไม่ได้อยู่ในกล่องของช่อง ต้องเช็กทั้งสองที่
      // ถ้าเช็กแค่กล่อง การกดวันที่จะถูกนับเป็นกดข้างนอก ปฏิทินปิดก่อนที่ปุ่มวันจะทำงาน
      if (boxRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /*
    วางปฏิทินด้วยตำแหน่งแบบ fixed แล้วแขวนไว้ที่ body

    ถ้าวางไว้ในตัวช่องเองแบบ absolute ปฏิทินจะถูกกรอบของหน้าต่างฟอร์มตัด
    เพราะหน้าต่างฟอร์มเลื่อนในตัวเองได้ (overflow) อะไรที่ล้นออกนอกกรอบจึงหายไป
    อาการคือเห็นปฏิทินแค่สองสามแถวแรก ซึ่งเป็นสิ่งที่เกิดขึ้นจริงตอนลองครั้งแรก

    คำนวณตำแหน่งใหม่ทุกครั้งที่เลื่อนจอหรือเปลี่ยนขนาดจอ ปฏิทินจะได้ติดอยู่กับช่องเสมอ
  */
  const place = useCallback(() => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;

    const width = 274;
    const height = panelRef.current?.offsetHeight || 336;
    const gap = 6;

    const up = box.bottom + gap + height > window.innerHeight && box.top > height + gap;
    const top = up ? box.top - height - gap : box.bottom + gap;
    const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));

    setSpot({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, mode, place]);

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const before = new Date(view.y, view.m, 0).getDate();

    const list = [];
    for (let i = first - 1; i >= 0; i -= 1) list.push({ day: before - i, out: true });
    for (let d = 1; d <= days; d += 1) list.push({ day: d, out: false });
    while (list.length % 7 !== 0 || list.length < 42) {
      list.push({ day: list.length - (first + days) + 1, out: true });
      if (list.length >= 42) break;
    }
    return list;
  }, [view]);

  function blocked(day) {
    const stamp = iso(view.y, view.m, day);
    if (min && stamp < min) return true;
    if (max && stamp > max) return true;
    return false;
  }

  function emit(next) {
    onChange?.({ target: { value: next } });
  }

  function pick(day) {
    if (blocked(day)) return;
    emit(iso(view.y, view.m, day));
    setOpen(false);
  }

  // ลูกศรซ้ายขวาเลื่อนทีละเดือน ทีละปี หรือทีละสิบสองปี ตามโหมดที่กำลังดูอยู่
  function step(direction) {
    setView((v) => {
      if (mode === 'day') {
        const d = new Date(v.y, v.m + direction, 1);
        return { ...v, y: d.getFullYear(), m: d.getMonth() };
      }
      return { ...v, y: v.y + direction * (mode === 'year' ? 12 : 1) };
    });
  }

  // ปีแรกของตารางปีสิบสองช่อง จัดให้ปีที่ดูอยู่ตกอยู่ในตารางเสมอ
  const yearBlock = view.y - ((view.y % 12) + 12) % 12;

  const label = selected ? thaiDate(new Date(selected.y, selected.m, selected.d)) : '';

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed`}
      >
        <span className={label ? 'truncate text-ink' : 'truncate text-muted'}>
          {label || placeholder}
        </span>
        <span className={`shrink-0 ${open ? 'text-primary' : 'text-muted'}`}>
          <Icon.Calendar size={16} />
        </span>
      </button>

      {/* ช่องซ่อนไว้ให้ required ของฟอร์มยังทำงาน ปฏิทินเป็นปุ่มจึงบังคับกรอกเองไม่ได้ */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value || ''}
          onChange={() => {}}
          className="pointer-events-none absolute bottom-1 left-4 h-0 w-0 opacity-0"
        />
      )}

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[95] w-[274px] overflow-hidden rounded-[14px] border border-line bg-white p-3 shadow-pop"
            /*
              ไม่ใส่อนิเมชันค่อย ๆ จาง เพราะอนิเมชันที่เริ่มจาก opacity 0
              ถ้าสภาพแวดล้อมไหนไม่เล่นอนิเมชัน ปฏิทินจะค้างอยู่ที่มองไม่เห็น
              ขึ้นมาเลยทันทีปลอดภัยกว่า และเร็วกว่าด้วย
            */
            style={{ top: spot.top, left: spot.left }}
          >
          {/*
            หัวปฏิทิน: ลูกศรเลื่อนตามโหมดที่อยู่ ตรงกลางกดเพื่อถอยออกไปอีกชั้น
            วัน -> เลือกเดือน -> เลือกปี

            ต้องมีชั้นเลือกปีด้วย เพราะช่องอย่างวันเกิดพนักงานอยู่ห่างจากปีนี้หลายสิบปี
            ถ้ามีแค่ลูกศรทีละปี ต้องกดสามสิบกว่าครั้งกว่าจะถึง
          */}
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="ก่อนหน้า"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate hover:bg-primary-wash hover:text-primary"
            >
              <span className="rotate-180">
                <Icon.Next size={16} />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode((m) => (m === 'day' ? 'month' : m === 'month' ? 'year' : 'day'))}
              className="flex h-8 flex-1 items-center justify-center gap-1 rounded-pill text-sm font-bold text-ink hover:bg-primary-wash"
            >
              {mode === 'day' && `${months[view.m]} ${displayYear(view.y)}`}
              {mode === 'month' && displayYear(view.y)}
              {mode === 'year' && `${displayYear(yearBlock)} - ${displayYear(yearBlock + 11)}`}
              <span className={mode === 'day' ? 'text-muted' : 'rotate-180 text-muted'}>
                <Icon.Chevron size={14} />
              </span>
            </button>

            <button
              type="button"
              onClick={() => step(1)}
              aria-label="ถัดไป"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate hover:bg-primary-wash hover:text-primary"
            >
              <Icon.Next size={16} />
            </button>
          </div>

          {mode === 'day' ? (
            <>
              <div className="grid grid-cols-7 gap-y-1 text-center text-2xs font-semibold text-muted">
                {weekdays.map((w) => (
                  <span key={w} className="py-1">
                    {w}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-0.5 text-center">
                {cells.map((cell, index) => {
                  if (cell.out) {
                    return (
                      <span key={`out-${index}`} className="py-1.5 text-sm text-line">
                        {cell.day}
                      </span>
                    );
                  }

                  const isSelected =
                    selected && selected.y === view.y && selected.m === view.m && selected.d === cell.day;
                  const isToday =
                    today.y === view.y && today.m === view.m && today.d === cell.day;
                  const off = blocked(cell.day);

                  return (
                    <button
                      key={cell.day}
                      type="button"
                      disabled={off}
                      onClick={() => pick(cell.day)}
                      className={[
                        'mx-auto grid h-8 w-8 place-items-center rounded-full text-sm transition-colors',
                        isSelected
                          ? 'bg-primary font-bold text-white shadow-card'
                          : isToday
                            ? 'bg-primary-wash font-bold text-primary'
                            : 'text-ink hover:bg-primary-wash hover:text-primary',
                        off ? 'cursor-not-allowed text-line hover:bg-transparent hover:text-line' : '',
                      ].join(' ')}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </>
          ) : mode === 'month' ? (
            <div className="grid grid-cols-3 gap-1.5">
              {months.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setView((v) => ({ ...v, m: index }));
                    setMode('day');
                  }}
                  className={`rounded-[10px] py-2 text-sm transition-colors ${
                    index === view.m
                      ? 'bg-primary font-bold text-white'
                      : 'text-ink hover:bg-primary-wash hover:text-primary'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => yearBlock + i).map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => {
                    setView((v) => ({ ...v, y: year }));
                    setMode('month');
                  }}
                  className={`rounded-[10px] py-2 text-sm transition-colors ${
                    year === view.y
                      ? 'bg-primary font-bold text-white'
                      : 'text-ink hover:bg-primary-wash hover:text-primary'
                  }`}
                >
                  {displayYear(year)}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                const now = todayIso();
                if ((min && now < min) || (max && now > max)) {
                  const t = parts(now);
                  setView(t);
                  setMode('day');
                  return;
                }
                emit(now);
                setOpen(false);
              }}
              className="rounded-pill px-2.5 py-1 text-2xs font-semibold text-primary hover:bg-primary-wash"
            >
              วันนี้
            </button>

            {clearable && !required && (
              <button
                type="button"
                onClick={() => {
                  emit('');
                  setOpen(false);
                }}
                className="rounded-pill px-2.5 py-1 text-2xs font-semibold text-muted hover:bg-page hover:text-slate"
              >
                ล้างวันที่
              </button>
            )}
          </div>
          </div>,
          document.body
        )}
    </div>
  );
}
