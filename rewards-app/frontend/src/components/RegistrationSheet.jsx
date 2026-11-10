import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './icons';
import { Badge, Modal, SearchInput, Spinner } from './ui';
import { dateRange, num, timeRange } from '../lib/format';


/**
 * รายชื่อผู้ลงทะเบียนของกิจกรรม พร้อมดาวน์โหลดใบลงชื่อเป็น PDF
 *
 * ตารางบนหน้าจอกับใบลงชื่อใช้คอลัมน์คนละชุดโดยตั้งใจ
 *   - บนหน้าจอ ดูข้อมูลพนักงานครบ (ลำดับ รหัส ชื่อ แผนก ตำแหน่ง สาขา สถานะ)
 *   - ใบลงชื่อ เอาเฉพาะที่ต้องใช้หน้างาน (ลำดับ รหัส ชื่อ แผนก ลงชื่อ)
 *     ตัดคอลัมน์ที่ไม่จำเป็นออกเพื่อเหลือที่ให้ช่องลงชื่อกว้างพอเซ็นจริง
 */
export default function RegistrationSheet({ eventId, onClose }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    // ปิดหน้าต่างแล้วต้องล้างข้อมูลทิ้ง ไม่งั้นใบพิมพ์ของกิจกรรมเดิมค้างอยู่ในหน้า
    // แล้วถ้าผู้ใช้สั่งพิมพ์จากที่อื่นจะได้ใบผิดกิจกรรม
    setData(null);
    setQ('');
    if (!eventId) return;
    api.adminEventRegistrations(eventId).then(setData);
  }, [eventId]);

  const event = data?.event;
  const isVote = event?.kind === 'vote';

  // ค้นหาด้วยรหัสพนักงานเป็นหลัก แต่ให้พิมพ์ชื่อก็เจอด้วย เพราะบางทีจำรหัสไม่ได้
  const keyword = q.trim().toLowerCase();
  const shown = (data?.registrations || []).filter(
    (row) =>
      !keyword ||
      String(row.employee_code).toLowerCase().includes(keyword) ||
      String(row.display_name).toLowerCase().includes(keyword)
  );

  // โหลดตัวสร้าง PDF ตอนกดเท่านั้น ไลบรารีกับฟอนต์ไทยรวมกันหลายร้อย KB
  // ถ้าโหลดมาตั้งแต่เปิดเว็บ พนักงานทุกคนต้องรับภาระทั้งที่ไม่ได้ใช้
  // ดาวน์โหลดได้รายชื่อครบเสมอ ไม่ขึ้นกับคำค้นบนหน้าจอ
  // ใบลงชื่อหน้างานต้องมีทุกคน ไม่ใช่เฉพาะคนที่ผู้ดูแลกำลังค้นหาอยู่
  async function download() {
    setBusy(true);
    try {
      const { downloadPdf } = await import('../lib/sheetFiles');
      downloadPdf(event.title, data.registrations);
    } finally {
      setBusy(false);
    }
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

            <button onClick={download} disabled={busy} className="btn-primary btn-sm">
              <Icon.Export size={16} /> {busy ? 'กำลังสร้างไฟล์' : 'ดาวน์โหลดใบลงชื่อ'}
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

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="min-w-[240px] flex-1">
              <SearchInput value={q} onChange={setQ} placeholder="ค้นหาด้วยรหัสพนักงานหรือชื่อ" />
            </div>
            {keyword && (
              <p className="text-sm text-muted">
                พบ {num(shown.length)} จาก {num(data.total)} คน
              </p>
            )}
          </div>

          <p className="no-print mb-2 text-sm text-slate">
            {event.title} · {dateRange(event.event_date, event.end_date)} ·{' '}
            {timeRange(event.start_time, event.end_time)}
            {event.location && ` · ${event.location}`}
          </p>

          {/* ตารางบนหน้าจอ ดูข้อมูลพนักงานครบ */}
          <div className="no-print overflow-x-auto rounded-card border border-line">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th w-16">ลำดับ</th>
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
                {shown.map((row, index) => (
                  <tr key={row.employee_code}>
                    <td className="td text-center">{index + 1}</td>
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
                      {row.walk_in && (
                        <Badge className="ml-1.5 bg-gold-wash text-gold-ink">หน้างาน</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td className="td py-10 text-center text-muted" colSpan={isVote ? 8 : 7}>
                      {keyword ? 'ไม่พบคนที่ตรงกับคำค้น' : 'ยังไม่มีผู้ลงทะเบียน'}
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

  return body;
}
