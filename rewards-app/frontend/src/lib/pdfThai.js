/**
 * วาดข้อความไทยลง PDF ให้วรรณยุกต์ไม่ทับสระบน
 *
 * ปัญหา: คำว่า "ชื่อ" ออกมาเป็น "ชือ" ไม้เอกหายไป
 *
 * สาเหตุ: ฟอนต์ไทยวางวรรณยุกต์ให้ถูกที่ด้วยตาราง GPOS ซึ่งเป็นงานของตัวจัดเรียงอักษร
 * ตัวสร้าง PDF ไม่ได้ทำขั้นตอนนั้น มันวาดทีละตัวตามลำดับที่ได้รับ
 * วรรณยุกต์มีความกว้างศูนย์ จึงถูกวาดทับตำแหน่งเดียวกับสระที่อยู่ก่อนหน้าจนมองไม่เห็น
 *
 * ทางแก้: วาดข้อความโดยเอาวรรณยุกต์ที่มีปัญหาออกก่อน แล้ววาดวรรณยุกต์เหล่านั้น
 * ซ้อนกลับเข้าไปทีหลังโดยยกให้สูงขึ้นพ้นสระ
 * ทำได้เพราะวรรณยุกต์กว้างศูนย์ การถอดออกจึงไม่ทำให้ตัวอื่นเลื่อน
 *
 * วรรณยุกต์ที่ตามหลังพยัญชนะเฉย ๆ เช่น "ก่อน" อยู่ถูกที่อยู่แล้ว ไม่ต้องยก
 */

// สระที่ลอยอยู่ด้านบนพยัญชนะ ถ้ามีวรรณยุกต์ตามมาต้องยกวรรณยุกต์ให้สูงขึ้น
const ABOVE_VOWELS = new Set(['ิ', 'ี', 'ึ', 'ื', 'ั', '็', 'ํ']);

const TONE_MARKS = new Set(['่', '้', '๊', '๋', '์']);

// ระยะที่ยกขึ้น เทียบกับขนาดตัวอักษร ได้จากการลองวาดแล้ววัดจนวรรณยุกต์พ้นหัวสระพอดี
const RAISE_RATIO = 0.3;

/** มีวรรณยุกต์ที่ต้องยกไหม ถ้าไม่มีก็วาดตามปกติได้เลย */
export function needsThaiFix(text) {
  for (let i = 1; i < text.length; i++) {
    if (TONE_MARKS.has(text[i]) && ABOVE_VOWELS.has(text[i - 1])) return true;
  }
  return false;
}

/**
 * วาดข้อความหนึ่งบรรทัด
 *
 * doc   เอกสาร jsPDF ที่ตั้งฟอนต์และขนาดไว้แล้ว
 * text  ข้อความ
 * x, y  ตำแหน่งเริ่มต้น (เหมือนที่ส่งให้ doc.text)
 */
export function drawThaiText(doc, text, x, y) {
  if (!needsThaiFix(text)) {
    doc.text(text, x, y);
    return;
  }

  // แยกวรรณยุกต์ที่ต้องยกออกมา พร้อมจำว่าอยู่หลังอักษรตัวที่เท่าไรของข้อความที่เหลือ
  let base = '';
  const raised = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (TONE_MARKS.has(ch) && i > 0 && ABOVE_VOWELS.has(text[i - 1])) {
      raised.push({ mark: ch, before: base.length });
      continue;
    }
    base += ch;
  }

  doc.text(base, x, y);

  // ขนาดตัวอักษรเป็นพอยต์ แต่พิกัดในเอกสารเป็นหน่วยที่ตั้งไว้ตอนสร้าง (มิลลิเมตร)
  // ต้องหารด้วย scaleFactor ก่อน ไม่งั้นวรรณยุกต์จะลอยไปอยู่บรรทัดบน
  const raise = (doc.getFontSize() * RAISE_RATIO) / doc.internal.scaleFactor;
  for (const item of raised) {
    // วรรณยุกต์กว้างศูนย์ จึงต้องวัดความกว้างของข้อความก่อนหน้าเพื่อหาจุดวาง
    const offset = doc.getTextWidth(base.slice(0, item.before));
    doc.text(item.mark, x + offset, y - raise);
  }
}

/** ความกว้างของข้อความ ไม่นับวรรณยุกต์ที่กว้างศูนย์อยู่แล้ว */
export function thaiTextWidth(doc, text) {
  return doc.getTextWidth(text);
}
