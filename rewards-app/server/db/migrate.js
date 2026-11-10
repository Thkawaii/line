import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

// รัน schema.sql ผ่าน Node เพื่อให้อ่าน DATABASE_URL จากไฟล์ .env ได้เหมือนส่วนอื่นของโปรเจค
const here = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('ไม่พบ DATABASE_URL — คัดลอก .env.example เป็น .env ก่อนแล้วลองใหม่');
  process.exit(1);
}

try {
  await pool.query(readFileSync(join(here, 'schema.sql'), 'utf8'));
  console.log('สร้างตารางเรียบร้อย');
} catch (err) {
  console.error('สร้างตารางไม่สำเร็จ:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
