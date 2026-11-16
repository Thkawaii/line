import { useLocation } from 'react-router-dom';

/**
 * useEmployeeArea บอกว่าตอนนี้อยู่ในหน้าฝั่งพนักงานหรือไม่
 *
 * ป็อปอัปอย่างประกาศข่าวสาร แบบประเมิน และการฉลองเลื่อนระดับ
 * เป็นของฝั่งพนักงาน ไม่ควรเด้งทับหน้าผู้ดูแลระบบ
 *
 * เช็คแค่ role ไม่พอ เพราะพนักงานแผนกหลังบ้านมี role เป็น user
 * แต่เข้าหน้าผู้ดูแลระบบได้ด้วย ถ้าดูแค่ role ป็อปอัปจะเด้งทั้งสองฝั่ง
 * จึงต้องดูด้วยว่ากำลังอยู่หน้าไหน
 */
export function useEmployeeArea() {
  const { pathname } = useLocation();
  return !pathname.startsWith('/admin');
}
