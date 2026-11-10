import jsPDF from 'jspdf';
import { sarabunRegular, sarabunBold } from './sarabun';
import { SHEET_COLUMNS, sheetRows } from './sheetConfig';
import { drawThaiText } from './pdfThai';

/**
 * สร้างใบลงชื่อเป็นไฟล์ PDF
 *
 * วาดตารางเองแทนการใช้ปลั๊กอินตาราง เพราะต้องวาดข้อความผ่าน drawThaiText
 * ที่แก้เรื่องวรรณยุกต์ทับสระ ซึ่งปลั๊กอินไม่เปิดช่องให้แทรก
 * แลกมาด้วยโค้ดเพิ่มร้อยกว่าบรรทัด แต่ตัดไลบรารีออกได้ 150 KB
 */

const PAGE = { width: 210, height: 297 };
const MARGIN = { top: 14, right: 12, bottom: 16, left: 12 };

// ความกว้างแต่ละคอลัมน์ รวมกันได้ 186 มม. พอดีกับพื้นที่ระหว่างขอบซ้ายขวา
const COLUMN_WIDTHS = [16, 24, 70, 36, 40];

const HEADER_HEIGHT = 9;
const ROW_HEIGHT = 10;
const FONT_SIZE = 11;

const LINE_COLOR = [214, 219, 219];
const HEADER_FILL = [244, 243, 244];
const TEXT_COLOR = [25, 59, 68];
const MUTED_COLOR = [113, 120, 122];

/** ชื่อไฟล์ ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ออก กันบันทึกไม่ลงบนวินโดวส์ */
function fileName(eventTitle, extension) {
  const safe = String(eventTitle || 'กิจกรรม').replace(/[\\/:*?"<>|]/g, ' ').trim();
  return `ใบลงชื่อ-${safe}.${extension}`;
}

/** ตัดข้อความที่ยาวเกินช่อง แล้วเติมจุดไข่ปลา */
function fit(doc, text, maxWidth) {
  if (doc.getTextWidth(text) <= maxWidth) return text;

  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** วาดหนึ่งแถว คืนความสูงที่ใช้ไป */
function drawRow(doc, cells, y, { height, bold, fill }) {
  let x = MARGIN.left;

  if (fill) {
    doc.setFillColor(...HEADER_FILL);
    doc.rect(MARGIN.left, y, COLUMN_WIDTHS.reduce((a, b) => a + b, 0), height, 'F');
  }

  doc.setDrawColor(...LINE_COLOR);
  doc.setLineWidth(0.2);
  doc.setFont('Sarabun', bold ? 'bold' : 'normal');
  doc.setTextColor(...TEXT_COLOR);

  cells.forEach((text, index) => {
    const width = COLUMN_WIDTHS[index];
    doc.rect(x, y, width, height);

    if (text) {
      // จัดข้อความกลางแนวตั้งของช่อง บวกครึ่งความสูงตัวอักษรให้เส้นฐานอยู่กลางพอดี
      const baseline = y + height / 2 + FONT_SIZE / doc.internal.scaleFactor / 3;
      const padded = index === 0 ? width / 2 : 2.5;

      if (index === 0) {
        // คอลัมน์ลำดับจัดกึ่งกลาง
        const textWidth = doc.getTextWidth(text);
        drawThaiText(doc, text, x + padded - textWidth / 2, baseline);
      } else {
        drawThaiText(doc, fit(doc, text, width - 5), x + padded, baseline);
      }
    }

    x += width;
  });

  return height;
}

export function downloadPdf(eventTitle, registrations) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ต้องฝังฟอนต์ไทยไปกับไฟล์ ฟอนต์มาตรฐานของ PDF ไม่มีอักขระไทยเลย
  doc.addFileToVFS('Sarabun-Regular.ttf', sarabunRegular);
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
  doc.addFileToVFS('Sarabun-Bold.ttf', sarabunBold);
  doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
  doc.setFont('Sarabun', 'normal');
  doc.setFontSize(FONT_SIZE);

  const rows = sheetRows(registrations);

  // จำนวนแถวที่ลงได้ในหนึ่งหน้า หักหัวตารางออกแล้ว
  const usable = PAGE.height - MARGIN.top - MARGIN.bottom - HEADER_HEIGHT;
  const perPage = Math.max(1, Math.floor(usable / ROW_HEIGHT));
  const pages = Math.max(1, Math.ceil(rows.length / perPage));

  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.addPage();

    let y = MARGIN.top;
    y += drawRow(doc, SHEET_COLUMNS, y, { height: HEADER_HEIGHT, bold: true, fill: true });

    for (const row of rows.slice(page * perPage, (page + 1) * perPage)) {
      y += drawRow(doc, row, y, { height: ROW_HEIGHT });
    }

    // เลขหน้ามุมขวาล่าง
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(`${page + 1}/${pages}`, PAGE.width - MARGIN.right, PAGE.height - 8, { align: 'right' });
    doc.setFontSize(FONT_SIZE);
  }

  // ใช้ save ของเราเอง ไม่ใช่ doc.save ของ jsPDF
  // เพราะตัวมันพยายามเปิดหน้าใหม่ในบางเบราว์เซอร์ ซึ่งโดนตัวบล็อกป๊อปอัปกั้น
  const url = URL.createObjectURL(doc.output('blob'));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(eventTitle, 'pdf');
  link.click();
  URL.revokeObjectURL(url);
}
