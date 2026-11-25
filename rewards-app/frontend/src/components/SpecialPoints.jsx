import { num, thaiDate } from '../lib/format';
import { useT } from '../lib/i18n';
import { Icon } from './icons';

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
 * บรรทัดบอกวันหมดอายุของคะแนนพิเศษ วางใต้ยอดคงเหลือ
 *
 * คะแนนพิเศษต่างจากคะแนนปกติตรงที่พอถึงวันหมดอายุจะถูกตัดเหลือ 0 ทั้งก้อน
 * ไม่ได้ทยอยหมดทีละรายการ ถ้าไม่บอกไว้ พนักงานจะรู้ตัวอีกทีตอนยอดเป็นศูนย์แล้ว
 * และเข้าใจว่าระบบคำนวณผิด
 *
 * ใกล้หมดอายุ (ตามค่า expire_warn_days ที่ผู้ดูแลตั้งไว้ เซิร์ฟเวอร์ส่งธง
 * special_points_expiring มาให้) จะเปลี่ยนจากข้อความจาง ๆ เป็นป้ายสีเหลือง
 * ให้สะดุดตา พร้อมบอกว่าเหลืออีกกี่วัน
 *
 * user   ข้อมูลผู้ใช้จาก /home หรือ /points
 * theme  ชุดสีของการ์ดระดับสมาชิก (tierCard) ส่งมาเพื่อให้ข้อความจางกลืนกับการ์ด
 */
export function SpecialExpiryNote({ user, theme, className = '' }) {
  const t = useT();

  const points = Number(user?.special_points || 0);
  const expireAt = user?.special_points_expire_at;

  // ไม่มีคะแนนพิเศษ หรือก้อนนี้ไม่มีวันหมดอายุ ก็ไม่ต้องมีบรรทัดนี้มารกการ์ด
  if (points <= 0 || !expireAt) return null;

  const date = thaiDate(expireAt);
  const days = Number(user.special_points_days_left);

  if (!user.special_points_expiring) {
    return (
      <p className={`mt-2 text-2xs ${theme?.muted || 'text-muted'} ${className}`}>
        {t('points.specialExpireAt', { date })}
      </p>
    );
  }

  // ป้ายเตือนมีพื้นหลังเป็นของตัวเอง จึงอ่านออกเหมือนกันทั้งการ์ดพื้นอ่อนและพื้นเข้ม
  // ถ้าใช้แค่สีตัวอักษร ตัวหนังสือสีเหลืองบนการ์ด Elite สีกรมจะจมหายไป
  return (
    <p
      className={`mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-2xs font-semibold text-gold-ink ${className}`}
    >
      <Icon.Hourglass size={13} />
      {days > 0
        ? t('points.specialExpiringSoon', { date, days: num(days) })
        : t('points.specialExpiresToday', { date })}
    </p>
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
