-- 009 — ปรับคะแนนด้วยมือต้องผ่านการอนุมัติสองฝั่ง
--
-- เดิมคนที่มีตำแหน่งถึงเกณฑ์กดปรับคะแนนได้เองทันที ไม่มีใครเห็นก่อนคะแนนจะเปลี่ยน
-- ต่อไปนี้ ER GA HR ยื่นขอได้ทุกตำแหน่ง แต่คะแนนจะยังไม่ขยับ
-- จนกว่าจะมีผู้อนุมัติตำแหน่ง Chief Officer ขึ้นไป จากฝั่ง GA หนึ่งคนและฝั่ง HR หนึ่งคน

CREATE TABLE IF NOT EXISTS point_adjustment_requests (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- คนที่จะถูกปรับคะแนน
  requested_by BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- คนยื่นคำขอ
  points       INTEGER      NOT NULL,                                          -- บวกคือเพิ่ม ลบคือหัก
  point_kind   VARCHAR(8)   NOT NULL DEFAULT 'point' CHECK (point_kind IN ('point','special')),
  title        VARCHAR(160) NOT NULL,
  expire_at    DATE,                                                           -- ใช้กับคะแนนพิเศษเท่านั้น
  reason       VARCHAR(500) NOT NULL DEFAULT '',                               -- เหตุผลที่ขอปรับ
  status       VARCHAR(16)  NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

/*
  ผู้อนุมัติหนึ่งคนต่อหนึ่งคำขอ ออกเสียงได้ครั้งเดียว

  approver_group จดไว้ตั้งแต่ตอนกด ไม่ได้ย้อนไปอ่านจากแผนกปัจจุบันของคนอนุมัติ
  เพราะถ้าเขาย้ายแผนกทีหลัง คำขอที่อนุมัติไปแล้วต้องไม่เปลี่ยนความหมาย
*/
CREATE TABLE IF NOT EXISTS point_adjustment_approvals (
  id             BIGSERIAL PRIMARY KEY,
  request_id     BIGINT       NOT NULL REFERENCES point_adjustment_requests(id) ON DELETE CASCADE,
  approver_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approver_group VARCHAR(4)   NOT NULL CHECK (approver_group IN ('GA','HR')),
  decision       VARCHAR(8)   NOT NULL CHECK (decision IN ('approve','reject')),
  note           VARCHAR(300) NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (request_id, approver_id)
);

CREATE INDEX IF NOT EXISTS point_adjustment_requests_status_idx
  ON point_adjustment_requests (status, created_at DESC);

-- เทมเพลตแจ้งเตือนของขั้นตอนอนุมัติ ปิดแยกกันได้ที่แท็บ Systems Event
INSERT INTO notification_events (key, name, description, in_app, email, active, sort_order) VALUES
  ('point_adjust_requested','มีคำขอปรับคะแนนรออนุมัติ',
   'แจ้งผู้อนุมัติฝั่ง GA และ HR เมื่อมีคำขอปรับคะแนนใบใหม่',true,false,true,7),
  ('point_adjust_decided','ผลการอนุมัติคำขอปรับคะแนน',
   'แจ้งคนยื่นคำขอเมื่อคำขอถูกอนุมัติครบหรือถูกปฏิเสธ',true,false,true,8)
ON CONFLICT (key) DO NOTHING;
