import { query } from './db.js';

/**
 * บันทึกสิ่งที่ผู้ดูแลระบบทำ ใช้แสดงในหน้า Audit Logs
 * ตั้งใจให้ล้มเหลวเงียบ ๆ เพราะการบันทึกไม่ควรทำให้งานหลักพัง
 */
export async function logAudit(actorId, action, target = '', detail = '') {
  try {
    await query(
      'INSERT INTO audit_logs (actor_id, action, target, detail) VALUES ($1,$2,$3,$4)',
      [actorId ?? null, action, target, detail]
    );
  } catch (err) {
    console.error('บันทึก audit log ไม่สำเร็จ', err.message);
  }
}
