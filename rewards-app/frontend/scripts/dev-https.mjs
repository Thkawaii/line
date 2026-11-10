// เปิด vite แบบ https โดยไม่ต้องพึ่งวิธีตั้ง env ที่ต่างกันระหว่าง Windows กับ macOS/Linux
import { spawn } from 'node:child_process';

spawn('npx', ['vite'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_HTTPS: '1' },
}).on('exit', (code) => process.exit(code ?? 0));
