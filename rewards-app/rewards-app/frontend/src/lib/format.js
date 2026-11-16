/**
 * จัดรูปแบบวันเวลาและตัวเลขตามภาษาที่ผู้ใช้เลือก
 *
 * ภาษาไทยใช้ปี พ.ศ. และชื่อเดือนแบบไทย
 * ภาษาอังกฤษและญี่ปุ่นใช้ปี ค.ศ. ตามธรรมเนียมของภาษานั้น
 *
 * เก็บภาษาปัจจุบันไว้ในตัวแปรระดับโมดูล เพราะฟังก์ชันพวกนี้ถูกเรียกจากหลายสิบที่
 * ถ้าต้องส่งภาษาเข้าไปทุกครั้งจะรกโดยไม่ได้อะไรเพิ่ม
 * ตัว LanguageProvider เรียก setFormatLanguage ให้ทุกครั้งที่เปลี่ยนภาษา
 */

let language = 'th';

export function setFormatLanguage(next) {
  language = next || 'th';
}

export const currentFormatLanguage = () => language;

const MONTHS = {
  th: {
    short: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
    full: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
  },
  en: {
    short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    full: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
};

const WORDS = {
  th: { today: 'วันนี้', yesterday: 'เมื่อวาน' },
  en: { today: 'Today', yesterday: 'Yesterday' },
  ja: { today: '今日', yesterday: '昨日' },
};

const words = () => WORDS[language] || WORDS.th;
const toDate = (value) => (value instanceof Date ? value : new Date(value));
const pad = (n) => String(n).padStart(2, '0');

// ปีพุทธศักราช ใช้เฉพาะภาษาไทย
export const buddhistYear = (date) => toDate(date).getFullYear() + 543;

export function thaiDate(value, { full = false, shortYear = false } = {}) {
  if (!value) return '-';
  const d = toDate(value);

  if (language === 'ja') {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  const table = MONTHS[language] || MONTHS.th;
  const month = full ? table.full[d.getMonth()] : table.short[d.getMonth()];
  const year = language === 'th' ? buddhistYear(d) : d.getFullYear();

  return `${d.getDate()} ${month} ${shortYear ? String(year).slice(-2) : year}`;
}

/**
 * ช่วงวันที่ของกิจกรรม
 * จัดวันเดียวแสดงวันเดียว จัดหลายวันแสดงเป็นช่วง
 * ถ้าอยู่เดือนและปีเดียวกันจะย่อให้เหลือ "12 - 14 มิ.ย. 2569" ไม่เขียนเดือนซ้ำ
 */
export function dateRange(start, end) {
  if (!start) return '-';
  if (!end || String(end).slice(0, 10) === String(start).slice(0, 10)) return thaiDate(start);

  const a = toDate(start);
  const b = toDate(end);

  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()} - ${thaiDate(b)}`;
  }
  return `${thaiDate(a)} - ${thaiDate(b)}`;
}

export function thaiTime(value) {
  if (!value) return '';
  const [h, m] = String(value).split(':');
  return language === 'th' ? `${h}.${m} น.` : `${h}:${m}`;
}

export function timeRange(start, end) {
  if (!start) return '';
  const fmt = (t) => String(t).slice(0, 5);
  return language === 'th' ? `${fmt(start)} - ${fmt(end)} น.` : `${fmt(start)} - ${fmt(end)}`;
}

export function dateTime(value) {
  const d = toDate(value);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return language === 'th'
    ? `${thaiDate(d, { shortYear: true })} | ${clock} น.`
    : `${thaiDate(d, { shortYear: true })} | ${clock}`;
}

export function clockTime(value) {
  const d = toDate(value);
  return language === 'th'
    ? `เวลา ${pad(d.getHours())}.${pad(d.getMinutes())} น.`
    : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// จัดกลุ่มรายการตามวัน ใช้กับประวัติคะแนนและการแจ้งเตือน
export function groupByDay(items, key = 'created_at') {
  const groups = new Map();
  for (const item of items) {
    const d = toDate(item[key]);
    const stamp = d.toDateString();
    if (!groups.has(stamp)) groups.set(stamp, { date: d, items: [] });
    groups.get(stamp).items.push(item);
  }
  return [...groups.values()];
}

export function relativeDay(date) {
  const d = toDate(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return words().today;
  if (d.toDateString() === yesterday.toDateString()) return words().yesterday;
  return thaiDate(d);
}

export const num = (value) => Number(value || 0).toLocaleString('en-US');

export const signedPoints = (points) => `${points > 0 ? '+' : '-'} ${num(Math.abs(points))}`;

export const initials = (name = '') => name.trim().slice(0, 1).toUpperCase();

export function countdown(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} : ${pad(s)}`;
}

export const TIER_STYLE = {
  Member: 'bg-[#E4E6E6] text-slate',
  Silver: 'bg-sky/40 text-slate',
  Elite: 'bg-gold/30 text-gold-ink',
};

export const STATUS_STYLE = {
  Active: 'bg-success-wash text-success',
  Inactive: 'bg-danger-wash text-danger',
};
