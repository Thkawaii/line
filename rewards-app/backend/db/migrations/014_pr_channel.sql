-- 014 — ประชาสัมพันธ์: อ่านข่าว/ดูวิดีโอแล้วได้คะแนน

/*
ต่อยอดจากตาราง announcements เดิม ไม่สร้างระบบใหม่

ตารางเดิมมีครบอยู่แล้วทั้งหัวข้อ เนื้อหา รูป ช่วงวันเผยแพร่ สถานะ และคำแปล
สิ่งที่ยังไม่มีคือชนิดเนื้อหา วิดีโอ และเงื่อนไขการรับคะแนน จึงเติมเฉพาะส่วนนั้น

คอลัมน์ channel เป็นตัวแยกสองงานที่ใช้ตารางเดียวกัน
  gate = ประกาศบังคับอ่าน ของเดิม เด้งทับทุกหน้าจนกว่าจะกดรับทราบ
  pr   = ประชาสัมพันธ์ ของใหม่ เปิดอ่านเองจากเมนู อ่านครบแล้วได้คะแนน

ถ้าไม่แยก ข่าวประชาสัมพันธ์ทุกชิ้นจะไปโผล่เป็นป็อปอัปบังคับอ่านทันทีที่สร้าง
ซึ่งไม่ใช่สิ่งที่ใครต้องการ ค่าเริ่มต้นเป็น gate แถวเดิมทั้งหมดจึงทำงานเหมือนเดิมทุกประการ
*/

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS channel VARCHAR(8) NOT NULL DEFAULT 'gate';

DO $$
BEGIN
  ALTER TABLE announcements ADD CONSTRAINT announcements_channel_check
    CHECK (channel IN ('gate','pr'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ชนิดเนื้อหา: ข้อความ รูปภาพ หรือวิดีโอ ใช้เลือกวิธีแสดงและวิธีนับว่าดูครบ
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS kind VARCHAR(8) NOT NULL DEFAULT 'text';

DO $$
BEGIN
  ALTER TABLE announcements ADD CONSTRAINT announcements_kind_check
    CHECK (kind IN ('text','image','video'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- หมวดสำหรับแท็บฝั่งพนักงาน (ข่าวสาร / ประกาศ)
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS category VARCHAR(16) NOT NULL DEFAULT 'news';

DO $$
BEGIN
  ALTER TABLE announcements ADD CONSTRAINT announcements_category_check
    CHECK (category IN ('news','announce'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

/*
วิดีโอรับได้สองทาง อัปโหลดไฟล์เองหรือใส่ลิงก์ YouTube

video_seconds คือความยาวจริงของคลิป หน่วยวินาที
ฝั่งเว็บเป็นคนอ่านค่านี้จากตัวเล่นแล้วส่งมาให้ครั้งแรกที่มีคนเปิดดู
เซิร์ฟเวอร์เก็บไว้เพื่อคำนวณว่า "ดูครบ N เปอร์เซ็นต์" คือกี่วินาที
จะได้ตรวจกับเวลาจริงได้ ไม่ใช่เชื่อเปอร์เซ็นต์ที่หน้าเว็บส่งมาอย่างเดียว
*/
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS video_url     TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS video_kind    VARCHAR(8) NOT NULL DEFAULT 'upload';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS video_seconds INTEGER    NOT NULL DEFAULT 0;

/*
เงื่อนไขการรับคะแนน

read_seconds  ใช้กับข้อความและรูปภาพ ต้องเปิดค้างไว้กี่วินาทีจึงนับว่าอ่านแล้ว
watch_percent ใช้กับวิดีโอ ต้องดูถึงกี่เปอร์เซ็นต์ของความยาวคลิป
points        คะแนนที่ได้ เป็นคะแนนก้อนเดียวกับ K-POINT ไม่ใช่กระเป๋าแยก
*/
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS points        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS read_seconds  INTEGER NOT NULL DEFAULT 30;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS watch_percent INTEGER NOT NULL DEFAULT 90;

/*
ความคืบหน้าและการรับคะแนนของแต่ละคนต่อข่าวแต่ละชิ้น

UNIQUE (announcement_id, user_id) คือตัวกันรับคะแนนซ้ำตัวจริง
ไม่ได้กันแค่ที่โค้ด เพราะกดสองแท็บพร้อมกันหรือเน็ตกระตุกแล้วกดซ้ำเกิดขึ้นได้จริง
และถ้ากันแค่ที่โค้ด สองคำขอที่เข้ามาพร้อมกันจะอ่านว่า "ยังไม่เคยได้" ทั้งคู่

opened_at เก็บเวลาที่เปิดอ่านครั้งแรกจากนาฬิกาของเซิร์ฟเวอร์
ใช้ตรวจว่าเวลาที่ผ่านไปจริงมากพอหรือยัง ไม่ใช่เชื่อตัวเลขที่หน้าเว็บส่งมา
ไม่งั้นใครก็ยิงคำขอว่าอ่านครบแล้วได้ทันทีโดยไม่ต้องเปิดอ่าน
*/
CREATE TABLE IF NOT EXISTS announcement_views (
  id              BIGSERIAL PRIMARY KEY,
  announcement_id BIGINT      NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress        INTEGER     NOT NULL DEFAULT 0,  -- วินาทีที่อ่าน หรือ % ที่ดู
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  awarded_at      TIMESTAMPTZ,
  points          INTEGER     NOT NULL DEFAULT 0,  -- คะแนนที่ได้จริงหลังคูณตามระดับ
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS announcement_views_user_idx
  ON announcement_views (user_id, awarded_at DESC);
CREATE INDEX IF NOT EXISTS announcement_views_awarded_idx
  ON announcement_views (awarded_at DESC) WHERE awarded_at IS NOT NULL;

/*
เปิดให้บันทึกคะแนนที่มาจากประชาสัมพันธ์ได้

ของเดิมอนุญาตเฉพาะ event / vote / reward / store / system
ถ้ายัดลงเป็น event คะแนนก้อนนี้จะไปปนกับคะแนนกิจกรรมในทุกรายงานและแยกกลับไม่ได้อีก
จึงเพิ่มชนิด pr เข้าไปตรง ๆ
*/
ALTER TABLE point_transactions DROP CONSTRAINT IF EXISTS point_transactions_source_check;
ALTER TABLE point_transactions ADD CONSTRAINT point_transactions_source_check
  CHECK (source IN ('event','vote','reward','store','system','pr'));

-- ผูกรายการคะแนนกลับไปที่ข่าวต้นทาง ใช้ตรวจสอบย้อนหลังว่าคะแนนก้อนนี้มาจากข่าวชิ้นไหน
ALTER TABLE point_transactions
  ADD COLUMN IF NOT EXISTS announcement_id BIGINT REFERENCES announcements(id) ON DELETE SET NULL;
