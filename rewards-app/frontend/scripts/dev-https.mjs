// เปิด vite แบบ https โดยไม่ต้องพึ่งวิธีตั้ง env ที่ต่างกันระหว่าง Windows กับ macOS/Linux
//
// ใช้ตอนจะเปิดเว็บจากมือถือหรือเครื่องอื่นในวงแลน เพราะเวลาเข้าด้วย IP
// เบราว์เซอร์จะปิดทั้งกล้องสแกน QR และการระบุตำแหน่งถ้าไม่ใช่ https
//
// ตัวอย่างการใช้
//   npm run dev:https                           เปิดทุก network interface (ค่าเริ่มต้นจาก vite.config.js)
//   npm run dev:https -- --host 192.168.1.50    ผูกกับ IP เดียว
//   npm run dev:https -- --port 5173            เปลี่ยนพอร์ต

import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

// ส่งต่อ argument ที่ผู้ใช้พิมพ์มาให้ vite ด้วย
// ถ้าไม่ส่งต่อ คำสั่งอย่าง --host หรือ --port จะหายไปเงียบ ๆ
// แล้วผู้ใช้จะงงว่าทำไมสั่งแล้วไม่มีผล
const args = process.argv.slice(2);

/** รวบรวม IP ของเครื่องในวงแลน ไว้พิมพ์บอกว่าให้เอาอะไรไปเปิดบนมือถือ */
function localAddresses() {
  const found = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) found.push(item.address);
    }
  }
  return found;
}

const child = spawn('npx', ['vite', ...args], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_HTTPS: '1' },
});

// รอให้ vite พิมพ์ที่อยู่ของตัวเองก่อน แล้วค่อยต่อท้ายด้วยคำอธิบาย
// ไม่งั้นข้อความจะโผล่ก่อนแล้วถูกบรรทัดของ vite ดันขึ้นไปจนไม่มีใครเห็น
const notice = setTimeout(() => {
  const addresses = localAddresses();
  if (addresses.length === 0) return;

  console.log('\n  เปิดจากมือถือในวงแลนได้ที่');
  for (const address of addresses) {
    console.log(`    https://${address}:4008`);
  }
  console.log(
    '\n  ครั้งแรกเบราว์เซอร์จะเตือนว่าใบรับรองไม่น่าเชื่อถือ เพราะเป็นใบที่สร้างเองตอน dev'
  );
  console.log('  กด "ขั้นสูง" แล้ว "ไปต่อ" ได้เลย ไม่ใช่ปัญหาของโปรแกรม\n');
}, 2000);

child.on('exit', (code) => {
  clearTimeout(notice);
  process.exit(code ?? 0);
});
