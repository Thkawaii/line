import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// ปกติ dev เป็น http ธรรมดา เปิด http://localhost:4008 ได้เลย
// กล้องของหน้าสแกน QR ใช้งานได้อยู่แล้วเพราะ localhost นับเป็น secure context
//
// จะเปิดเว็บจากมือถือหรือเครื่องอื่นในวงแลนค่อยสั่ง npm run dev:https
// เพราะเวลาเข้าด้วย IP เบราว์เซอร์จะไม่ให้ใช้กล้องถ้าไม่ใช่ https
const useHttps = process.env.VITE_HTTPS === '1' || process.env.VITE_HTTPS === 'true';

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    host: '0.0.0.0',   // เครื่องอื่นในวงแลนเปิดได้ด้วย
    port: 4008,
    strictPort: true,  // ถ้าพอร์ตชนให้ฟ้องเลย ดีกว่าแอบไปเปิดพอร์ตอื่นเงียบ ๆ
    https: useHttps,
    proxy: {
      // หน้าเว็บยิงไปที่ /api เสมอ แล้ว vite ส่งต่อให้ backend
      // เครื่องอื่นในวงแลนจึงไม่ต้องรู้ IP ของ backend
      // ตั้ง VITE_API_PROXY_TARGET ได้ถ้า backend อยู่คนละเครื่อง
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4007',
        changeOrigin: true,
        // backend มี prefix /api อยู่แล้ว จึงไม่ต้อง rewrite path
      },
      // รูปที่อัปโหลดเก็บไว้ที่ backend
      '/uploads': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4007',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4008,
  },
});
