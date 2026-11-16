import { S, cell, downloadWorkbook, merge } from './xlsxReport';

/**
 * ไฟล์ Excel สรุปการลงทะเบียน
 *
 * วางคอลัมน์ให้ตรงกับไฟล์ที่ฝ่ายธุรการใช้กันอยู่เดิม เพื่อให้เอาไปวางแทนกันได้ทันที
 * โดยไม่ต้องแก้สูตรหรือรูปแบบที่ทำไว้แล้ว
 *
 *   Location | Section | Manpower | <ชื่อหัวข้อ> | Remark
 *                       number     Completed | Not Complete | Completion Rate
 *
 * ชื่อหัวข้อกลางตาราง (เดิมคือ "ข้อมูลพนักงานลงทะเบียน Line OA") มาจากหัวข้อที่
 * ผู้ดูแลตั้งไว้ในระบบ เปลี่ยนชื่อหัวข้อแล้วหัวตารางในไฟล์เปลี่ยนตามเอง
 */

const COLUMNS = { LOCATION: 0, SECTION: 1, MANPOWER: 2, DONE: 3, LEFT: 4, RATE: 5, REMARK: 6 };
const WIDTHS = [12, 14, 12, 12, 14, 16, 18];

/** วันที่แบบ 10-Nov-26 ให้เหมือนหัวไฟล์เดิม */
function stampDate(date = new Date()) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}-${months[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
}

/** จัดกลุ่มแถวสรุปตามสาขา โดยคงลำดับที่เซิร์ฟเวอร์ส่งมา */
function groupByLocation(rows) {
  const groups = [];
  const index = new Map();

  for (const row of rows) {
    const key = row.location || '-';
    if (!index.has(key)) {
      index.set(key, { location: key, items: [] });
      groups.push(index.get(key));
    }
    index.get(key).items.push(row);
  }
  return groups;
}

// ครบ 100% ให้พื้นเขียว ยังไม่ครบใช้รูปแบบธรรมดา ดูแวบเดียวก็รู้ว่าแผนกไหนเหลือ
const rateStyle = (rate) => (rate >= 1 ? S.GOOD_PCT : S.PCT);
const leftStyle = (left) => (left > 0 ? S.WARN_NUM : S.NUM);

/**
 * summarySheet สร้างชีตสรุป
 *
 * topic   หัวข้อจากระบบ ใช้ชื่อ หัวเรื่อง เลขรุ่น และข้อความกำกับจำนวนพนักงาน
 * rows    แถวสรุปรายแผนกจาก API (location, section, manpower, completed, not_complete, rate)
 * total   ยอดรวมทั้งหมด
 */
function summarySheet({ topic, rows, total, company }) {
  const sheet = [];
  const merges = [];
  const blank = () => Array(7).fill(null);

  // สามบรรทัดบนสุด: ชื่อบริษัท เลขรุ่น วันที่ และข้อความกำกับจำนวนพนักงาน
  const line0 = blank();
  line0[COLUMNS.LOCATION] = cell(company || '', S.TITLE);
  line0[COLUMNS.REMARK] = cell(topic.revision || 'Rev.01', S.META);
  sheet.push(line0);

  const line1 = blank();
  line1[COLUMNS.REMARK] = cell(`Date : ${stampDate()}`, S.META);
  sheet.push(line1);

  const line2 = blank();
  line2[COLUMNS.LOCATION] = cell(topic.heading || topic.title, S.TITLE);
  line2[COLUMNS.REMARK] = cell(topic.as_of_label || '', S.META);
  sheet.push(line2);
  merges.push(merge(2, COLUMNS.LOCATION, 1, 3));

  // หัวตารางสองชั้น ชื่อหัวข้อกินสามคอลัมน์กลาง
  const headTop = blank();
  headTop[COLUMNS.LOCATION] = cell('Location', S.HEAD);
  headTop[COLUMNS.SECTION] = cell('Section', S.HEAD);
  headTop[COLUMNS.MANPOWER] = cell('Manpower', S.HEAD);
  headTop[COLUMNS.DONE] = cell(topic.title, S.HEAD);
  headTop[COLUMNS.LEFT] = cell('', S.HEAD);
  headTop[COLUMNS.RATE] = cell('', S.HEAD);
  headTop[COLUMNS.REMARK] = cell('Remark', S.HEAD);
  sheet.push(headTop);

  const headBottom = blank();
  headBottom[COLUMNS.LOCATION] = cell('', S.HEAD);
  headBottom[COLUMNS.SECTION] = cell('', S.HEAD);
  headBottom[COLUMNS.MANPOWER] = cell('number', S.HEAD);
  headBottom[COLUMNS.DONE] = cell('Completed', S.HEAD);
  headBottom[COLUMNS.LEFT] = cell('Not Complete', S.HEAD);
  headBottom[COLUMNS.RATE] = cell('Completion Rate', S.HEAD);
  headBottom[COLUMNS.REMARK] = cell('', S.HEAD);
  sheet.push(headBottom);

  const headRow = sheet.length - 2;
  merges.push(
    merge(headRow, COLUMNS.LOCATION, 2, 1),
    merge(headRow, COLUMNS.SECTION, 2, 1),
    merge(headRow, COLUMNS.DONE, 1, 3),
    merge(headRow, COLUMNS.REMARK, 2, 1)
  );

  // ตัวข้อมูล จัดกลุ่มตามสาขาแล้วผสานช่องชื่อสาขาให้กินทุกแถวของกลุ่ม
  for (const group of groupByLocation(rows)) {
    const startRow = sheet.length;

    for (const item of group.items) {
      const line = blank();
      line[COLUMNS.LOCATION] = cell('', S.TEXT);
      line[COLUMNS.SECTION] = cell(item.section || '-', S.TEXT);
      line[COLUMNS.MANPOWER] = cell(item.manpower, S.NUM);
      line[COLUMNS.DONE] = cell(item.completed, S.NUM);
      line[COLUMNS.LEFT] = cell(item.not_complete, leftStyle(item.not_complete));
      line[COLUMNS.RATE] = cell(item.rate, rateStyle(item.rate));
      line[COLUMNS.REMARK] = cell('-', S.TEXT);
      sheet.push(line);
    }

    // ผสานช่องสาขาให้คลุมทุกแถวของกลุ่มรวมแถว Total ด้วย
    // (+1 คือแถว Total ที่กำลังจะต่อท้าย) กลุ่มที่มีแผนกเดียวก็ยังผสานกับแถว Total
    sheet[startRow][COLUMNS.LOCATION] = cell(group.location, S.TEXT);
    merges.push(merge(startRow, COLUMNS.LOCATION, group.items.length + 1, 1));

    // แถวรวมของสาขา
    const sum = group.items.reduce(
      (acc, item) => ({
        manpower: acc.manpower + item.manpower,
        completed: acc.completed + item.completed,
      }),
      { manpower: 0, completed: 0 }
    );
    const left = sum.manpower - sum.completed;

    const totalLine = blank();
    totalLine[COLUMNS.LOCATION] = cell('', S.TOTAL_TEXT);
    totalLine[COLUMNS.SECTION] = cell('Total', S.TOTAL_TEXT);
    totalLine[COLUMNS.MANPOWER] = cell(sum.manpower, S.TOTAL_NUM);
    totalLine[COLUMNS.DONE] = cell(sum.completed, S.TOTAL_NUM);
    totalLine[COLUMNS.LEFT] = cell(left, S.TOTAL_NUM);
    totalLine[COLUMNS.RATE] = cell(
      sum.manpower ? sum.completed / sum.manpower : 0,
      S.TOTAL_PCT
    );
    totalLine[COLUMNS.REMARK] = cell('', S.TOTAL_TEXT);
    sheet.push(totalLine);
  }

  // ยอดรวมทั้งหมด
  const grand = blank();
  grand[COLUMNS.LOCATION] = cell('Grand Total', S.TOTAL_TEXT);
  grand[COLUMNS.SECTION] = cell('', S.TOTAL_TEXT);
  grand[COLUMNS.MANPOWER] = cell(total.manpower, S.TOTAL_NUM);
  grand[COLUMNS.DONE] = cell(total.completed, S.TOTAL_NUM);
  grand[COLUMNS.LEFT] = cell(total.not_complete, S.TOTAL_NUM);
  grand[COLUMNS.RATE] = cell(total.rate, S.TOTAL_PCT);
  grand[COLUMNS.REMARK] = cell('', S.TOTAL_TEXT);
  sheet.push(grand);
  merges.push(merge(sheet.length - 1, COLUMNS.LOCATION, 1, 2));

  return { name: 'Summary', rows: sheet, widths: WIDTHS, merges, freeze: headRow + 2 };
}

/**
 * pendingSheet รายชื่อคนที่ยังไม่ได้ทำ สำหรับให้ผู้ดูแลเอาไปตามงาน
 *
 * ชีตนี้ใส่เฉพาะตอนที่ผู้ดาวน์โหลดเป็นผู้ดูแลระบบ ฝ่ายธุรการจะได้ไฟล์ที่มีแต่ชีตสรุป
 * การ "ยังไม่ได้ทำ" ไม่ได้บอกว่าใครตอบอะไร จึงไม่กระทบคำสัญญาเรื่องไม่ระบุตัวตน
 */
function pendingSheet(pending) {
  const header = ['No', 'Current Code', 'Name - Surname (Thai)', 'Position', 'Section', 'Factory', 'สถานะ'];

  const rows = [header.map((text) => cell(text, S.HEAD))];

  pending.forEach((person, index) => {
    rows.push([
      cell(index + 1, S.NUM),
      cell(person.employee_code || '', S.TEXT),
      cell(person.display_name || '', S.TEXT),
      cell(person.position || '-', S.TEXT),
      cell(person.department || '-', S.TEXT),
      cell(person.branch || '-', S.TEXT),
      cell('รอดำเนินการ', S.TEXT),
    ]);
  });

  if (pending.length === 0) {
    rows.push([cell('ทุกคนทำครบแล้ว', S.TEXT), null, null, null, null, null, null]);
  }

  return {
    name: 'Not Complete',
    rows,
    widths: [6, 14, 30, 22, 12, 10, 14],
    freeze: 1,
  };
}

/** ชื่อไฟล์ที่เปิดแล้วรู้ทันทีว่าของหัวข้ออะไร ณ วันไหน */
function fileName(topic) {
  const safe = String(topic.title || 'รายงาน').replace(/[\\/:*?"<>|]/g, ' ').trim();
  return `${safe} - ${stampDate()}.xlsx`;
}

/**
 * downloadRegistrationReport ดาวน์โหลดไฟล์สรุป
 *
 * pending ส่งมาเฉพาะเมื่อผู้ใช้เป็นผู้ดูแลระบบ ไม่ส่งมาก็จะได้แค่ชีตสรุป
 */
export function downloadRegistrationReport({ topic, rows, total, pending, company }) {
  const sheets = [summarySheet({ topic, rows, total, company })];
  if (Array.isArray(pending)) {
    sheets.push(pendingSheet(pending));
  }
  downloadWorkbook(fileName(topic), sheets);
}
