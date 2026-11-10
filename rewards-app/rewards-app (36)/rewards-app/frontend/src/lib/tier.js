import { Icon } from '../components/icons';

/**
 * ไอคอนและสีประจำระดับสมาชิก เก็บไว้ที่เดียวเพื่อให้ฝั่งพนักงานกับฝั่งแอดมินตรงกันเสมอ
 * ผูกกับค่า color ของระดับ ไม่ได้ผูกกับชื่อระดับ เวลาสร้างระดับใหม่จึงได้ไอคอนตามธีมที่เลือก
 */
const ICONS = {
  slate: Icon.Star,
  sky: Icon.StarSparkle,
  gold: Icon.Crown,
};

// ใช้กับการ์ดพื้นขาวฝั่งพนักงาน ต้องเป็นสีทึบไม่งั้นวงกลมจะจมหายไปกับพื้น
const CIRCLES = {
  slate: 'bg-[#9AA3A3] text-white',
  // ระดับกลางใช้ขาวโปร่งเหมือนฝั่งแอดมิน วางบนการ์ดพื้นเทอร์ควอยซ์แล้วได้เป็นเทอร์ควอยซ์อ่อน
  // ของเดิมใช้ฟ้าอมเทาซึ่งออกมาดูเหมือนสีเทา
  sky: 'bg-white/30 text-white',
  gold: 'bg-gold text-white',
};

// ใช้กับป้ายระดับที่วางบนพื้นขาว เช่น ป้ายมุมการ์ดของรางวัล
// ต้องเป็นสีทึบทุกระดับ ถ้าใช้ขาวโปร่งเหมือนบนการ์ดสีเข้ม ไอคอนจะกลืนกับพื้นขาวจนมองไม่เห็น
const SOLID_CIRCLES = {
  slate: 'bg-[#9AA3A3] text-white',
  sky: 'bg-primary text-white',
  gold: 'bg-gold text-white',
};

export const tierIcon = (color) => ICONS[color] || ICONS.slate;

export const tierSolidCircle = (color) => SOLID_CIRCLES[color] || SOLID_CIRCLES.slate;

export const tierCircle = (color) => CIRCLES[color] || CIRCLES.slate;

/**
 * ชุดสีของการ์ดที่แสดงระดับสมาชิก ตามไฟล์ออกแบบ Card
 *   slate (Member) พื้นฟ้าอ่อน ตัวหนังสือสีเข้ม
 *   sky   (Silver) พื้นเทอร์ควอยซ์ ตัวหนังสือขาว
 *   gold  (Elite)  พื้นกรมเข้ม ตัวหนังสือสีทอง
 */
const CARDS = {
  slate: {
    surface: 'bg-gradient-to-br from-[#EAF4F8] to-[#DCEDF4]',
    title: 'text-ink',
    muted: 'text-muted',
    value: 'text-primary',
    link: 'text-slate',
    badge: 'bg-white text-slate',
    track: 'bg-[#D9D9D9]',
    chipOn: 'bg-primary text-white',
    chipOff: 'bg-line text-muted',
    ring: 'ring-primary',
  },
  sky: {
    surface: 'bg-gradient-to-br from-primary to-[#0B7E82]',
    title: 'text-white',
    muted: 'text-white/80',
    value: 'text-white',
    link: 'text-white/90',
    badge: 'bg-white text-primary-dark',
    track: 'bg-white/30',
    chipOn: 'bg-white text-primary-dark',
    chipOff: 'bg-white/25 text-white',
    ring: 'ring-white',
  },
  gold: {
    surface: 'bg-gradient-to-br from-[#223240] to-[#121C24]',
    title: 'text-gold',
    muted: 'text-white/70',
    value: 'text-gold',
    link: 'text-white/80',
    badge: 'bg-gold text-[#15232B]',
    track: 'bg-white/20',
    chipOn: 'bg-gold text-[#15232B]',
    chipOff: 'bg-white/15 text-white/80',
    ring: 'ring-gold',
  },
};

export const tierCard = (color) => CARDS[color] || CARDS.slate;
