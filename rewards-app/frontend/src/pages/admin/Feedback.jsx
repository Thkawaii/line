import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Select } from '../../components/ComboBox';
import { EmptyState, Spinner } from '../../components/ui';
import { ScoreBarChart, SERIES_COLORS } from '../../components/charts';
import { Icon } from '../../components/icons';
import { dateTime, num, thaiDate } from '../../lib/format';

/**
 * ผลประเมินความพึงพอใจกิจกรรม
 *
 * ทุกตัวเลขในหน้านี้เป็นค่าเฉลี่ยรวม และข้อเสนอแนะไม่มีชื่อผู้เขียน
 * เซิร์ฟเวอร์ไม่ได้ดึงตัวระบุตัวตนของผู้ตอบออกมาตั้งแต่แรก
 * ไม่ใช่แค่ไม่แสดงที่หน้าจอ
 */

const QUESTIONS = [
  'ความพึงพอใจโดยรวมต่อกิจกรรม',
  'รูปแบบและเนื้อหาของกิจกรรม',
  'วัน เวลา และสถานที่',
  'ประโยชน์หรือประสบการณ์ที่ได้รับ',
  'ความต้องการเข้าร่วมอีกในอนาคต',
];

// ปี พ.ศ. 2565 ถึง 2700 เก็บเป็น ค.ศ. ในค่า แล้วบวก 543 ตอนแสดง
const YEARS = Array.from({ length: 2700 - 2565 + 1 }, (_, i) => {
  const ad = 2565 + i - 543;
  return { value: String(ad), label: String(ad + 543) };
});

const MONTH_LABELS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

// รับ "2026-11" คืน "พ.ย." ไม่เอาเลขวันที่มาปนบนแกน เพราะเป็นข้อมูลรายเดือน
const monthLabel = (value) => MONTH_LABELS[Number(String(value).slice(5, 7)) - 1] || value;

/** สีตามระดับคะแนน ใช้เกณฑ์เดียวกันทั้งหน้า จะได้อ่านเทียบกันได้ */
const toneOf = (score) =>
  score >= 4 ? 'bg-success' : score >= 3 ? 'bg-gold' : 'bg-danger';
const textToneOf = (score) =>
  score >= 4 ? 'text-success' : score >= 3 ? 'text-gold-ink' : 'text-danger';

/** แถบคะแนนเทียบกับเต็ม 5 เสมอ จะได้เทียบข้ามข้อและข้ามกิจกรรมได้ */
function ScoreBar({ score }) {
  return (
    <div className="h-2 overflow-hidden rounded-pill bg-[#D9D9D9]">
      <div
        className={`h-full rounded-pill ${toneOf(score)}`}
        style={{ width: `${(score / 5) * 100}%` }}
      />
    </div>
  );
}

export default function AdminFeedback() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [eventId, setEventId] = useState('0');
  const [data, setData] = useState(null);

  // การ์ดคะแนนเฉลี่ยแสดงทีละกิจกรรม slide คือกิจกรรมที่กำลังดูอยู่
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    setData(null);
    setSlide(0);
    api.adminFeedback({ year, eventId }).then(setData);
  }, [year, eventId]);

  /*
    รายชื่อกิจกรรมมาจากผลประเมินที่มีจริงในปีนั้น ไม่ใช่รายการกิจกรรมทั้งหมด
    กิจกรรมที่ยังไม่มีใครประเมินจึงไม่โผล่มาให้เลือกแล้วเจอหน้าว่าง

    เปลี่ยนปีแล้วกิจกรรมที่เลือกไว้อาจไม่มีในปีใหม่ จึงรีเซ็ตกลับเป็นทุกกิจกรรม
  */
  const eventOptions = [
    { value: '0', label: 'ทุกกิจกรรม' },
    ...(data?.options || []).map((row) => ({ value: String(row.id), label: row.title })),
  ];

  const picker = (
    <div className="flex flex-wrap gap-2">
      <div className="w-52">
        <Select
          options={eventOptions}
          value={eventId}
          onChange={setEventId}
          placeholder="ทุกกิจกรรม"
        />
      </div>
      <div className="w-28">
        <Select
          options={YEARS}
          value={year}
          onChange={(value) => {
            setYear(value);
            setEventId('0');
          }}
        />
      </div>
    </div>
  );

  if (!data) {
    return (
      <AdminShell title="ผลประเมินกิจกรรม" breadcrumb="Feedback" actions={picker}>
        <Spinner />
      </AdminShell>
    );
  }

  const { summary, trend, trendByEvent, events, comments } = data;

  /*
    สีประจำกิจกรรม ผูกตามลำดับที่ปรากฏในรายการตัวเลือก
    กิจกรรมเดิมจึงได้สีเดิมทุกครั้งที่เปิดหน้า ผู้ใช้จำได้ว่าแท่งสีไหนคืองานอะไร
  */
  const colorIndex = new Map((data.options || []).map((row, i) => [row.id, i]));
  const colorOf = (id) => SERIES_COLORS[(colorIndex.get(id) ?? 0) % SERIES_COLORS.length];

  /*
    จัดข้อมูลเป็นรายเดือน แต่ละเดือนมีกี่กิจกรรมก็มีกี่แท่ง

    ใช้โครงเดือนจาก trend ซึ่งเติมครบทั้งปีไว้แล้ว ระยะห่างบนแกนเวลาจึงถูกต้อง
    เดือนที่ไม่มีใครตอบจะได้ bars เป็นอาเรย์ว่างแล้วเว้นว่างไว้
  */
  const months = trend.map((row) => ({
    label: monthLabel(row.month),
    bars: (trendByEvent || [])
      .filter((item) => item.month === row.month)
      .map((item) => ({
        key: item.event_id,
        name: item.title,
        value: item.score,
        answers: item.answers,
      })),
  }));

  // กิจกรรมที่มีแท่งอยู่ในกราฟจริง ใช้ทำคำอธิบายสีใต้กราฟ
  const shown = [...new Map(months.flatMap((m) => m.bars).map((b) => [b.key, b])).values()];

  // กันกรณี slide ค้างเกินจำนวนกิจกรรมหลังเปลี่ยนตัวกรอง
  const picked = events[Math.min(slide, events.length - 1)] || summary;

  if (!summary || summary.answers === 0) {
    return (
      <AdminShell title="ผลประเมินกิจกรรม" breadcrumb="Feedback" actions={picker}>
        <EmptyState
          icon={Icon.StarSparkle}
          title="ยังไม่มีผลประเมินในปีนี้"
          hint="แบบประเมินจะขึ้นให้พนักงานก่อนกิจกรรมจบ ตามเวลาที่ตั้งไว้ในแต่ละกิจกรรม"
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell title="ผลประเมินกิจกรรม" breadcrumb="Feedback" actions={picker}>
      <div className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            ['ผู้ตอบทั้งหมด', num(summary.answers), 'text-ink'],
            ['กิจกรรมที่มีผลประเมิน', num(summary.events), 'text-ink'],
            ['คะแนนเฉลี่ยรวม', `${summary.overall} / 5`, textToneOf(summary.overall)],
          ].map(([label, value, tone]) => (
            <div key={label} className="card p-4">
              <dt className="text-2xs text-muted">{label}</dt>
              <dd className={`mt-1 text-2xl font-bold ${tone}`}>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-ink">คะแนนเฉลี่ย</h3>
                {/* บอกว่าคะแนนชุดนี้เป็นของกิจกรรมไหน ไม่งั้นตอนดูหลายกิจกรรม
                    จะไม่รู้ว่ากำลังอ่านคะแนนของงานอะไรอยู่ */}
                <p className="mt-0.5 truncate text-sm text-primary-dark">{picked.title}</p>
                <p className="mt-0.5 text-2xs text-muted">
                  ตอบแล้ว {num(picked.answers)} คน · เฉลี่ย {picked.overall}
                </p>
              </div>

              {events.length > 1 && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSlide((slide - 1 + events.length) % events.length)}
                    aria-label="กิจกรรมก่อนหน้า"
                    className="grid h-8 w-8 place-items-center rounded-full border border-line text-slate hover:bg-page"
                  >
                    <Icon.Back size={16} />
                  </button>
                  <span className="w-10 text-center text-2xs text-muted">
                    {slide + 1}/{events.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSlide((slide + 1) % events.length)}
                    aria-label="กิจกรรมถัดไป"
                    className="grid h-8 w-8 place-items-center rounded-full border border-line text-slate hover:bg-page"
                  >
                    <Icon.Next size={16} />
                  </button>
                </div>
              )}
            </div>

            <ul className="mt-3 space-y-3">
              {QUESTIONS.map((label, i) => {
                const score = picked[`q${i + 1}`] || 0;
                return (
                  <li key={label}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-slate">
                        {i + 1}. {label}
                      </span>
                      <span className={`shrink-0 text-sm font-bold ${textToneOf(score)}`}>
                        {score}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ScoreBar score={score} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center gap-1.5">
              <h3 className="font-semibold text-ink">คะแนนเฉลี่ย</h3>
              <button
                type="button"
                title="คะแนนเฉลี่ย = คะแนนรวมประเมิน / จำนวนข้อ"
                aria-label="คะแนนเฉลี่ย = คะแนนรวมประเมิน / จำนวนข้อ"
                className="text-primary"
              >
                <Icon.Alert size={16} />
              </button>
            </div>

            {/* เต็ม 5 เสมอ ไม่ปรับเพดานตามข้อมูล ไม่งั้นคะแนน 3.2 จะดูเหมือนเต็ม */}
            <ScoreBarChart max={5} label="คะแนนเฉลี่ย" months={months} colorOf={colorOf} />

            {/* คำอธิบายสี แสดงเฉพาะตอนมีหลายกิจกรรม กิจกรรมเดียวไม่ต้องมีให้รก */}
            {shown.length > 1 && (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {shown.map((bar) => (
                  <li key={bar.key} className="flex items-center gap-1.5 text-2xs text-slate">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: colorOf(bar.key) }}
                    />
                    {bar.name}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card overflow-hidden p-0">
          <div className="border-b border-line px-4 py-3">
            <h3 className="font-semibold text-ink">รายกิจกรรม</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">กิจกรรม</th>
                  <th className="th">วันที่</th>
                  <th className="th text-center">ผู้ตอบ</th>
                  {QUESTIONS.map((_, i) => (
                    <th key={i} className="th text-center">
                      ข้อ {i + 1}
                    </th>
                  ))}
                  <th className="th text-center">เฉลี่ย</th>
                </tr>
              </thead>
              <tbody>
                {events.map((row) => (
                  <tr key={row.id}>
                    <td className="td font-medium text-ink">{row.title}</td>
                    <td className="td whitespace-nowrap">{thaiDate(row.event_date)}</td>
                    <td className="td text-center">{num(row.answers)}</td>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <td key={n} className="td text-center">
                        {row[`q${n}`]}
                      </td>
                    ))}
                    <td className={`td text-center font-bold ${textToneOf(row.overall)}`}>
                      {row.overall}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-4">
          <h3 className="font-semibold text-ink">ข้อเสนอแนะ ({num(comments.length)})</h3>
          {comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">ยังไม่มีใครเขียนข้อเสนอแนะ</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {comments.map((row, i) => (
                <li key={i} className="rounded-[10px] border border-line p-3">
                  <p className="whitespace-pre-line text-sm text-ink">{row.comment}</p>
                  <p className="mt-1.5 text-2xs text-muted">
                    {row.event_title} · {dateTime(row.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
