import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// เปิด https ตอน dev เพราะหน้าสแกน QR ต้องใช้กล้อง
// ซึ่งเบราว์เซอร์อนุญาตเฉพาะ https หรือ localhost เท่านั้น
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: '0.0.0.0',   // เครื่องอื่นในวงแลนเปิดได้ด้วย
    port: 4008,
    https: true,
    proxy: {
      // หน้าเว็บยิงไปที่ /api เสมอ แล้ว vite ส่งต่อให้ backend
      // เครื่องอื่นในวงแลนจึงไม่ต้องรู้ IP ของ backend
      // ตั้ง VITE_API_PROXY_TARGET ได้ถ้า backend อยู่คนละเครื่อง
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4007',
        changeOrigin: true,
        // backend มี prefix /api อยู่แล้ว จึงไม่ต้อง rewrite path
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4008,
  },
});
