const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const toDate = (value) => (value instanceof Date ? value : new Date(value));

// ปีในดีไซน์ทั้งหมดเป็น พ.ศ.
export const buddhistYear = (date) => toDate(date).getFullYear() + 543;

export function thaiDate(value, { full = false, shortYear = false } = {}) {
  if (!value) return '-';
  const d = toDate(value);
  const month = full ? MONTHS_FULL[d.getMonth()] : MONTHS_SHORT[d.getMonth()];
  const year = shortYear ? String(buddhistYear(d)).slice(-2) : buddhistYear(d);
  return `${d.getDate()} ${month} ${year}`;
}

export function thaiTime(value) {
  if (!value) return '';
  const [h, m] = String(value).split(':');
  return `${h}.${m} น.`;
}

export function timeRange(start, end) {
  if (!start) return '';
  const fmt = (t) => String(t).slice(0, 5);
  return `${fmt(start)} - ${fmt(end)} น.`;
}

export function dateTime(value) {
  const d = toDate(value);
  return `${thaiDate(d, { shortYear: true })} | ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')} น.`;
}

export function clockTime(value) {
  const d = toDate(value);
  return `เวลา ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')} น.`;
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

  if (d.toDateString() === today.toDateString()) return 'วันนี้';
  if (d.toDateString() === yesterday.toDateString()) return 'เมื่อวาน';
  return thaiDate(d);
}

export const num = (value) => Number(value || 0).toLocaleString('en-US');

export const signedPoints = (points) => `${points > 0 ? '+' : '-'} ${num(Math.abs(points))}`;

export const initials = (name = '') => name.trim().slice(0, 1).toUpperCase();

export function countdown(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} : ${String(s).padStart(2, '0')}`;
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
