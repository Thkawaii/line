/*
ไล่หา hook และคอมโพเนนต์ที่ถูกเรียกใช้แต่ลืม import

ทำไมต้องมี: Vite กับ Rollup ไม่ฟ้องกรณีนี้ เพราะมองว่าชื่อที่หาไม่เจอ
อาจเป็นตัวแปรระดับ global ที่มีอยู่ตอนรันจริง การ build จึงผ่านฉลุย
แล้วไปพังเอาตอนผู้ใช้เปิดหน้านั้น ได้หน้าขาวที่ไม่มีข้อความบอกสาเหตุ

เคยเกิดมาแล้วกับหน้า "จัดการสมาชิก" ที่เรียก useAuth() โดยไม่ได้ import
build ผ่าน แต่กดเข้าหน้าแล้วค้าง

สั่งด้วย:  npm run check
*/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;

/** ไล่เก็บไฟล์ .js และ .jsx ทั้งหมดใต้ src */
function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.jsx?$/.test(name)) out.push(full);
  }
  return out;
}

// ชื่อที่มีอยู่แล้วตอนรัน ไม่ต้อง import
const BUILT_IN = new Set(['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback']);

const problems = [];

for (const file of sourceFiles(ROOT)) {
  const src = readFileSync(file, 'utf8');

  // ชื่อทั้งหมดที่ import เข้ามาในไฟล์นี้
  const imported = new Set();
  for (const match of src.matchAll(/import\s+([\s\S]+?)\s+from\s+['"]/g)) {
    for (const name of match[1].match(/[A-Za-z_$][\w$]*/g) ?? []) imported.add(name);
  }

  // ชื่อที่ประกาศไว้ในไฟล์นี้เอง
  const declared = new Set(
    (src.match(/(?:function|const|let|var|class)\s+[A-Za-z_$][\w$]*/g) ?? []).map(
      (text) => text.split(/\s+/)[1]
    )
  );

  // hook ที่ถูกเรียกใช้จริง — รูปแบบ useXxx(
  for (const match of src.matchAll(/\b(use[A-Z][\w$]*)\s*\(/g)) {
    const name = match[1];
    if (imported.has(name) || declared.has(name)) continue;
    // BUILT_IN ยังต้อง import จาก react อยู่ดี เก็บไว้เผื่ออนาคต
    if (BUILT_IN.has(name) && imported.has(name)) continue;

    const line = src.slice(0, match.index).split('\n').length;
    problems.push(`${file.replace(ROOT, 'src')}:${line}  ${name}() ถูกเรียกใช้แต่ไม่ได้ import`);
  }
}

if (problems.length > 0) {
  console.error('พบปัญหา ' + problems.length + ' จุด\n');
  for (const problem of problems) console.error('  ' + problem);
  console.error('\nแก้ให้ครบก่อน build ไม่งั้นหน้านั้นจะขาวตอนเปิดใช้งานจริง');
  process.exit(1);
}

console.log('ตรวจแล้ว: ไม่พบ hook ที่ถูกเรียกใช้โดยไม่ได้ import');
