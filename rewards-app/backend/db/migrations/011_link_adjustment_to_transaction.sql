-- 011 — โยงรายการคะแนนกลับไปหาคำขอที่อนุมัติมัน
--
-- รายการ "ปรับคะแนน" ในหน้ารายการคะแนนบอกแค่ว่าคะแนนเปลี่ยนไปเท่าไหร่
-- แต่ไม่บอกว่าใครขอ ใครอนุมัติ และด้วยเหตุผลอะไร
-- ซึ่งเป็นข้อมูลที่ต้องใช้ตอนมีคนทักว่าคะแนนไม่ตรง
--
-- ON DELETE SET NULL เพราะรายการเดินคะแนนต้องอยู่ต่อแม้คำขอถูกลบ
-- คะแนนที่เปลี่ยนไปแล้วเป็นข้อเท็จจริง ไม่ควรหายตามเอกสารอ้างอิง

ALTER TABLE point_transactions
  ADD COLUMN IF NOT EXISTS adjust_request_id BIGINT
  REFERENCES point_adjustment_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS point_transactions_adjust_request_idx
  ON point_transactions (adjust_request_id) WHERE adjust_request_id IS NOT NULL;
