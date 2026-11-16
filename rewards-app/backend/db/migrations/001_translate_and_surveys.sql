-- 001 — คำแปลอัตโนมัติ และแบบสำรวจ/การลงทะเบียนแบบไม่ระบุตัวตน
--
-- ไฟล์นี้ต่อเติมฐานข้อมูลที่ใช้งานอยู่ ไม่ลบและไม่เขียนทับข้อมูลเดิม
-- รันซ้ำกี่รอบก็ได้ผลเหมือนเดิม

/* ---------- ช่องเก็บคำแปลที่ยังขาด ---------- */

-- ประกาศ/แจ้งเตือน ผู้ใช้เห็นโดยตรง จึงต้องแปลด้วย
ALTER TABLE notifications  ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}';

-- ตัวเลือกของกิจกรรมแบบโหวต ผู้ใช้เห็นในป็อปอัปเลือกตัวเลือก
ALTER TABLE event_options  ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}';

-- เผื่อฐานข้อมูลเก่ากว่านี้ที่ยังไม่มีคอลัมน์ translations เลย
ALTER TABLE events         ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}';
ALTER TABLE rewards        ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}';
ALTER TABLE banners        ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}';
ALTER TABLE faqs           ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}';
ALTER TABLE policies       ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}';
ALTER TABLE tiers          ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}';

/* ---------- ที่พักคำแปล ---------- */

-- เก็บผลการแปลไว้ใช้ซ้ำ ข้อความเดิมจะไม่ถูกส่งไปแปลอีก
-- ประหยัดโควตาของบริการแปล และทำให้ระบบตอบเร็วแม้เน็ตล่ม
CREATE TABLE IF NOT EXISTS translation_cache (
  source_hash  CHAR(40)     NOT NULL,          -- sha1 ของข้อความต้นฉบับ
  target_lang  VARCHAR(8)   NOT NULL,
  source_text  TEXT         NOT NULL,
  target_text  TEXT         NOT NULL,
  provider     VARCHAR(24)  NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (source_hash, target_lang)
);

/* ---------- สิทธิ์ดูรายงานแบบไม่เห็นรายชื่อ ---------- */

-- เพิ่ม role ใหม่ชื่อ ga สำหรับฝ่ายธุรการที่ต้องดูความคืบหน้า
-- แต่ไม่ควรเห็นว่าใครตอบอะไร เห็นได้แค่ภาพรวมรายแผนก
DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD  CONSTRAINT users_role_check CHECK (role IN ('user','admin','ga'));
EXCEPTION WHEN others THEN
  NULL;
END $$;

/* ---------- หัวข้อลงทะเบียน / แบบสำรวจ ---------- */

-- หนึ่งแถวคือหนึ่ง "เรื่อง" ที่ให้พนักงานทำ เช่น ลงทะเบียนใช้ Line OA
-- ชื่อหัวข้อ (title) ผู้ดูแลแก้ได้เอง และถูกใช้เป็นหัวตารางในไฟล์ Excel ที่ดาวน์โหลด
CREATE TABLE IF NOT EXISTS survey_topics (
  id           BIGSERIAL PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,                  -- หัวคอลัมน์ในรายงาน
  heading      VARCHAR(200) NOT NULL DEFAULT '',       -- หัวเรื่องบนสุดของรายงาน
  description  TEXT         NOT NULL DEFAULT '',
  revision     VARCHAR(24)  NOT NULL DEFAULT 'Rev.01',
  as_of_label  VARCHAR(80)  NOT NULL DEFAULT '',       -- เช่น Manpower as 31-Aug-26 (End)
  kind         VARCHAR(16)  NOT NULL DEFAULT 'register'
               CHECK (kind IN ('register','survey','feedback')),
  anonymous    BOOLEAN      NOT NULL DEFAULT true,     -- true = ไม่เก็บว่าใครตอบอะไร
  status       VARCHAR(16)  NOT NULL DEFAULT 'open'
               CHECK (status IN ('draft','open','closed')),
  starts_at    DATE,
  ends_at      DATE,
  points       INTEGER      NOT NULL DEFAULT 0,        -- คะแนนที่ได้เมื่อทำเสร็จ
  questions    JSONB        NOT NULL DEFAULT '[]',     -- [{id,label,type,options,required}]
  translations JSONB        NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- คำตอบของพนักงาน
--
-- ความเป็นส่วนตัว: เมื่อหัวข้อตั้ง anonymous = true ระบบจะเก็บ user_id ไว้เพื่อ
-- กันตอบซ้ำและใช้นับยอดรายแผนกเท่านั้น ส่วน answers/comment จะถูกตัดออกจาก
-- ทุก API ที่ไม่ใช่ role admin — ฝ่ายธุรการจึงเห็นแค่ "แผนกนี้เหลือกี่คน กี่ %"
CREATE TABLE IF NOT EXISTS survey_responses (
  id           BIGSERIAL PRIMARY KEY,
  topic_id     BIGINT      NOT NULL REFERENCES survey_topics(id) ON DELETE CASCADE,
  user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers      JSONB       NOT NULL DEFAULT '{}',
  comment      TEXT        NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (topic_id, user_id)
);

CREATE INDEX IF NOT EXISTS survey_responses_topic_idx ON survey_responses (topic_id);

/* ---------- ค่าตั้งต้น ---------- */

INSERT INTO settings (key, value, label, kind) VALUES
  ('report.company',  'KOBELCO',                      'ชื่อบริษัทบนหัวรายงาน',      'text'),
  ('report.title',    'ข้อมูลพนักงานลงทะเบียน Line OA', 'ชื่อหัวข้อรายงานเริ่มต้น',   'text'),
  ('translate.auto',  'true',                          'แปลเนื้อหาอัตโนมัติ',        'boolean')
ON CONFLICT (key) DO NOTHING;

INSERT INTO notification_events (key, name, description, in_app, email, active, sort_order) VALUES
  ('survey.reminder', 'เตือนให้ทำรายการที่ค้าง',
   'ส่งถึงพนักงานที่ยังไม่ได้ลงทะเบียนหรือยังไม่ได้ทำแบบสำรวจ', true, false, true, 90)
ON CONFLICT (key) DO NOTHING;
