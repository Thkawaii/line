-- 005 — พื้นที่จัดงานของกิจกรรม และลิงก์/ไฟล์แนบของประกาศข่าวสาร

/* ---------- พื้นที่จัดงาน ----------

ตั้งพิกัดและรัศมีไว้กับกิจกรรม พนักงานจะลงทะเบียนได้ก็ต่อเมื่ออยู่ในรัศมีนั้น
เว้นพิกัดว่างไว้ = ไม่ตรวจตำแหน่ง ลงทะเบียนจากที่ไหนก็ได้เหมือนเดิม
กิจกรรมเก่าทั้งหมดจึงยังทำงานเหมือนเดิมโดยไม่ต้องแก้อะไร                     */

ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_lat    DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_lng    DOUBLE PRECISION;
-- รัศมีเป็นเมตร 150 เมตรครอบคลุมลานกิจกรรมทั่วไปและเผื่อความคลาดเคลื่อนของ GPS
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_radius INTEGER NOT NULL DEFAULT 150;

-- เก็บพิกัดตอนลงทะเบียนไว้ด้วย ใช้ตรวจสอบย้อนหลังได้ว่าคนนี้ลงทะเบียนจากที่ไหน
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

/* ---------- ลิงก์และไฟล์แนบของประกาศ ----------

ประกาศหลายเรื่องต้องพาไปทำอย่างอื่นต่อ เช่น แบบสำรวจใน Google Form
หรือเอกสารที่ต้องเปิดอ่าน จึงแนบได้ทั้งลิงก์และไฟล์ PDF                      */

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS link_url   TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS link_label VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS file_url   TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS file_name  VARCHAR(200) NOT NULL DEFAULT '';
