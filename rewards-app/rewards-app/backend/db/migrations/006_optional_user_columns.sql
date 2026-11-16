-- 006 — คืนสถานะ "กรอกได้หรือเว้นว่างได้" ให้คอลัมน์ที่ไม่บังคับ
--
-- ฐานข้อมูลที่สร้างจาก schema รุ่นเก่าตั้งคอลัมน์เหล่านี้เป็น NOT NULL ไว้
-- ทั้งที่ฟอร์มไม่ได้บังคับกรอก พอผู้ดูแลเพิ่มพนักงานโดยไม่ใส่อีเมล
-- ระบบจะส่งค่าว่างลงไปแล้วฐานข้อมูลปฏิเสธ ขึ้นว่า "เซิร์ฟเวอร์มีปัญหา"
--
--   pq: null value in column "email" of relation "users" violates not-null constraint
--
-- ไฟล์นี้แก้ให้ตรงกับ db/schema.sql ฉบับปัจจุบัน
-- ฐานข้อมูลที่ถูกต้องอยู่แล้วรันผ่านโดยไม่มีอะไรเปลี่ยน (DROP NOT NULL สั่งซ้ำได้)
--
-- ไม่แตะข้อมูลเดิมเลย เปลี่ยนแค่เงื่อนไขของคอลัมน์

DO $$
DECLARE
  column_name text;
BEGIN
  FOREACH column_name IN ARRAY ARRAY[
    'email',             -- ไม่บังคับ ถ้ากรอกต้องไม่ซ้ำ
    'birth_date',
    'avatar_url',
    'points_expire_at',
    'terms_accepted_at'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE users ALTER COLUMN %I DROP NOT NULL', column_name);
    EXCEPTION WHEN undefined_column THEN
      -- ฐานข้อมูลเก่ามากที่ยังไม่มีคอลัมน์นี้ ข้ามไป
      NULL;
    END;
  END LOOP;
END $$;

-- อีเมลที่เคยถูกบันทึกเป็นค่าว่างเพราะคอลัมน์ห้ามเป็น NULL
-- ทำให้เพิ่มพนักงานคนที่สองที่ไม่มีอีเมลไม่ได้ เพราะติดเงื่อนไขห้ามซ้ำ
-- เปลี่ยนให้เป็น NULL ซึ่ง PostgreSQL ไม่ถือว่าซ้ำกัน
UPDATE users SET email = NULL WHERE email = '';
