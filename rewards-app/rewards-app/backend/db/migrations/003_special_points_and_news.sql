-- 003 — คะแนนพิเศษ และประกาศข่าวสารที่ต้องกดรับทราบ
--
-- ต่อเติมอย่างเดียว ไม่ลบและไม่เขียนทับข้อมูลเดิม รันซ้ำได้

/* ---------- คะแนนพิเศษ ----------

คะแนนพิเศษเป็นกระเป๋าที่สองแยกจากคะแนนปกติ

  - ไม่นำไปคิดระดับสมาชิก เพราะเป็นรางวัลเฉพาะกิจ ไม่ใช่ความสม่ำเสมอ
  - ไม่ถูกตัดยอดตอนสิ้นปีพร้อมคะแนนปกติ
  - ตัวคูณของระดับไม่มีผลกับคะแนนพิเศษ ให้เท่าไหร่ได้เท่านั้น

แยกคอลัมน์แทนที่จะปนกับ points เพราะถ้าปนกันจะแยกไม่ออกว่ายอดคงเหลือ
ส่วนไหนเอาไปแลกของรางวัลแบบไหนได้                                        */

ALTER TABLE users   ADD COLUMN IF NOT EXISTS special_points INTEGER NOT NULL DEFAULT 0;

-- คะแนนพิเศษที่ได้เพิ่มเมื่อเข้าร่วมกิจกรรมนี้ (นอกเหนือจากคะแนนปกติ)
ALTER TABLE events  ADD COLUMN IF NOT EXISTS special_points INTEGER NOT NULL DEFAULT 0;

-- ของรางวัลชิ้นนี้แลกด้วยคะแนนแบบไหน คอลัมน์ points ยังเป็นราคาเหมือนเดิม
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS point_kind VARCHAR(16) NOT NULL DEFAULT 'point';

DO $$
BEGIN
  ALTER TABLE rewards DROP CONSTRAINT IF EXISTS rewards_point_kind_check;
  ALTER TABLE rewards ADD  CONSTRAINT rewards_point_kind_check
    CHECK (point_kind IN ('point','special'));
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- รายการเดินบัญชีต้องบอกได้ว่าเป็นคะแนนกระเป๋าไหน ไม่งั้นประวัติอ่านแล้วสับสน
ALTER TABLE point_transactions
  ADD COLUMN IF NOT EXISTS point_kind VARCHAR(16) NOT NULL DEFAULT 'point';

ALTER TABLE redemptions
  ADD COLUMN IF NOT EXISTS point_kind VARCHAR(16) NOT NULL DEFAULT 'point';

/* ---------- ประกาศข่าวสารที่ต้องกดรับทราบ ----------

ต่างจากตาราง notifications ตรงที่ประกาศชนิดนี้ "บังคับอ่าน"
พนักงานเข้าระบบมาแล้วจะถูกแสดงทันที และต้องเลื่อนอ่านจนสุดก่อนจึงกดรับทราบได้
ระบบเก็บไว้ด้วยว่าใครกดรับทราบเมื่อไหร่ ใช้เป็นหลักฐานได้ว่าแจ้งแล้วจริง  */

CREATE TABLE IF NOT EXISTS announcements (
  id           BIGSERIAL PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,
  summary      VARCHAR(300) NOT NULL DEFAULT '',
  body         TEXT         NOT NULL DEFAULT '',
  image_url    TEXT,
  status       VARCHAR(16)  NOT NULL DEFAULT 'published'
               CHECK (status IN ('draft','published','archived')),
  -- true = ต้องกดรับทราบก่อนใช้งานต่อ, false = ขึ้นให้อ่านแต่ปิดได้เลย
  require_ack  BOOLEAN      NOT NULL DEFAULT true,
  starts_at    DATE,
  ends_at      DATE,
  translations JSONB        NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcement_acks (
  announcement_id BIGINT      NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS announcement_acks_user_idx ON announcement_acks (user_id);
