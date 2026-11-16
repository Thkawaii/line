import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './icons';
import { Modal, Spinner } from './ui';
import { num } from '../lib/format';

/**
 * สรุปข้อมูลการลงทะเบียนของกิจกรรมหนึ่ง แยกรายสาขาและรายแผนก
 *
 * แยกออกมาจากหน้าต่างรายชื่อผู้ลงทะเบียน เพราะสองอย่างนี้ตอบคำถามคนละข้อ
 *   สรุปข้อมูล  "แผนกไหนเหลือกี่คน กี่เปอร์เซ็นต์" — ใช้ดูภาพรวมและส่งต่อเป็นไฟล์
 *   รายชื่อ     "ใครลงทะเบียนบ้าง" — ใช้พิมพ์ใบเซ็นชื่อหน้างาน
 *
 * ตัวเลขตั้งต้นจากพนักงานทั้งหมดที่ยังทำงานอยู่ ไม่ใช่จากคนที่ลงทะเบียนแล้ว
 * จึงบอก "เหลืออีกกี่คน" ได้จริง
 */

/** แถบความคืบหน้า ครบแล้วเป็นสีเขียว ยังไม่ครบเป็นสีทอง */
function RateBar({ rate }) {
  const pct = Math.round(rate * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-pill bg-[#D9D9D9]">
        <div
          className={`h-full rounded-pill ${rate >= 1 ? 'bg-success' : 'bg-gold'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm font-semibold ${rate >= 1 ? 'text-success' : 'text-slate'}`}>
        {pct}%
      </span>
    </div>
  );
}

const FEEDBACK_QUESTIONS = [
  'ความพึงพอใจโดยรวม',
  'รูปแบบและเนื้อหา',
  'วัน เวลา และสถานที่',
  'ประโยชน์ที่ได้รับ',
  'อยากเข้าร่วมอีกในอนาคต',
];

export default function EventSummary({ eventId, onClose }) {
  const [data, setData] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setData(null);
    setFeedback(null);
    if (!eventId) return;
    api.adminEventRegistrations(eventId).then(setData);
    api.adminEventFeedback(eventId).then(setFeedback);
  }, [eventId]);

  /**
   * ดาวน์โหลดเป็น Excel ชีตเดียวชื่อ Summary
   *
   * โหลดตัวสร้างไฟล์ตอนกดเท่านั้น ไม่ต้องให้ทุกคนที่เปิดหน้านี้แบกไปด้วย
   */
  async function exportExcel() {
    setExporting(true);
    try {
      const { downloadEventSummary } = await import('../lib/registrationReport');
      downloadEventSummary({
        event: data.event,
        departments: data.departments,
        progress: data.progress,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal open={!!eventId} onClose={onClose} size="lg">
      {!data ? (
        <div className="p-10">
          <Spinner />
        </div>
      ) : (
        <div className="p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-ink">สรุปข้อมูล</h2>
              <p className="mt-1 text-sm text-muted">{data.event.title}</p>
            </div>

            <button onClick={exportExcel} disabled={exporting} className="btn-primary btn-sm">
              <Icon.Export size={16} />
              {exporting ? 'กำลังสร้างไฟล์' : 'Export Excel'}
            </button>
          </div>

          {/* ยอดรวม อ่านได้ในแวบเดียวโดยไม่ต้องไล่ดูทั้งตาราง */}
          <dl className="mb-4 grid gap-3 sm:grid-cols-4">
            {[
              ['พนักงานทั้งหมด', num(data.progress.manpower), 'text-ink'],
              ['ลงทะเบียนแล้ว', num(data.progress.completed), 'text-success'],
              ['ยังไม่ลงทะเบียน', num(data.progress.not_complete), 'text-danger'],
              ['ความคืบหน้า', `${Math.round(data.progress.rate * 100)}%`, 'text-primary'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-[10px] bg-page p-3">
                <dt className="text-2xs text-muted">{label}</dt>
                <dd className={`mt-1 text-xl font-bold ${tone}`}>{value}</dd>
              </div>
            ))}
          </dl>

          <div className="max-h-[50vh] overflow-y-auto rounded-card border border-line">
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="th">สาขา</th>
                  <th className="th">แผนก</th>
                  <th className="th text-center">ทั้งหมด</th>
                  <th className="th text-center">ลงทะเบียนแล้ว</th>
                  <th className="th text-center">เหลือ</th>
                  <th className="th">ความคืบหน้า</th>
                </tr>
              </thead>
              <tbody>
                {data.departments.map((row) => (
                  <tr key={`${row.location}-${row.section}`}>
                    <td className="td">{row.location}</td>
                    <td className="td">{row.section}</td>
                    <td className="td text-center">{num(row.manpower)}</td>
                    <td className="td text-center">{num(row.completed)}</td>
                    <td
                      className={`td text-center ${
                        row.not_complete > 0 ? 'font-semibold text-danger' : ''
                      }`}
                    >
                      {num(row.not_complete)}
                    </td>
                    <td className="td">
                      <RateBar rate={row.rate} />
                    </td>
                  </tr>
                ))}

                <tr className="bg-page font-semibold">
                  <td className="td" colSpan={2}>
                    รวมทั้งหมด
                  </td>
                  <td className="td text-center">{num(data.progress.manpower)}</td>
                  <td className="td text-center">{num(data.progress.completed)}</td>
                  <td className="td text-center">{num(data.progress.not_complete)}</td>
                  <td className="td">
                    <RateBar rate={data.progress.rate} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ผลประเมินความพึงพอใจ แสดงเฉพาะเมื่อมีคนตอบแล้ว
              ถ้ายังไม่มีก็ไม่ต้องเอาการ์ดว่าง ๆ มาขวางสายตา */}
          {feedback?.summary?.answers > 0 && (
            <section className="mt-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-ink">ผลประเมินความพึงพอใจ</h3>
                <p className="text-2xs text-muted">
                  ตอบแล้ว {num(feedback.summary.answers)} คน · เฉลี่ยรวม{' '}
                  <b className="text-ink">{feedback.summary.overall}</b> จาก 5
                </p>
              </div>

              <ul className="space-y-2 rounded-card border border-line p-4">
                {FEEDBACK_QUESTIONS.map((label, i) => {
                  const score = feedback.summary[`q${i + 1}`] || 0;
                  return (
                    <li key={label}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm text-slate">{label}</span>
                        <span className="text-sm font-semibold text-ink">{score}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-pill bg-[#D9D9D9]">
                        {/* เทียบกับเต็ม 5 เสมอ จะได้เทียบข้อกับข้ามกิจกรรมได้ */}
                        <div
                          className={`h-full rounded-pill ${
                            score >= 4 ? 'bg-success' : score >= 3 ? 'bg-gold' : 'bg-danger'
                          }`}
                          style={{ width: `${(score / 5) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>

              {feedback.comments.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-sm font-semibold text-ink">
                    ข้อเสนอแนะ ({num(feedback.comments.length)})
                  </p>
                  <ul className="max-h-40 space-y-2 overflow-y-auto">
                    {feedback.comments.map((row, i) => (
                      <li
                        key={i}
                        className="whitespace-pre-line rounded-[10px] border border-line p-3 text-sm text-slate"
                      >
                        {row.comment}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <div className="mt-5 flex justify-end">
            <button onClick={onClose} className="btn-ghost">
              ปิด
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
