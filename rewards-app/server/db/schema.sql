-- ระบบสะสมคะแนนพนักงาน — PostgreSQL schema
-- รัน: psql $DATABASE_URL -f db/schema.sql

DROP TABLE IF EXISTS notification_events CASCADE;
DROP TABLE IF EXISTS audit_logs          CASCADE;
DROP TABLE IF EXISTS settings            CASCADE;
DROP TABLE IF EXISTS tiers               CASCADE;
DROP TABLE IF EXISTS notifications       CASCADE;
DROP TABLE IF EXISTS favorites           CASCADE;
DROP TABLE IF EXISTS redemptions         CASCADE;
DROP TABLE IF EXISTS rewards             CASCADE;
DROP TABLE IF EXISTS event_registrations CASCADE;
DROP TABLE IF EXISTS events              CASCADE;
DROP TABLE IF EXISTS point_transactions  CASCADE;
DROP TABLE IF EXISTS banners             CASCADE;
DROP TABLE IF EXISTS faqs                CASCADE;
DROP TABLE IF EXISTS policies            CASCADE;
DROP TABLE IF EXISTS users               CASCADE;

-- ผู้ใช้ทั้งพนักงานและแอดมิน แยกด้วยคอลัมน์ role
CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  employee_code  VARCHAR(32)  NOT NULL UNIQUE,
  username       VARCHAR(64)  NOT NULL UNIQUE,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,
  display_name   VARCHAR(128) NOT NULL,
  department     VARCHAR(64)  NOT NULL DEFAULT '',
  position       VARCHAR(64)  NOT NULL DEFAULT '',
  branch         VARCHAR(64)  NOT NULL DEFAULT '',
  phone          VARCHAR(32)  NOT NULL DEFAULT '',
  birth_date     DATE,
  avatar_url     TEXT,
  role           VARCHAR(8)   NOT NULL DEFAULT 'user'    CHECK (role IN ('user','admin')),
  tier           VARCHAR(16)  NOT NULL DEFAULT 'Member'  CHECK (tier IN ('Member','Silver','Elite')),
  status         VARCHAR(16)  NOT NULL DEFAULT 'Active'  CHECK (status IN ('Active','Inactive')),
  points         INTEGER      NOT NULL DEFAULT 0,
  points_expire_at DATE,
  terms_accepted_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ทุกการได้/ใช้คะแนนถูกบันทึกเป็นรายการเดินบัญชี users.points คือยอดสรุป
CREATE TABLE point_transactions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       VARCHAR(16) NOT NULL CHECK (kind IN ('earn','redeem','expire','adjust')),
  source     VARCHAR(16) NOT NULL DEFAULT 'system' CHECK (source IN ('event','vote','reward','store','system')),
  title      VARCHAR(160) NOT NULL,
  points     INTEGER     NOT NULL,              -- บวกคือได้รับ ลบคือใช้ไป
  ref_code   VARCHAR(48),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id          BIGSERIAL PRIMARY KEY,
  title       VARCHAR(160) NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  agenda      TEXT        NOT NULL DEFAULT '',   -- บรรทัดละหนึ่งช่วงเวลา
  image_url   TEXT,
  location    VARCHAR(160) NOT NULL DEFAULT '',
  event_date  DATE        NOT NULL,
  start_time  TIME        NOT NULL DEFAULT '09:00',
  end_time    TIME        NOT NULL DEFAULT '12:00',
  points      INTEGER     NOT NULL DEFAULT 0,
  kind        VARCHAR(16) NOT NULL DEFAULT 'register' CHECK (kind IN ('register','vote')),
  capacity    INTEGER     NOT NULL DEFAULT 0,    -- 0 คือไม่จำกัด
  status      VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_registrations (
  id          BIGSERIAL PRIMARY KEY,
  event_id    BIGINT      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      VARCHAR(16) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','attended','absent')),
  checked_in_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE TABLE rewards (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(160) NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  how_to      TEXT        NOT NULL DEFAULT '',
  conditions  TEXT        NOT NULL DEFAULT '',
  image_url   TEXT,
  category    VARCHAR(48) NOT NULL DEFAULT 'ทั่วไป',
  points      INTEGER     NOT NULL,
  old_points  INTEGER,                           -- ราคาคะแนนเดิม ใช้แสดงขีดฆ่า
  stock       INTEGER     NOT NULL DEFAULT 0,
  status      VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE redemptions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id   BIGINT      NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  ref_code    VARCHAR(48) NOT NULL UNIQUE,
  points_used INTEGER     NOT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','cancelled')),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ
);

CREATE TABLE favorites (
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(8)  NOT NULL CHECK (target_type IN ('reward','event')),
  target_id   BIGINT      NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);

-- user_id ว่าง = ประกาศถึงพนักงานทุกคน
CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT      REFERENCES users(id) ON DELETE CASCADE,
  category   VARCHAR(16) NOT NULL DEFAULT 'announce' CHECK (category IN ('announce','event','reward','point')),
  title      VARCHAR(160) NOT NULL,
  body       TEXT        NOT NULL DEFAULT '',
  channel    VARCHAR(16) NOT NULL DEFAULT 'in-app' CHECK (channel IN ('in-app','email')),
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE banners (
  id         BIGSERIAL PRIMARY KEY,
  title      VARCHAR(160) NOT NULL DEFAULT '',
  image_url  TEXT,
  link_url   TEXT,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  active     BOOLEAN     NOT NULL DEFAULT true
);

CREATE TABLE faqs (
  id         BIGSERIAL PRIMARY KEY,
  question   VARCHAR(255) NOT NULL,
  answer     TEXT        NOT NULL,
  sort_order INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE policies (
  key        VARCHAR(32) PRIMARY KEY,            -- terms | privacy
  title      VARCHAR(160) NOT NULL,
  content    TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tx_user_idx        ON point_transactions (user_id, created_at DESC);
CREATE INDEX events_date_idx    ON events (event_date DESC);
CREATE INDEX redemptions_user   ON redemptions (user_id, redeemed_at DESC);
CREATE INDEX notif_user_idx     ON notifications (user_id, created_at DESC);
CREATE INDEX users_dept_idx     ON users (department);

-- ระดับสมาชิกและเกณฑ์คะแนน แก้ได้จากหน้าตั้งค่าระบบ
CREATE TABLE tiers (
  key        VARCHAR(16) PRIMARY KEY,
  name       VARCHAR(32)  NOT NULL,
  min_points INTEGER      NOT NULL DEFAULT 0,
  benefits   TEXT         NOT NULL DEFAULT '',
  color      VARCHAR(16)  NOT NULL DEFAULT 'slate',
  sort_order INTEGER      NOT NULL DEFAULT 0
);

-- ค่าตั้งระบบเก็บเป็นคู่ key/value จะได้เพิ่มรายการใหม่โดยไม่ต้องแก้ตาราง
CREATE TABLE settings (
  key        VARCHAR(48) PRIMARY KEY,
  value      TEXT         NOT NULL DEFAULT '',
  label      VARCHAR(160) NOT NULL DEFAULT '',
  kind       VARCHAR(16)  NOT NULL DEFAULT 'text' CHECK (kind IN ('text','number','boolean','date')),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- บันทึกการกระทำของผู้ดูแลระบบ
CREATE TABLE audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(64)  NOT NULL,
  target     VARCHAR(160) NOT NULL DEFAULT '',
  detail     TEXT         NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX audit_created_idx ON audit_logs (created_at DESC);

-- เทมเพลตแจ้งเตือนอัตโนมัติที่ระบบยิงเอง แสดงในแท็บ Systems Event
CREATE TABLE notification_events (
  key         VARCHAR(48) PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  in_app      BOOLEAN      NOT NULL DEFAULT true,
  email       BOOLEAN      NOT NULL DEFAULT false,
  active      BOOLEAN      NOT NULL DEFAULT true,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
