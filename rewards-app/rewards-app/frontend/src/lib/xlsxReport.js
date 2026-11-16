import { columnName, escapeXml, zip } from './xlsx';

/**
 * ตัวสร้างไฟล์ Excel หลายชีตพร้อมรูปแบบ
 *
 * ตัวใน xlsx.js สร้างได้ชีตเดียวและทุกเซลล์เป็นข้อความล้วน พอสำหรับใบรายชื่อ
 * แต่รายงานสรุปการลงทะเบียนต้องการมากกว่านั้น
 *   - หลายชีต (สรุป + แยกตามสาขา + รายชื่อที่ยังไม่ได้ทำ)
 *   - ผสานเซลล์ ทั้งหัวเรื่องที่กินยาวทั้งแถว และชื่อสาขาที่กินหลายแถว
 *   - ตัวเลขเป็นตัวเลขจริง และคอลัมน์ % เป็นรูปแบบเปอร์เซ็นต์ จะได้เอาไปคำนวณต่อได้
 *   - แถบสีบอกความคืบหน้า และสีแดงเตือนแถวที่ยังทำไม่ครบ
 *
 * ยังคงเขียน XML เองเหมือนเดิม เพื่อไม่ต้องลากไลบรารี xlsx ขนาดเกือบ 1 MB
 * มาให้พนักงานทุกคนโหลดทั้งที่มีแค่ผู้ดูแลระบบไม่กี่คนที่กดดาวน์โหลด
 */

/* ---------- รหัสรูปแบบของเซลล์ ----------

ตัวเลขพวกนี้ต้องตรงกับลำดับใน <cellXfs> ด้านล่างเป๊ะ ๆ
แยกเป็นค่าคงที่ไว้เพื่อให้เรียกใช้อ่านรู้เรื่องและแก้ที่เดียว               */

export const S = {
  PLAIN: 0, // ข้อความลอย ไม่มีกรอบ
  TITLE: 1, // หัวเรื่องใหญ่
  HEAD: 2, // หัวตาราง พื้นเข้ม ตัวหนังสือขาว
  TEXT: 3, // ข้อความในตาราง
  NUM: 4, // ตัวเลขกึ่งกลาง
  PCT: 5, // เปอร์เซ็นต์
  TOTAL_TEXT: 6, // แถวรวม — ข้อความ
  TOTAL_NUM: 7, // แถวรวม — ตัวเลข
  TOTAL_PCT: 8, // แถวรวม — เปอร์เซ็นต์
  WARN_NUM: 9, // ตัวเลขที่ต้องตามงาน (ยังไม่ครบ) ตัวหนังสือแดง
  GOOD_PCT: 10, // ครบ 100% พื้นเขียว
  META: 11, // บรรทัดเล็ก ๆ มุมขวาบน เช่น Rev. / วันที่
};

/**
 * cell สร้างเซลล์หนึ่งช่อง
 *
 * value  ตัวเลขจะถูกเขียนเป็นตัวเลขจริง ข้อความเขียนเป็น inline string
 * style  หนึ่งในค่า S ด้านบน
 */
export const cell = (value, style = S.TEXT) => ({ value, style });

/** merge สร้างคำอธิบายการผสานเซลล์ โดยนับแถวและคอลัมน์เริ่มจาก 0 */
export const merge = (row, col, rowSpan, colSpan) => ({ row, col, rowSpan, colSpan });

function cellXml(entry, rowIndex, colIndex) {
  const ref = `${columnName(colIndex)}${rowIndex + 1}`;

  if (entry === null || entry === undefined) {
    return `<c r="${ref}"/>`;
  }

  const { value, style } = entry;
  const styleAttr = ` s="${style ?? S.TEXT}"`;

  if (value === '' || value === null || value === undefined) {
    return `<c r="${ref}"${styleAttr}/>`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  }

  // ข้อความเก็บเป็น inline string เพื่อไม่ต้องทำตาราง sharedStrings แยก
  // และรหัสพนักงานที่ขึ้นต้นด้วยศูนย์จะไม่ถูก Excel ตัดเลขศูนย์ทิ้ง
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    value
  )}</t></is></c>`;
}

function sheetXml({ rows, widths = [], merges = [], freeze = 0 }) {
  const cols = widths.length
    ? `<cols>${widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  // ตรึงหัวตารางไว้ เลื่อนดูแถวล่าง ๆ แล้วยังเห็นว่าคอลัมน์ไหนคืออะไร
  const pane = freeze
    ? `<sheetViews><sheetView workbookViewId="0">` +
      `<pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/>` +
      `</sheetView></sheetViews>`
    : '';

  const body = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row.map((entry, c) => cellXml(entry, r, c)).join('')}</row>`
    )
    .join('');

  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges
        .map(
          ({ row, col, rowSpan, colSpan }) =>
            `<mergeCell ref="${columnName(col)}${row + 1}:${columnName(col + colSpan - 1)}${
              row + rowSpan
            }"/>`
        )
        .join('')}</mergeCells>`
    : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    pane +
    cols +
    `<sheetData>${body}</sheetData>` +
    mergeXml +
    '</worksheet>'
  );
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  // numFmtId 9 = 0% ซึ่งเป็นรูปแบบมาตรฐานของ Excel อยู่แล้ว ไม่ต้องประกาศเพิ่ม
  '<fonts count="5">' +
  '<font><sz val="11"/><name val="Tahoma"/></font>' + // 0 ปกติ
  '<font><b/><sz val="11"/><name val="Tahoma"/></font>' + // 1 หนา
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font>' + // 2 หนาขาว
  '<font><b/><sz val="13"/><name val="Tahoma"/></font>' + // 3 หัวเรื่อง
  '<font><sz val="11"/><color rgb="FFD93025"/><name val="Tahoma"/></font>' + // 4 แดง
  '</fonts>' +
  '<fills count="6">' +
  '<fill><patternFill patternType="none"/></fill>' + // 0
  '<fill><patternFill patternType="gray125"/></fill>' + // 1
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A4D"/><bgColor indexed="64"/></patternFill></fill>' + // 2 หัวตาราง
  '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF3F6"/><bgColor indexed="64"/></patternFill></fill>' + // 3 แถวรวม
  '<fill><patternFill patternType="solid"><fgColor rgb="FF9DECB8"/><bgColor indexed="64"/></patternFill></fill>' + // 4 เขียว
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFDE7E7"/><bgColor indexed="64"/></patternFill></fill>' + // 5 ชมพูอ่อน
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border>' +
  '<left style="thin"><color rgb="FFBFC8CE"/></left>' +
  '<right style="thin"><color rgb="FFBFC8CE"/></right>' +
  '<top style="thin"><color rgb="FFBFC8CE"/></top>' +
  '<bottom style="thin"><color rgb="FFBFC8CE"/></bottom>' +
  '<diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="12">' +
  // 0 PLAIN
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  // 1 TITLE
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1">' +
  '<alignment vertical="center"/></xf>' +
  // 2 HEAD
  '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  // 3 TEXT
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
  '<alignment vertical="center"/></xf>' +
  // 4 NUM
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 5 PCT
  '<xf numFmtId="9" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 6 TOTAL_TEXT
  '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment vertical="center"/></xf>' +
  // 7 TOTAL_NUM
  '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 8 TOTAL_PCT
  '<xf numFmtId="9" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 9 WARN_NUM
  '<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 10 GOOD_PCT
  '<xf numFmtId="9" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 11 META
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
  '<alignment horizontal="right" vertical="center"/></xf>' +
  '</cellXfs>' +
  '</styleSheet>';

/**
 * buildWorkbook สร้างไฟล์ xlsx จากหลายชีต
 *
 * sheets  [{ name, rows, widths, merges, freeze }]
 *         rows เป็นอาเรย์ของแถว แต่ละช่องสร้างด้วย cell() หรือใส่ null เพื่อเว้นว่าง
 */
export function buildWorkbook(sheets) {
  // ชื่อชีตของ Excel ห้ามเกิน 31 ตัวและห้ามมีอักขระบางตัว ตัดให้ตรงกฎก่อนเพื่อไม่ให้ไฟล์เปิดไม่ขึ้น
  const safeName = (name, index) => {
    const cleaned = String(name || `Sheet${index + 1}`).replace(/[\\/?*[\]:]/g, ' ');
    return cleaned.slice(0, 31) || `Sheet${index + 1}`;
  };

  const files = [
    {
      name: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ` +
              'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          )
          .join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' +
        sheets
          .map(
            (sheet, i) =>
              `<sheet name="${escapeXml(safeName(sheet.name, i))}" sheetId="${i + 1}" r:id="rId${
                i + 1
              }"/>`
          )
          .join('') +
        '</sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" ` +
              'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
              `Target="worksheets/sheet${i + 1}.xml"/>`
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" ` +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    },
    { name: 'xl/styles.xml', content: STYLES },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      content: sheetXml(sheet),
    })),
  ];

  return zip(files);
}

/** downloadWorkbook สั่งเบราว์เซอร์บันทึกไฟล์ */
export function downloadWorkbook(fileName, sheets) {
  const blob = new Blob([buildWorkbook(sheets)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
