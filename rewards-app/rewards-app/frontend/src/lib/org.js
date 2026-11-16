/**
 * ตำแหน่งงานและแผนก
 *
 * เป็นสำเนาของรายการฝั่งเซิร์ฟเวอร์ที่ backend/controllers/positions.go
 * แก้ที่ไหนต้องแก้ให้ตรงกันทั้งสองที่
 *
 * หน้าเว็บดึงรายการจาก API ก่อนเสมอ (จะได้เพิ่มตำแหน่งใหม่ที่เซิร์ฟเวอร์แล้วทุกเครื่อง
 * เห็นพร้อมกันโดยไม่ต้อง build ใหม่) ไฟล์นี้เป็นตัวสำรองเมื่อ API ยังโหลดไม่เสร็จ
 * หรือเรียกไม่สำเร็จ ช่องเลือกจึงไม่เคยว่างเปล่า
 *
 * ลำดับใน POSITIONS เรียงจากตำแหน่งสูงสุดลงไปต่ำสุด และมีความหมายต่อสิทธิ์
 * การปรับคะแนน จึงห้ามเรียงใหม่ตามตัวอักษร
 */

export const POSITIONS = [
  'Director',
  'Co-General Manager',
  'Assistant General Manager',
  'Co-Manager',
  'Manager',
  'Assistant Manager',
  'Specialist',
  'Chief Engineer',
  'Senior Engineer',
  'Engineer',
  'Chief Officer',
  'Senior Officer',
  'Officer',
  'Coordinator',
  'Translator',
  'Supervisor',
  'Instructor Supervisor',
  'Instructor Leader',
  'Leader',
  'Instructor Sub-Leader',
  'Sub-Leader',
  'Clerk',
  'CNC Controller',
  'Inspector',
  'Maintenance',
  'Safety Operator',
  'Assembly Worker',
  'Welder',
  'Painter',
  'W/H Worker',
  'P/K Worker',
  'S/B Worker',
  'Driver',
  'Maid',
];

/** รายการแผนกหลัก ตามทะเบียนพนักงาน */
export const CORE_SECTIONS = [
  'ACC', 'ASS', 'BID', 'ER', 'ERG', 'FNS', 'FTS', 'GAG', 'HRD', 'HRM',
  'ISO', 'ITS', 'LOG', 'MTS', 'PCM', 'PCP', 'PCT', 'PDF', 'PDS', 'PES',
  'PIS', 'PLS', 'PNG', 'PRC', 'PSS', 'QAS', 'QCS', 'SMD', 'STS', 'TSF',
  'TTS',
];

/** สาขา/โรงงาน ใช้เป็นคอลัมน์ Location ในรายงาน */
export const BRANCHES = ['PD', 'TS', 'BKK'];

/**
 * แผนกหลังบ้าน — เข้าหน้าผู้ดูแลระบบได้ด้วยรหัสพนักงานของตัวเอง
 *
 * พนักงานในแผนกเหล่านี้ใช้รหัสพนักงานกับรหัสผ่านเดิมเข้าได้ทั้งสองฝั่ง
 * ไม่ต้องสร้างบัญชีผู้ดูแลระบบแยกอีกใบ
 *
 * สิ่งที่ทำไม่ได้คือกลุ่มเมนู "ตั้งค่าระบบ" ซึ่งเป็นของผู้ดูแลระบบตัวจริงเท่านั้น
 *
 * รับทั้งสองแบบที่ใช้เรียกกันจริง เพราะรหัสในทะเบียนพนักงานกับที่พูดกันปากเปล่าไม่ตรงกัน
 *   GA กับ GAG คือฝ่ายธุรการเหมือนกัน · HR กับ HRM / HRD คือฝ่ายบุคคลเหมือนกัน
 */
export const BACK_OFFICE_SECTIONS = ['GA', 'GAG', 'ER', 'HR', 'HRM', 'HRD'];

/** แผนกที่ให้เลือกตอนสร้างบัญชีผู้ดูแลระบบ */
export const ADMIN_SECTIONS = BACK_OFFICE_SECTIONS;

/**
 * แผนกทั้งหมดที่ให้เลือกในหน้าจัดการพนักงาน
 *
 * รวมรหัสของแผนกหลังบ้านเข้าไปด้วย เพราะรายการหลักไม่มี GA กับ HR
 * ถ้าไม่รวม พนักงานฝ่ายธุรการและฝ่ายบุคคลจะเลือกแผนกของตัวเองจากรายการไม่ได้
 */
export const SECTIONS = [...new Set([...CORE_SECTIONS, ...BACK_OFFICE_SECTIONS])].sort();


/**
 * ตำแหน่งที่ปรับคะแนนพนักงานได้
 *
 * ต้องอยู่ในแผนกหลังบ้านด้วย ทั้งสองเงื่อนไขต้องผ่านพร้อมกัน
 * ผู้จัดการฝ่ายผลิตจึงปรับคะแนนไม่ได้ แม้ตำแหน่งจะชื่อเดียวกัน
 *
 * ไม่ได้เรียงตามลำดับชั้น แต่เป็นรายชื่อที่ระบุมาเฉพาะเจาะจง
 * จึงเทียบแบบ "อยู่ในรายการหรือไม่" ไม่ใช่ "สูงกว่าตำแหน่งนี้หรือไม่"
 */
export const ADJUST_POINTS_POSITIONS = [
  'Co-General Manager',
  'Assistant General Manager',
  'Co-Manager',
  'Manager',
  'Assistant Manager',
  'Chief Officer',
];

/** เทียบแบบไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างหัวท้าย ข้อมูลนำเข้ามักมีช่องว่างติดมา */
const has = (list, value) =>
  list.some((item) => item.toLowerCase() === String(value || '').trim().toLowerCase());

/** อยู่ในแผนกหลังบ้านไหม = เข้าหน้าผู้ดูแลระบบได้ไหม */
export const isBackOffice = (user) =>
  !!user && (user.role === 'admin' || user.role === 'ga' || has(BACK_OFFICE_SECTIONS, user.department));

/** เห็นกลุ่มเมนู "ตั้งค่าระบบ" ได้ไหม — เฉพาะผู้ดูแลระบบตัวจริง */
export const isSystemAdmin = (user) => user?.role === 'admin';

/**
 * canAdjustPoints บอกว่าผู้ใช้คนนี้ปรับคะแนนได้ไหม
 *
 * ใช้ซ่อนปุ่มที่หน้าจอเท่านั้น การกันจริงอยู่ที่เซิร์ฟเวอร์
 * (CanAdjustPoints ใน backend/controllers/positions.go)
 */
export function canAdjustPoints(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return has(BACK_OFFICE_SECTIONS, user.department) && has(ADJUST_POINTS_POSITIONS, user.position);
}
