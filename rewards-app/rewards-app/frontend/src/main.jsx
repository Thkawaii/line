import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui';
import { LanguageProvider } from './lib/i18n';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* เส้นทางเก็บไว้ในหน่วยความจำ ไม่เขียนลงแถบที่อยู่
        เปิดเว็บด้วย http://เครื่อง:4008 แล้วที่อยู่จะเป็นแบบนั้นตลอด ไม่มี /login หรือ /rewards ต่อท้าย

        ยังรับเส้นทางที่พิมพ์มาตอนเปิดครั้งแรก เผื่อมีลิงก์เดิมที่ส่งต่อกันไว้
        แต่พอกดใช้งานต่อแล้วที่อยู่จะไม่เปลี่ยนอีก

        ข้อแลกเปลี่ยน: ปุ่มย้อนกลับของเบราว์เซอร์จะออกจากเว็บแทนที่จะถอยหน้า
        ภายในแอปมีปุ่มย้อนกลับของตัวเองอยู่แล้วทุกหน้า */}
    <MemoryRouter initialEntries={[window.location.pathname + window.location.search]}>
      <LanguageProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>
  </React.StrictMode>
);
