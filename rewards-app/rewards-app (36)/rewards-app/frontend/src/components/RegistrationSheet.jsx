import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { Icon } from './icons';
import { Badge, Modal, Spinner } from './ui';
import { dateRange, num, timeRange } from '../lib/format';

/**
 * รายชื่อผู้ลงทะเบียนของกิจกรรม พร้อมใบลงชื่อสำหรับพิมพ์
 *
 * มีสองตารางคนละชุดโดยตั้งใจ
 *   - ตารางบนหน้าจอ ดูข้อมูลพนักงานครบ (รหัส ชื่อ แผนก ตำแหน่ง สาขา)
 *   - ตารางบนกระดาษ เอาเฉพาะที่ต้องใช้หน้างาน (รหัส ชื่อ แผนก ลงชื่อ)
 *     ตัดคอลัมน์ที่ไม่จำเป็นออกเพื่อเหลือที่ให้ช่องเซ็นกว้างพอเซ็นจริง
 *
 * ใบลงชื่อถูกส่งไปวางเป็นลูกโดยตรงของ body ด้วย portal ไม่ได้อยู่ในกล่องหน้าต่าง
 * เพราะกล่องหน้าต่างวางตัวอยู่กลางจอ ถ้าพิมพ์จากในนั้นตารางจะไปโผล่กลางกระดาษและโดนตัด
 * พอย้ายออกมาแล้วตารางไหลตามปกติ เริ่มที่หัวกระดาษและขึ้นหน้าใหม่เองเมื่อยาวเกินหนึ่งแผ่น
 *
 * ชื่อหน้าเว็บถูกล้างชั่วคราวระหว่างพิมพ์ เพื่อไม่ให้เบราว์เซอร์เอาไปใส่หัวกระดาษ
 */
export default function RegistrationSheet({ eventId, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    // ปิดหน้าต่างแล้วต้องล้างข้อมูลทิ้ง ไม่งั้นใบพิมพ์ของกิจกรรมเดิมค้างอยู่ในหน้า
    // แล้วถ้าผู้ใช้สั่งพิมพ์จากที่อื่นจะได้ใบผิดกิจกรรม
    setData(null);
    if (!eventId) return;
    api.adminEventRegistrations(eventId).then(setData);
  }, [eventId]);

  const event = data?.event;
  const isVote = event?.kind === 'vote';

  // เบราว์เซอร์เอาชื่อหน้าเว็บไปใส่หัวกระดาษเอง ล้างชั่วคราวแล้วคืนค่าหลังพิมพ์เสร็จ
  // ส่วนที่อยู่เว็บกับเลขหน้าปิดได้จากกล่องตั้งค่าของเบราว์เซอร์เท่านั้น CSS สั่งไม่ได้
  function print() {
    const title = document.title;
    document.title = '';
    window.print();
    document.title = title;
  }


  const body = (
    <Modal open={!!eventId} onClose={onClose} size="lg">
      {!data ? (
        <div className="p-10">
          <Spinner />
        </div>
      ) : (
        <div className="p-6">
          {/* แถบหัวข้อและปุ่ม ไม่ถูกพิมพ์ลงกระดาษ */}
          <div className="no-print mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-ink">รายชื่อผู้ลงทะเบียน</h2>
              <p className="mt-1 text-sm text-muted">
                ทั้งหมด {num(data.total)} คน · เช็คอินแล้ว {num(data.attended)} คน
                {event.capacity > 0 && ` · รับได้ ${num(event.capacity)} คน`}
              </p>
            </div>

            <button onClick={print} className="btn-primary btn-sm">
              <Icon.Printer size={16} /> พิมพ์ใบลงชื่อ
            </button>
          </div>

          {isVote && data.tally?.length > 0 && (
            <section className="no-print mb-4 rounded-card border border-line p-4">
              <h3 className="mb-2 font-semibold text-ink">ผลโหวต</h3>
              <ul className="space-y-2">
                {data.tally.map((row) => {
                  const pct = data.total > 0 ? Math.round((row.votes / data.total) * 100) : 0;
                  return (
                    <li key={row.label}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate text-ink">{row.label}</span>
                        <span className="shrink-0 text-muted">
                          {num(row.votes)} โหวต ({pct}%)
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-pill bg-primary-wash">
                        <div className="h-full rounded-pill bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ตารางบนหน้าจอ ดูข้อมูลพนักงานครบ */}
          <div className="no-print overflow-x-auto rounded-card border border-line">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">รหัสพนักงาน</th>
                  <th className="th">ชื่อ - นามสกุล</th>
                  <th className="th">แผนก</th>
                  <th className="th">ตำแหน่ง</th>
                  <th className="th">สาขา</th>
                  {isVote && <th className="th">ตัวเลือกที่โหวต</th>}
                  <th className="th">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {data.registrations.map((row) => (
                  <tr key={row.employee_code}>
                    <td className="td">{row.employee_code}</td>
                    <td className="td">{row.display_name}</td>
                    <td className="td">{row.department || '-'}</td>
                    <td className="td">{row.position || '-'}</td>
                    <td className="td">{row.branch || '-'}</td>
                    {isVote && <td className="td">{row.option_label || '-'}</td>}
                    <td className="td">
                      {row.status === 'attended' ? (
                        <Badge className="bg-success-wash text-success">เช็คอินแล้ว</Badge>
                      ) : (
                        <Badge className="bg-line text-slate">รอเช็คอิน</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {data.registrations.length === 0 && (
                  <tr>
                    <td className="td py-10 text-center text-muted" colSpan={isVote ? 7 : 6}>
                      ยังไม่มีผู้ลงทะเบียน
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="no-print mt-6 flex justify-end">
            <button onClick={onClose} className="btn-ghost">
              ปิด
            </button>
          </div>
        </div>
      )}
    </Modal>
  );

  return (
    <>
      {body}
      {data && createPortal(<PrintSheet rows={data.registrations} />, document.body)}
    </>
  );
}

/**
 * ใบลงชื่อที่จะถูกพิมพ์ มีแค่ตารางอย่างเดียว ไม่มีหัวกิจกรรมหรือข้อความอื่น
 * ซ่อนไว้บนหน้าจอด้วย .print-portal แล้วโผล่เฉพาะตอนสั่งพิมพ์
 *
 * ไม่มีผู้ลงทะเบียนก็ยังพิมพ์ได้ จะได้ใบเปล่าไว้ให้คนมาหน้างานเขียนชื่อเอง
 */
function PrintSheet({ rows }) {
  const blanks = rows.length === 0 ? 15 : 0;

  return (
    <div className="print-portal">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sheet-th w-24">รหัส</th>
            <th className="sheet-th">ชื่อ-สกุล</th>
            <th className="sheet-th w-40">แผนก</th>
            <th className="sheet-th w-52">ลงชื่อ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employee_code}>
              <td className="sheet-td">{row.employee_code}</td>
              <td className="sheet-td">{row.display_name}</td>
              <td className="sheet-td">{row.department || '-'}</td>
              {/* ช่องว่างไว้ให้ลงชื่อด้วยปากกาหน้างาน */}
              <td className="sheet-td h-11" />
            </tr>
          ))}

          {Array.from({ length: blanks }, (_, i) => (
            <tr key={`blank-${i}`}>
              <td className="sheet-td h-11" />
              <td className="sheet-td" />
              <td className="sheet-td" />
              <td className="sheet-td" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
