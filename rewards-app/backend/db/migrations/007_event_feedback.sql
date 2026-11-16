-- 007 — แบบประเมินความพึงพอใจหลังกิจกรรม

/*
เก็บคำตอบเป็นคอลัมน์แยกข้อ ไม่ใช่ก้อน JSON

เพราะคำถามห้าข้อเป็นมาตรวัดเดียวกันทั้งหมด (1 ถึง 5)
และสิ่งที่ผู้ดูแลอยากรู้คือค่าเฉลี่ยรายข้อ ซึ่งเขียนเป็น avg(q1) ได้ตรง ๆ
ถ้าเก็บเป็น JSON ต้องแกะทุกแถวก่อนถึงจะหาค่าเฉลี่ยได้

ตอบได้ครั้งเดียวต่อกิจกรรม กันคนเดิมส่งซ้ำจนค่าเฉลี่ยเพี้ยน
*/
CREATE TABLE IF NOT EXISTS event_feedback (
  id         BIGSERIAL PRIMARY KEY,
  event_id   BIGINT      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  q1 SMALLINT NOT NULL CHECK (q1 BETWEEN 1 AND 5),  -- ความพึงพอใจโดยรวม
  q2 SMALLINT NOT NULL CHECK (q2 BETWEEN 1 AND 5),  -- รูปแบบและเนื้อหา
  q3 SMALLINT NOT NULL CHECK (q3 BETWEEN 1 AND 5),  -- วัน เวลา สถานที่
  q4 SMALLINT NOT NULL CHECK (q4 BETWEEN 1 AND 5),  -- ประโยชน์ที่ได้รับ
  q5 SMALLINT NOT NULL CHECK (q5 BETWEEN 1 AND 5),  -- อยากเข้าร่วมอีกไหม

  comment    TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_feedback_event_idx ON event_feedback (event_id);

INSERT INTO settings (key, value, label, kind) VALUES
  ('event.feedbackLeadHours', '1',
   'แบบประเมินความพึงพอใจขึ้นก่อนจบกิจกรรม (ชั่วโมง)', 'number'),
  ('event.feedbackOpenDays', '7',
   'เปิดให้ตอบแบบประเมินต่อได้อีกกี่วันหลังจบกิจกรรม', 'number')
ON CONFLICT (key) DO NOTHING;
