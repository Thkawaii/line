import { num } from '../lib/format';

/**
 * ป้ายคะแนนพิเศษ — ไอคอน K-Point กับตัวเลข
 *
 * ใช้ทุกที่ที่ต้องแสดงราคาหรือยอดคะแนนพิเศษ จะได้หน้าตาเหมือนกันทั้งระบบ
 * และผู้ใช้แยกออกทันทีว่าอันไหนคะแนนปกติ อันไหนคะแนนพิเศษ โดยไม่ต้องอ่านคำกำกับ
 *
 * ไฟล์รูปอยู่ที่ frontend/public/k-special-point.png
 */

const SIZES = {
  sm: { icon: 18, text: 'text-sm' },
  md: { icon: 24, text: 'text-base' },
  lg: { icon: 34, text: 'text-xl' },
};

export function SpecialPointIcon({ size = 24, className = '' }) {
  return (
    <img
      src="/k-special-point.png"
      alt=""
      width={size}
      height={size}
      // alt ว่างและ aria-hidden เพราะตัวเลขข้าง ๆ สื่อความหมายอยู่แล้ว
      // ถ้าอ่านซ้ำโปรแกรมอ่านหน้าจอจะพูดสองรอบ
      aria-hidden="true"
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * value  จำนวนคะแนนพิเศษ
 * size   sm | md | lg
 * label  แสดงคำว่า "คะแนนพิเศษ" ต่อท้ายไหม (ค่าเริ่มต้นคือไม่แสดง เพราะไอคอนบอกอยู่แล้ว)
 */
export default function SpecialPoints({ value, size = 'md', label = false, className = '' }) {
  const style = SIZES[size] || SIZES.md;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold text-ink ${style.text} ${className}`}
    >
      <SpecialPointIcon size={style.icon} />
      {num(value)}
      {label && <span className="font-normal text-muted">คะแนนพิเศษ</span>}
    </span>
  );
}
