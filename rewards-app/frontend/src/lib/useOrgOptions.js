import { useEffect, useState } from 'react';
import { api } from './api';
import { ADMIN_SECTIONS, BRANCHES, POSITIONS, SECTIONS } from './org';

/**
 * รายการตำแหน่งงานและแผนกสำหรับทำช่องเลือก
 *
 * ดึงจากเซิร์ฟเวอร์ก่อนเสมอ เพื่อให้เพิ่มตำแหน่งใหม่ที่เดียวแล้วทุกเครื่องเห็นพร้อมกัน
 * โดยไม่ต้อง build หน้าเว็บใหม่ ถ้าเรียกไม่สำเร็จจะใช้สำเนาในไฟล์ lib/org.js แทน
 * ช่องเลือกจึงไม่เคยว่างเปล่าแม้เน็ตมีปัญหา
 *
 * เซิร์ฟเวอร์ยังส่งค่าที่เคยกรอกเองไว้ (ที่ไม่อยู่ในรายการมาตรฐาน) มาด้วย
 * ผู้ดูแลจึงเลือกซ้ำได้โดยไม่ต้องพิมพ์ใหม่ทุกครั้ง
 *
 * เก็บผลไว้ในตัวแปรระดับโมดูล เปิดฟอร์มซ้ำจึงไม่ยิง API ใหม่ทุกครั้ง
 */

let cached = null;

export function useOrgOptions() {
  const [options, setOptions] = useState(
    cached || {
      positions: POSITIONS,
      sections: SECTIONS,
      branches: BRANCHES,
      adminSections: ADMIN_SECTIONS,
    }
  );

  useEffect(() => {
    if (cached) return;

    let alive = true;
    api
      .adminOrgOptions()
      .then((data) => {
        if (!alive) return;
        // เรียงค่าที่กรอกเองไว้ท้ายรายการมาตรฐาน จะได้ไม่แทรกกลางจนหาของเดิมไม่เจอ
        cached = {
          positions: [...data.positions, ...(data.extraPositions || [])],
          sections: [...data.sections, ...(data.extraSections || [])],
          branches: data.branches || BRANCHES,
          adminSections: data.adminSections || ADMIN_SECTIONS,
        };
        setOptions(cached);
      })
      .catch(() => {
        /* ใช้สำเนาในเครื่องต่อไป ไม่ต้องรบกวนผู้ใช้ */
      });

    return () => {
      alive = false;
    };
  }, []);

  return options;
}
