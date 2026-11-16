/**
 * ค่าที่ใบลงชื่อใช้ร่วมกันระหว่างตารางบนหน้าจอกับไฟล์ที่ดาวน์โหลด
 *
 * แยกไฟล์ออกมาเพราะตัวสร้าง PDF ลากไลบรารีมาด้วยหลายร้อย KB
 * ถ้าค่าพวกนี้อยู่ไฟล์เดียวกัน การเรียกใช้ค่าคงที่จะดึงไลบรารีมาทั้งก้อน
 */

export const SHEET_COLUMNS = ['ลำดับ', 'รหัส', 'ชื่อ-สกุล', 'แผนก', 'ลงชื่อ'];

// จำนวนแถวเปล่าเมื่อยังไม่มีผู้ลงทะเบียน ไว้ให้คนมาหน้างานเขียนชื่อเอง
export const BLANK_ROWS = 15;

/**
 * แปลงรายชื่อเป็นแถวของตาราง ถ้ายังไม่มีใครลงทะเบียนจะได้แถวเปล่าพร้อมเลขลำดับ
 *
 * เรียงตามรหัสพนักงานจากน้อยไปมาก เพราะใบลงชื่อหน้างานหาคนด้วยรหัสเป็นหลัก
 * ใช้ตัวเทียบแบบรู้จักตัวเลข รหัส 9 จึงมาก่อน 10 ไม่ใช่เรียงแบบข้อความที่ 10 มาก่อน 9
 */
export function sheetRows(registrations) {
  if (registrations.length === 0) {
    return Array.from({ length: BLANK_ROWS }, (_, i) => [String(i + 1), '', '', '', '']);
  }

  const sorted = [...registrations].sort((a, b) =>
    String(a.employee_code).localeCompare(String(b.employee_code), 'th', { numeric: true })
  );

  return sorted.map((row, i) => [
    String(i + 1),
    row.employee_code,
    row.display_name,
    row.department || '-',
    '',
  ]);
}
