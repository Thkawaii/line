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
  TITLE: 1, // หัวเรื่อง ตัวหนา
  HEAD: 2, // หัวตาราง พื้นเทอร์ควอยซ์
  TEXT: 3, // ข้อความในตาราง
  NUM: 4, // ตัวเลขกึ่งกลาง
  PCT: 5, // เปอร์เซ็นต์
  TOTAL_TEXT: 6, // แถวรวมของสาขา — ข้อความ
  TOTAL_NUM: 7, // แถวรวมของสาขา — ตัวเลข
  TOTAL_PCT: 8, // แถวรวมของสาขา — เปอร์เซ็นต์
  WARN_TEXT: 9, // แถวที่ยังทำไม่ครบ พื้นเหลือง — ข้อความ
  WARN_NUM: 10, // แถวที่ยังทำไม่ครบ พื้นเหลือง — ตัวเลข
  GRAND_TEXT: 11, // แถวรวมทั้งหมด พื้นเทอร์ควอยซ์
  GRAND_NUM: 12,
  GRAND_PCT: 13,
  META: 14, // บรรทัดเล็กมุมขวาบน เช่น Rev. / วันที่
  META_UNDERLINE: 15, // บรรทัดมุมขวาบนที่ขีดเส้นใต้
  LOCATION: 16, // ช่องชื่อสาขา พื้นเทาอ่อน ตัวหนา
  // แถวรวมทั้งหมด ใช้สีตัวหนังสือแยกคอลัมน์ตามไฟล์ตัวอย่าง
  GRAND_DONE: 17, // Completed — ตัวหนังสือสีเหลือง
  GRAND_LEFT: 18, // Not Complete — ตัวหนังสือสีชมพู
  GRAND_DONE_PCT: 19,
  GRAND_LEFT_PCT: 20,
  TOTAL_REMARK: 21, // ช่อง Remark ของแถวรวมสาขา พื้นขาว ไม่ใช่ฟ้าอ่อน
};

/**
 * cell สร้างเซลล์หนึ่งช่อง
 *
 * value    ตัวเลขจะถูกเขียนเป็นตัวเลขจริง ข้อความเขียนเป็น inline string
 * style    หนึ่งในค่า S ด้านบน
 * formula  สูตรของ Excel โดยไม่ต้องใส่เครื่องหมาย = นำหน้า (ไม่ใส่ก็ได้)
 *
 * ใส่สูตรแล้วยังต้องส่ง value มาด้วยเสมอ เพราะ value จะถูกเก็บเป็น "ค่าที่คำนวณไว้แล้ว"
 * โปรแกรมที่เปิดไฟล์แต่ไม่คำนวณสูตรเอง (เช่น Google Sheets ตอนนำเข้า หรือตัวอ่านไฟล์
 * ในระบบอื่น) จะได้เห็นตัวเลขถูกต้องทันทีแทนที่จะเห็นช่องว่าง
 */
export const cell = (value, style = S.TEXT, formula = null) => ({ value, style, formula });

/** merge สร้างคำอธิบายการผสานเซลล์ โดยนับแถวและคอลัมน์เริ่มจาก 0 */
export const merge = (row, col, rowSpan, colSpan) => ({ row, col, rowSpan, colSpan });

function cellXml(entry, rowIndex, colIndex) {
  const ref = `${columnName(colIndex)}${rowIndex + 1}`;

  if (entry === null || entry === undefined) {
    return `<c r="${ref}"/>`;
  }

  const { value, style, formula } = entry;
  const styleAttr = ` s="${style ?? S.TEXT}"`;

  // เซลล์ที่มีสูตร เก็บทั้งสูตรและค่าที่คำนวณไว้แล้ว
  if (formula) {
    const cached =
      typeof value === 'number' && Number.isFinite(value) ? `<v>${value}</v>` : '';
    return `<c r="${ref}"${styleAttr}><f>${escapeXml(formula)}</f>${cached}</c>`;
  }

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

function sheetXml({ rows, widths = [], merges = [], freeze = 0, dataBar = null, heights = {} }) {
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
    .map((row, r) => {
      // ความสูงแถวกำหนดเองได้ ใช้กับแถวคั่นบาง ๆ และหัวตารางสองชั้น
      const height = heights[r + 1];
      const attrs = height ? ` ht="${height}" customHeight="1"` : '';
      return `<row r="${r + 1}"${attrs}>${row
        .map((entry, c) => cellXml(entry, r, c))
        .join('')}</row>`;
    })
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

  /*
  แถบข้อมูลสีเขียวในคอลัมน์ Completion Rate

  ใช้ conditional formatting แบบ dataBar แทนการเติมสีพื้นทั้งช่อง
  ความยาวของแถบจึงบอกสัดส่วนได้เหมือนไฟล์ตัวอย่าง

  ช่วงของแถบใช้ min/max ให้ตรงกับไฟล์ตัวอย่างที่ฝ่ายธุรการใช้อยู่
  คือ Excel คิดสเกลเองจากค่าต่ำสุดและสูงสุดที่มีอยู่จริงในคอลัมน์

  ข้อควรรู้: แถบจะเทียบกันเองภายในไฟล์ ไม่ได้เทียบกับ 100%
  ถ้าทุกแผนกอยู่ระหว่าง 33% ถึง 59% แถบของ 33% จะสั้นที่สุดและของ 59% จะยาวเต็มช่อง
  ให้ดูตัวเลขเปอร์เซ็นต์ที่เขียนกำกับไว้เป็นหลัก ส่วนแถบใช้เทียบว่าแผนกไหนตามหลังแผนกไหน
  */
  const bar = dataBar
    ? `<conditionalFormatting sqref="${dataBar}">` +
      '<cfRule type="dataBar" priority="1"><dataBar gradient="0">' +
      '<cfvo type="min"/><cfvo type="max"/>' +
      '<color rgb="FF66FF99"/>' +
      '</dataBar></cfRule></conditionalFormatting>'
    : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    pane +
    cols +
    `<sheetData>${body}</sheetData>` +
    mergeXml +
    bar +
    '</worksheet>'
  );
}

/*
ชุดฟอนต์ สี และเส้นกรอบ คัดลอกค่าจากไฟล์ Excel ที่ฝ่ายธุรการใช้กันอยู่

  ฟอนต์         Angsana New ขนาด 16 ทั้งไฟล์ (เปิดไฟล์ตัวอย่างอ่านค่ามาตรง ๆ)
  หัวตาราง      พื้นเทอร์ควอยซ์ #33CCCC ตัวหนา
  ช่องชื่อสาขา   พื้นเทาอ่อน #F2F2F2 ตัวหนา จัดกึ่งกลางทั้งแนวตั้งและแนวนอน
  แถวที่ยังไม่ครบ พื้นเหลือง #FFFF00
  แถวรวมสาขา    พื้นฟ้าอ่อน #DCE6F1
  แถวรวมทั้งหมด  พื้นเทอร์ควอยซ์ กรอบหนา

เส้นคั่นระหว่างแถวข้อมูลเป็นเส้นประ ส่วนเส้นแนวตั้งเป็นเส้นทึบ
ตามไฟล์ตัวอย่าง ทำให้ตารางยาว ๆ อ่านง่ายกว่าเส้นทึบทั้งหมด
*/
const FONT = '<name val="Angsana New"/>';

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  // numFmtId 9 = 0% เป็นรูปแบบมาตรฐานของ Excel อยู่แล้ว ไม่ต้องประกาศเพิ่ม
  '<fonts count="5">' +
  `<font><sz val="16"/>${FONT}</font>` + // 0 ปกติ
  `<font><b/><sz val="16"/>${FONT}</font>` + // 1 หนา
  `<font><u/><sz val="16"/>${FONT}</font>` + // 2 ขีดเส้นใต้
  `<font><b/><sz val="16"/><color rgb="FFFFFF00"/>${FONT}</font>` + // 3 หนา เหลือง
  `<font><b/><sz val="16"/><color rgb="FFFF7979"/>${FONT}</font>` + // 4 หนา ชมพู
  '</fonts>' +
  '<fills count="6">' +
  '<fill><patternFill patternType="none"/></fill>' + // 0
  '<fill><patternFill patternType="gray125"/></fill>' + // 1
  '<fill><patternFill patternType="solid"><fgColor rgb="FF33CCCC"/><bgColor indexed="64"/></patternFill></fill>' + // 2 เทอร์ควอยซ์
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill>' + // 3 ฟ้าอ่อน
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>' + // 4 เหลือง
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>' + // 5 เทาอ่อน
  '</fills>' +
  '<borders count="4">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' + // 0 ไม่มีกรอบ
  // 1 เส้นทึบบาง ใช้กับหัวตารางและแถวรวม
  '<border>' +
  '<left style="thin"><color rgb="FF000000"/></left>' +
  '<right style="thin"><color rgb="FF000000"/></right>' +
  '<top style="thin"><color rgb="FF000000"/></top>' +
  '<bottom style="thin"><color rgb="FF000000"/></bottom>' +
  '<diagonal/></border>' +
  // 2 แถวข้อมูล เส้นแนวตั้งทึบ เส้นแนวนอนประ
  '<border>' +
  '<left style="thin"><color rgb="FF000000"/></left>' +
  '<right style="thin"><color rgb="FF000000"/></right>' +
  '<top style="dotted"><color rgb="FF000000"/></top>' +
  '<bottom style="dotted"><color rgb="FF000000"/></bottom>' +
  '<diagonal/></border>' +
  // 3 กรอบหนา ใช้กับแถวรวมทั้งหมด
  '<border>' +
  '<left style="medium"><color rgb="FF000000"/></left>' +
  '<right style="medium"><color rgb="FF000000"/></right>' +
  '<top style="medium"><color rgb="FF000000"/></top>' +
  '<bottom style="medium"><color rgb="FF000000"/></bottom>' +
  '<diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="22">' +
  // 0 PLAIN
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  // 1 TITLE
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">' +
  '<alignment vertical="center"/></xf>' +
  // 2 HEAD
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  // 3 TEXT
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1" applyAlignment="1">' +
  '<alignment vertical="center"/></xf>' +
  // 4 NUM
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 5 PCT
  '<xf numFmtId="9" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">' +
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
  // 9 WARN_TEXT
  '<xf numFmtId="0" fontId="0" fillId="4" borderId="2" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment vertical="center"/></xf>' +
  // 10 WARN_NUM
  '<xf numFmtId="0" fontId="0" fillId="4" borderId="2" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 11 GRAND_TEXT
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 12 GRAND_NUM
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 13 GRAND_PCT
  '<xf numFmtId="9" fontId="1" fillId="2" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 14 META
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
  '<alignment horizontal="right" vertical="center"/></xf>' +
  // 15 META_UNDERLINE
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">' +
  '<alignment horizontal="right" vertical="center"/></xf>' +
  // 16 LOCATION
  '<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 17 GRAND_DONE — ตัวหนังสือเหลืองบนพื้นเทอร์ควอยซ์
  '<xf numFmtId="0" fontId="3" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 18 GRAND_LEFT — ตัวหนังสือชมพู
  '<xf numFmtId="0" fontId="4" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 19 GRAND_DONE_PCT
  '<xf numFmtId="9" fontId="3" fillId="2" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 20 GRAND_LEFT_PCT
  '<xf numFmtId="9" fontId="4" fillId="2" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment horizontal="center" vertical="center"/></xf>' +
  // 21 TOTAL_REMARK — ช่อง Remark ของแถวรวมสาขา พื้นขาว
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
  '<alignment vertical="center"/></xf>' +
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
