import { Component } from 'react';
import { Icon } from './icons';

/**
 * ตาข่ายกันหน้าขาว
 *
 * ถ้าคอมโพเนนต์ไหนพังระหว่างวาด React จะถอดทั้งหน้าทิ้งแล้วเหลือหน้าขาวเปล่า
 * ซึ่งผู้ใช้ไม่รู้เลยว่าเกิดอะไรขึ้น และคนแก้ก็ไม่รู้ว่าพังตรงไหน
 *
 * ตัวนี้ดักไว้แล้วแสดงข้อความพร้อมปุ่มกลับไปหน้าที่ใช้ได้
 * พร้อมแสดงรายละเอียดข้อผิดพลาดให้คัดลอกส่งต่อได้
 *
 * ต้องเป็น class component เพราะ React รองรับ componentDidCatch เฉพาะแบบ class
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // เก็บไว้ใน console ด้วย เผื่อคนแก้เปิด DevTools อยู่
    console.error('หน้าจอพังระหว่างวาด:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-dvh place-items-center bg-page p-6">
        <div className="w-full max-w-md rounded-card bg-white p-6 text-center shadow-card">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gold-wash text-gold-ink">
            <Icon.Warning size={24} />
          </span>

          <h1 className="mt-4 text-lg font-bold text-ink">หน้านี้แสดงผลไม่สำเร็จ</h1>
          <p className="mt-2 text-sm text-muted">
            ลองโหลดหน้าใหม่อีกครั้ง ถ้ายังไม่หายให้แจ้งผู้ดูแลระบบ
            พร้อมส่งรายละเอียดด้านล่างไปด้วย
          </p>

          {/* แสดงข้อความจริงไว้ให้คัดลอกได้ ไม่ใช่ซ่อนไว้ใน console ที่คนทั่วไปเปิดไม่เป็น */}
          <pre className="mt-4 max-h-40 overflow-auto rounded-[10px] bg-page p-3 text-left text-2xs text-slate">
            {String(error?.message || error)}
          </pre>

          <div className="mt-5 flex gap-2">
            <button onClick={() => window.location.reload()} className="btn-ghost flex-1">
              โหลดหน้าใหม่
            </button>
            {/*
              พังที่หน้าผู้ดูแล ต้องกลับไปหน้าผู้ดูแล ไม่ใช่หน้าแอปพนักงาน

              เดิมส่งกลับ / เสมอ ผู้ดูแลที่เจอหน้าพังจึงเด้งไปโผล่ฝั่งพนักงาน
              ซึ่งงงกว่าตัวข้อผิดพลาดเอง เพราะดูเหมือนระบบสลับบัญชีให้
            */}
            <button
              onClick={() => {
                window.location.href = window.location.pathname.startsWith('/admin')
                  ? '/admin'
                  : '/';
              }}
              className="btn-primary flex-1"
            >
              {window.location.pathname.startsWith('/admin') ? 'กลับหน้าผู้ดูแล' : 'กลับหน้าแรก'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
