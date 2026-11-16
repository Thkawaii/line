import { S, cell, downloadWorkbook, merge } from './xlsxReport';

/**
 * ไฟล์ Excel สรุปข้อมูลการลงทะเบียนของกิจกรรมหนึ่ง
 *
 * มีชีตเดียวชื่อ Summary วางคอลัมน์ให้ตรงกับไฟล์ที่ฝ่ายธุรการใช้กันอยู่เดิม
 * เพื่อให้เอาไปวางแทนกันได้ทันที โดยไม่ต้องแก้สูตรหรือรูปแบบที่ทำไว้แล้ว
 *
 *   Location | Section | Manpower | <ชื่อกิจกรรม> | Remark
 *                       number     Completed | Not Complete | Completion Rate
 *
 * หัวเรื่องและหัวคอลัมน์กลางตารางมาจากชื่อกิจกรรม เปลี่ยนชื่อกิจกรรมแล้วไฟล์เปลี่ยนตามเอง
 */

const COLUMNS = { LOCATION: 0, SECTION: 1, MANPOWER: 2, DONE: 3, LEFT: 4, RATE: 5, REMARK: 6 };
// ความกว้างคอลัมน์ ตรงกับไฟล์ตัวอย่างที่ฝ่ายธุรการใช้อยู่
const WIDTHS = [12.4, 20.5, 12.5, 13.6, 13.6, 15.5, 24.5];

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

/**
 * summarySheet สร้างชีตสรุป
 *
 * topic   ใช้ชื่อกิจกรรม หัวเรื่อง เลขรุ่น และข้อความกำกับจำนวนพนักงาน
 * rows    แถวสรุปรายแผนกจาก API (location, section, manpower, completed, not_complete, rate)
 * total   ยอดรวมทั้งหมด
 */
function summarySheet({ topic, rows, total }) {
  const sheet = [];
  const merges = [];
  const blank = () => Array(7).fill(null);

  /*
  สี่บรรทัดบนสุด วางให้ตรงกับไฟล์ตัวอย่างที่ฝ่ายธุรการใช้อยู่

    แถว 1  Rev. ชิดขวา
    แถว 2  วันที่ ชิดขวา
    แถว 3  หัวเรื่องสีแดงชิดซ้าย และข้อความกำกับจำนวนพนักงานชิดขวา
    แถว 4  เว้นว่าง

  หัวเรื่องไม่ผสานเซลล์ ปล่อยให้ข้อความล้นไปทางขวาได้
  ถ้าผสานแล้วชื่อกิจกรรมยาว ๆ จะถูกตัดหายไปตั้งแต่เปิดไฟล์
  */
  const line0 = blank();
  line0[COLUMNS.REMARK] = cell(topic.revision || 'Rev.01', S.META);
  sheet.push(line0);

  const line1 = blank();
  line1[COLUMNS.REMARK] = cell(`Date : ${stampDate()}`, S.META);
  sheet.push(line1);

  const line2 = blank();
  line2[COLUMNS.LOCATION] = cell(topic.heading || topic.title, S.TITLE);
  line2[COLUMNS.REMARK] = cell(topic.as_of_label || '', S.META_UNDERLINE);
  sheet.push(line2);

  sheet.push(blank());

  // หัวตารางสองชั้น ชื่อกิจกรรมกินสามคอลัมน์กลาง
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

  const firstDataRow = sheet.length;

  // เก็บเลขแถว Total ของแต่ละสาขาไว้ ให้แถวรวมทั้งหมดบวกเฉพาะแถวเหล่านี้
  // ถ้าใช้ SUM ครอบทั้งตารางจะนับซ้ำ เพราะแถว Total อยู่ปนกับแถวข้อมูล
  const totalRows = [];

  // ตัวข้อมูล จัดกลุ่มตามสาขาแล้วผสานช่องชื่อสาขาให้กินทุกแถวของกลุ่ม
  for (const group of groupByLocation(rows)) {
    const startRow = sheet.length;

    for (const item of group.items) {
      // แผนกที่ยังทำไม่ครบเติมพื้นเหลืองทั้งแถว กวาดตาแล้วเห็นทันทีว่าต้องตามใคร
      const pending = item.not_complete > 0;
      const textStyle = pending ? S.WARN_TEXT : S.TEXT;
      const numStyle = pending ? S.WARN_NUM : S.NUM;
      const row = sheet.length + 1; // เลขแถวของ Excel เริ่มที่ 1

      const line = blank();
      line[COLUMNS.LOCATION] = cell('', S.LOCATION);
      line[COLUMNS.SECTION] = cell(item.section || '-', textStyle);
      line[COLUMNS.MANPOWER] = cell(item.manpower, numStyle);
      line[COLUMNS.DONE] = cell(item.completed, numStyle);
      // สองช่องนี้คำนวณจากช่องซ้ายมือ แก้ Manpower หรือ Completed ในไฟล์แล้วอัปเดตตาม
      line[COLUMNS.LEFT] = cell(item.not_complete, numStyle, `C${row}-D${row}`);
      // ช่องเปอร์เซ็นต์ปล่อยพื้นขาวเสมอ เพราะมีแถบข้อมูลสีเขียวทับอยู่แล้ว
      // ครอบด้วย IF กันหารด้วยศูนย์ ถ้าแผนกไหนไม่มีพนักงานจะได้ไม่ขึ้น #DIV/0!
      line[COLUMNS.RATE] = cell(item.rate, S.PCT, `IF(C${row}=0,0,D${row}/C${row})`);
      line[COLUMNS.REMARK] = cell('-', S.TEXT);
      sheet.push(line);
    }

    // ผสานช่องสาขาให้คลุมทุกแถวของกลุ่มรวมแถว Total ด้วย
    sheet[startRow][COLUMNS.LOCATION] = cell(group.location, S.LOCATION);
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

    // แถวรวมของสาขา ใช้ SUM ครอบแถวข้อมูลของกลุ่มนี้
    const first = startRow + 1;
    const last = sheet.length;
    const row = sheet.length + 1;

    const totalLine = blank();
    totalLine[COLUMNS.LOCATION] = cell('', S.LOCATION);
    totalLine[COLUMNS.SECTION] = cell('Total', S.TOTAL_TEXT);
    totalLine[COLUMNS.MANPOWER] = cell(sum.manpower, S.TOTAL_NUM, `SUM(C${first}:C${last})`);
    totalLine[COLUMNS.DONE] = cell(sum.completed, S.TOTAL_NUM, `SUM(D${first}:D${last})`);
    totalLine[COLUMNS.LEFT] = cell(left, S.TOTAL_NUM, `C${row}-D${row}`);
    totalLine[COLUMNS.RATE] = cell(
      sum.manpower ? sum.completed / sum.manpower : 0,
      S.TOTAL_PCT,
      `IF(C${row}=0,0,D${row}/C${row})`
    );
    totalLine[COLUMNS.REMARK] = cell('-', S.TOTAL_REMARK);
    sheet.push(totalLine);

    totalRows.push(row);
  }

  const lastDataRow = sheet.length - 1;

  /*
  ยอดรวมทั้งหมด สองบรรทัดตามไฟล์ตัวอย่าง
    บรรทัดบน  จำนวนคน
    บรรทัดล่าง สัดส่วนของจำนวนคนข้างบน (Manpower = 100% เสมอ)
  ผสานช่อง Grand Total ให้กินสองบรรทัด
  */
  const countRow = sheet.length + 1;
  const rateRow = countRow + 1;
  // บวกเฉพาะแถว Total ของแต่ละสาขา เช่น C12+C18+C25
  const sumOf = (column) => totalRows.map((row) => `${column}${row}`).join('+') || '0';

  const grandCount = blank();
  grandCount[COLUMNS.LOCATION] = cell('Grand Total', S.GRAND_TEXT);
  grandCount[COLUMNS.SECTION] = cell('', S.GRAND_TEXT);
  grandCount[COLUMNS.MANPOWER] = cell(total.manpower, S.GRAND_NUM, sumOf('C'));
  grandCount[COLUMNS.DONE] = cell(total.completed, S.GRAND_DONE, sumOf('D'));
  grandCount[COLUMNS.LEFT] = cell(
    total.not_complete,
    S.GRAND_LEFT,
    `C${countRow}-D${countRow}`
  );
  grandCount[COLUMNS.RATE] = cell('', S.GRAND_TEXT);
  grandCount[COLUMNS.REMARK] = cell('', S.GRAND_TEXT);
  sheet.push(grandCount);

  const grandRate = blank();
  grandRate[COLUMNS.LOCATION] = cell('', S.GRAND_TEXT);
  grandRate[COLUMNS.SECTION] = cell('', S.GRAND_TEXT);
  grandRate[COLUMNS.MANPOWER] = cell(1, S.GRAND_PCT, `IF(C${countRow}=0,0,C${countRow}/C${countRow})`);
  grandRate[COLUMNS.DONE] = cell(
    total.rate,
    S.GRAND_DONE_PCT,
    `IF(C${countRow}=0,0,D${countRow}/C${countRow})`
  );
  grandRate[COLUMNS.LEFT] = cell(
    total.manpower ? total.not_complete / total.manpower : 0,
    S.GRAND_LEFT_PCT,
    `C${rateRow}-D${rateRow}`
  );
  grandRate[COLUMNS.RATE] = cell('', S.GRAND_TEXT);
  grandRate[COLUMNS.REMARK] = cell('', S.GRAND_TEXT);
  sheet.push(grandRate);

  const grandRow = sheet.length - 2;
  merges.push(merge(grandRow, COLUMNS.LOCATION, 2, 2));

  return {
    name: 'Summary',
    rows: sheet,
    widths: WIDTHS,
    merges,
    freeze: headRow + 2,
    // แถว 4 เป็นแถวคั่นบาง ๆ ระหว่างหัวเรื่องกับตาราง แถว 5-6 คือหัวตารางสองชั้น
    heights: { 4: 6, 5: 18, 6: 18 },
    // แถบข้อมูลครอบเฉพาะแถวข้อมูลและแถว Total ไม่รวมแถวยอดรวมทั้งหมด
    dataBar: `F${firstDataRow + 1}:F${lastDataRow + 1}`,
  };
}

/** ชื่อไฟล์ที่เปิดแล้วรู้ทันทีว่าของกิจกรรมอะไร ณ วันไหน */
function fileName(title) {
  const safe = String(title || 'สรุปข้อมูล').replace(/[\\/:*?"<>|]/g, ' ').trim();
  return `สรุปข้อมูล ${safe} - ${stampDate()}.xlsx`;
}

/**
 * downloadEventSummary ดาวน์โหลดไฟล์สรุปข้อมูลของกิจกรรมหนึ่ง
 *
 * event        กิจกรรมที่กำลังดูอยู่ ใช้ชื่อเป็นหัวเรื่องและหัวคอลัมน์
 * departments  แถวสรุปรายแผนกจาก API (location, section, manpower, completed, not_complete, rate)
 * progress     ยอดรวมทั้งหมด
 */
export function downloadEventSummary({ event, departments, progress }) {
  const title = event?.title || 'กิจกรรม';

  const topic = {
    // หัวคอลัมน์กลางตารางคือชื่อกิจกรรม
    title,
    heading: `สรุปจำนวนข้อมูลพนักงานลงทะเบียน (${title})`,
    revision: 'Rev.01',
    as_of_label: `ข้อมูล ณ ${stampDate()}`,
  };

  downloadWorkbook(fileName(title), [
    summarySheet({ topic, rows: departments, total: progress }),
  ]);
}
