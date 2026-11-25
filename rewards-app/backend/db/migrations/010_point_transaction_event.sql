-- 010 — ผูกรายการคะแนนกับกิจกรรมที่เป็นต้นทาง
--
-- เดิมรายการคะแนนจากกิจกรรมรู้แค่ว่า source = 'event' แต่ไม่รู้ว่ากิจกรรมไหน
-- กราฟการเคลื่อนไหวของคะแนนจึงกรองดูเฉพาะกิจกรรมไม่ได้
--
-- ON DELETE SET NULL เพราะรายการเดินคะแนนต้องอยู่ต่อแม้กิจกรรมถูกลบ
-- คะแนนที่พนักงานได้ไปแล้วเป็นข้อเท็จจริง ไม่ควรหายตามกิจกรรมที่ถูกลบทิ้ง

ALTER TABLE point_transactions
  ADD COLUMN IF NOT EXISTS event_id BIGINT REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS point_transactions_event_idx
  ON point_transactions (event_id) WHERE event_id IS NOT NULL;

/*
  เติมย้อนหลังให้ข้อมูลเก่าเท่าที่เดาได้อย่างปลอดภัย

  รายการจากกิจกรรมถูกตั้งชื่อไว้สองแบบ
    ลงทะเบียนผ่านแอป   ใช้ชื่อกิจกรรมตรง ๆ
    แอดมินสแกนเช็คอิน  ใช้ "เข้าร่วม " นำหน้าชื่อกิจกรรม

  เติมเฉพาะรายการที่จับคู่ได้กับกิจกรรมเดียวเท่านั้น (matches = 1)
  ถ้ามีกิจกรรมชื่อซ้ำกันหลายงาน ปล่อยว่างไว้ดีกว่าเดาผิดงาน
  เพราะกราฟที่ชี้ไปผิดกิจกรรมอ่านแล้วเชื่อผิด ส่วนค่าว่างยังรู้ว่าไม่รู้
*/
UPDATE point_transactions t
SET event_id = m.event_id
FROM (
  SELECT x.id AS tx_id, min(e.id) AS event_id, count(*) AS matches
  FROM point_transactions x
  JOIN events e ON x.title = e.title OR x.title = 'เข้าร่วม ' || e.title
  WHERE x.source IN ('event','vote') AND x.event_id IS NULL
  GROUP BY x.id
) m
WHERE t.id = m.tx_id AND m.matches = 1;
