/**
 * สร้างไฟล์ .xlsx เองโดยไม่พึ่งไลบรารี
 *
 * ไฟล์ xlsx คือไฟล์ zip ที่ข้างในเป็น XML ไม่กี่ไฟล์
 * เขียนเองได้ในร้อยกว่าบรรทัด ส่วนไลบรารีสำเร็จรูปหนักเกือบ 1 MB
 * ซึ่งต้องโหลดติดไปกับหน้าเว็บทั้งที่ใช้แค่เขียนตารางไม่กี่คอลัมน์
 *
 * เก็บไฟล์ใน zip แบบไม่บีบอัด (method 0) เพราะตารางรายชื่อเล็กมาก
 * การบีบอัดต้องพก deflate มาด้วยโดยไม่ได้ประโยชน์
 */

/* ---------- zip ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  const push = (bytes) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  const u32 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const sum = crc32(data);
    const start = offset;

    push(u32(0x04034b50));
    push(u16(20)); // รุ่นที่ต้องใช้เปิด
    push(u16(0x0800)); // บอกว่าชื่อไฟล์เป็น UTF-8
    push(u16(0)); // ไม่บีบอัด
    push(u16(0)); // เวลา
    push(u16(0)); // วันที่
    push(u32(sum));
    push(u32(data.length));
    push(u32(data.length));
    push(u16(name.length));
    push(u16(0));
    push(name);
    push(data);

    central.push({ name, sum, size: data.length, start });
  }

  const centralStart = offset;

  for (const entry of central) {
    push(u32(0x02014b50));
    push(u16(20));
    push(u16(20));
    push(u16(0x0800));
    push(u16(0));
    push(u16(0));
    push(u16(0));
    push(u32(entry.sum));
    push(u32(entry.size));
    push(u32(entry.size));
    push(u16(entry.name.length));
    push(u16(0));
    push(u16(0));
    push(u16(0));
    push(u16(0));
    push(u32(0));
    push(u32(entry.start));
    push(entry.name);
  }

  const centralSize = offset - centralStart;

  push(u32(0x06054b50));
  push(u16(0));
  push(u16(0));
  push(u16(central.length));
  push(u16(central.length));
  push(u32(centralSize));
  push(u32(centralStart));
  push(u16(0));

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/* ---------- xlsx ---------- */

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const columnName = (index) => {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
};

/**
 * สร้างไฟล์ xlsx หนึ่งชีต
 *
 * rows        อาเรย์ของแถว แต่ละแถวเป็นอาเรย์ของค่าในเซลล์
 * sheetName   ชื่อชีต
 * widths      ความกว้างคอลัมน์ (หน่วยเป็นจำนวนตัวอักษร)
 * headerRows  จำนวนแถวแรกที่ให้เป็นตัวหนา
 */
export function buildXlsx({ rows, sheetName = 'Sheet1', widths = [], headerRows = 1 }) {
  const cols = widths.length
    ? `<cols>${widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const body = rows
    .map((row, r) => {
      const style = r < headerRows ? ' s="1"' : ' s="2"';

      const cells = row
        .map((value, c) => {
          const ref = `${columnName(c)}${r + 1}`;
          if (value === '' || value === null || value === undefined) {
            return `<c r="${ref}"${style}/>`;
          }
          // เก็บทุกค่าเป็นข้อความ รหัสพนักงานที่ขึ้นต้นด้วยศูนย์จะได้ไม่ถูกตัดทิ้ง
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');

      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  const files = [
    {
      name: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
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
        `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
        '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    },
    {
      // สไตล์: 0 ปกติ, 1 หัวตาราง (หนา พื้นเทา มีเส้นขอบ), 2 เซลล์ข้อมูล (มีเส้นขอบ)
      name: 'xl/styles.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2">' +
        '<font><sz val="11"/><name val="Tahoma"/></font>' +
        '<font><b/><sz val="11"/><name val="Tahoma"/></font>' +
        '</fonts>' +
        '<fills count="3">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F3F4"/><bgColor indexed="64"/></patternFill></fill>' +
        '</fills>' +
        '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border>' +
        '<left style="thin"><color rgb="FFD9DDDD"/></left>' +
        '<right style="thin"><color rgb="FFD9DDDD"/></right>' +
        '<top style="thin"><color rgb="FFD9DDDD"/></top>' +
        '<bottom style="thin"><color rgb="FFD9DDDD"/></bottom>' +
        '<diagonal/></border>' +
        '</borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="3">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1">' +
        '<alignment vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1">' +
        '<alignment vertical="center"/></xf>' +
        '</cellXfs>' +
        '</styleSheet>',
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        cols +
        `<sheetData>${body}</sheetData>` +
        '</worksheet>',
    },
  ];

  return zip(files);
}

/** สั่งเบราว์เซอร์บันทึกไฟล์ xlsx */
export function downloadXlsx(name, options) {
  const bytes = buildXlsx(options);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/* ---------- อ่านไฟล์ xlsx (สำหรับอัปโหลด) ---------- */

/**
 * แกะไฟล์ zip แบบอ่านอย่างเดียว
 *
 * อ่านจาก Central Directory ท้ายไฟล์เสมอ (ไม่ไล่อ่าน local header ทีละไฟล์)
 * เพราะ local header บางตัวไม่มีขนาดไฟล์กำกับไว้ (ใช้ data descriptor แทน)
 * ส่วน Central Directory มีขนาดและตำแหน่งของทุกไฟล์ครบเสมอ เชื่อถือได้กว่า
 *
 * ไฟล์ที่ Excel สร้างบีบอัดแบบ deflate เกือบทั้งหมด ใช้ DecompressionStream
 * ของเบราว์เซอร์คลายให้ ไม่ต้องเขียนตัวคลาย deflate เอง
 */
async function unzip(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.length;
  const u16 = (o) => view.getUint16(o, true);
  const u32 = (o) => view.getUint32(o, true);

  let eocd = -1;
  const minStart = Math.max(0, len - 65557);
  for (let i = len - 22; i >= minStart; i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('ไม่ใช่ไฟล์ Excel (.xlsx) ที่ถูกต้อง');

  const totalEntries = u16(eocd + 10);
  const cdOffset = u32(eocd + 16);

  const entries = [];
  let offset = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (u32(offset) !== 0x02014b50) break;
    const method = u16(offset + 10);
    const compSize = u32(offset + 20);
    const nameLen = u16(offset + 28);
    const extraLen = u16(offset + 30);
    const commentLen = u16(offset + 32);
    const localOffset = u32(offset + 42);
    const name = new TextDecoder('utf-8').decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    entries.push({ name, method, compSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }

  const files = {};
  for (const entry of entries) {
    const localNameLen = u16(entry.localOffset + 26);
    const localExtraLen = u16(entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + entry.compSize);

    if (entry.method === 0) {
      files[entry.name] = compressed;
    } else if (entry.method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('เบราว์เซอร์นี้เก่าเกินไป ไม่รองรับการอ่านไฟล์ Excel กรุณาอัปเดตเบราว์เซอร์');
      }
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      files[entry.name] = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error('รูปแบบการบีบอัดในไฟล์นี้ไม่รองรับ');
    }
  }
  return files;
}

const parseXml = (bytes) => new DOMParser().parseFromString(new TextDecoder('utf-8').decode(bytes), 'application/xml');

// "C5" -> ดัชนีคอลัมน์เริ่มที่ 0 (A=0, B=1, ... AA=26)
function columnIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)?.[0] || '';
  let idx = 0;
  for (let i = 0; i < letters.length; i++) idx = idx * 26 + (letters.charCodeAt(i) - 64);
  return idx - 1;
}

function readSharedStrings(files) {
  const file = files['xl/sharedStrings.xml'];
  if (!file) return [];
  const doc = parseXml(file);
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t'))
      .map((t) => t.textContent)
      .join('')
  );
}

// หา path ของชีตแรกในไฟล์ ผ่าน workbook.xml + ความสัมพันธ์ r:id ของมัน
// ถ้าหาไม่เจอ (ไฟล์แปลกๆ) ใช้ sheet1.xml เป็นค่าสำรอง
function firstSheetPath(files) {
  try {
    const wb = parseXml(files['xl/workbook.xml']);
    const rels = parseXml(files['xl/_rels/workbook.xml.rels']);
    const sheetEl = wb.getElementsByTagName('sheet')[0];
    const rId =
      sheetEl.getAttribute('r:id') ||
      sheetEl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const relEl = Array.from(rels.getElementsByTagName('Relationship')).find((el) => el.getAttribute('Id') === rId);
    let target = relEl.getAttribute('Target');
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    if (files[target]) return target;
  } catch {
    /* ไฟล์ไม่มีโครงสร้างตามมาตรฐาน ใช้ค่าสำรองด้านล่าง */
  }
  return Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
}

function readSheetRows(files, sheetPath, strings) {
  const doc = parseXml(files[sheetPath]);
  const rows = [];
  for (const rowEl of Array.from(doc.getElementsByTagName('row'))) {
    const cells = [];
    for (const c of Array.from(rowEl.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r');
      const idx = ref ? columnIndex(ref) : cells.length;
      const type = c.getAttribute('t');
      let value = '';
      if (type === 's') {
        const v = c.getElementsByTagName('v')[0];
        value = v ? strings[parseInt(v.textContent, 10)] || '' : '';
      } else if (type === 'inlineStr') {
        const is = c.getElementsByTagName('is')[0];
        value = is
          ? Array.from(is.getElementsByTagName('t'))
              .map((t) => t.textContent)
              .join('')
          : '';
      } else {
        const v = c.getElementsByTagName('v')[0];
        value = v ? v.textContent : '';
      }
      cells[idx] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * อ่านไฟล์ .xlsx ที่ผู้ดูแลอัปโหลด คืนเป็นแถวของข้อความล้วน (ชีตแรกเท่านั้น)
 *
 * แต่ละแถวเป็นอาเรย์ตามตำแหน่งคอลัมน์จริงในไฟล์ (เซลล์ว่างกลางแถวจะได้ไม่ทำให้คอลัมน์หลังเลื่อน)
 * ไม่ตัดแถวว่างหรือแปลงชนิดข้อมูลใดๆ ให้ผู้เรียกใช้จัดการเอง
 */
export async function readXlsxRows(file) {
  const buffer = await file.arrayBuffer();
  const files = await unzip(buffer);
  const sheetPath = firstSheetPath(files);
  if (!sheetPath) throw new Error('ไม่พบข้อมูลชีตในไฟล์นี้');
  const strings = readSharedStrings(files);
  return readSheetRows(files, sheetPath, strings).map((row) => row.map((cell) => (cell ?? '').toString().trim()));
}
