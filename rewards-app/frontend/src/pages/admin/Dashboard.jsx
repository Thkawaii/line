import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Select } from '../../components/ComboBox';
import { Badge, Modal, ProgressBar, Spinner } from '../../components/ui';
import { Icon } from '../../components/icons';
import { dateRange, dateTime, num, thaiDate } from '../../lib/format';
import { tierIcon, tierSolidCircle } from '../../lib/tier';
import { DonutChart, LineChart, PointsChart, RankBar } from '../../components/charts';

function StatCard({ icon: Ico, label, value, suffix, tone = 'primary', link }) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate">
        <span className={tone === 'gold' ? 'text-gold' : 'text-primary'}>
          <Ico size={20} />
        </span>
        {label}
        {link && (
          <Link to={link} className="ml-auto text-muted" aria-label={`ไปที่${label}`}>
            <Icon.Export size={18} />
          </Link>
        )}
      </p>
      <p className="mt-3 text-[32px] font-bold leading-none text-primary">
        {value}
        {suffix && <span className="ml-2 text-base font-medium text-muted">{suffix}</span>}
      </p>
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.adminOverview().then(setData);
  }, []);

  if (!data) return <Spinner />;

  const tierTotal = Object.values(data.tiers).reduce((a, b) => a + b, 0);
  const tierMax = Math.max(...Object.values(data.tiers), 1);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Icon.Users} label="พนักงาน" value={num(data.staffCount)} link="/admin/employees" />
        <StatCard icon={Icon.Calendar} label="กิจกรรมปัจจุบัน" value={num(data.eventCount)} />

        <div className="card p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate">
            <span className="text-primary">
              <Icon.Box size={20} />
            </span>
            สิ่งที่ต้องดำเนินการ
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              { icon: Icon.Box, label: 'รายการรอรับของ', value: data.todo.pending, to: '/admin/rewards?tab=redemptions', tone: 'text-primary' },
              { icon: Icon.Warning, label: 'ของรางวัลใกล้หมด', value: data.todo.lowStock, to: '/admin/rewards', tone: 'text-gold' },
              { icon: Icon.Alert, label: 'ของรางวัลหมด', value: data.todo.outStock, to: '/admin/rewards', tone: 'text-danger' },
            ].map((row) => (
              <li key={row.label}>
                <Link to={row.to} className="flex items-center gap-2 hover:text-primary">
                  <span className={row.tone}>
                    <row.icon size={18} />
                  </span>
                  <span className="flex-1 text-slate">{row.label}</span>
                  <b className="text-ink">{row.value}</b>
                  <Icon.Next size={16} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate">
            <span className="text-primary">
              <Icon.Wallet size={20} />
            </span>
            คะแนนในกระเป๋า
          </p>
          <p className="mt-4 text-center text-[36px] font-bold leading-none text-primary">
            {num(data.walletPoints)} <span className="text-base font-medium text-muted">คะแนน</span>
          </p>
          <p className="mt-3 text-sm font-semibold text-slate">คะแนนที่พนักงานถืออยู่ในปัจจุบัน</p>
        </div>

        <div className="card p-4">
          <p className="text-sm font-semibold text-slate">ระดับสมาชิก</p>
          <ul className="mt-3 space-y-2.5">
            {Object.entries(data.tiers).map(([tier, count]) => {
              const color = { Member: 'slate', Silver: 'sky', Elite: 'gold' }[tier] || 'slate';
              const TierIcon = tierIcon(color);
              return (
              <li key={tier} className="flex items-center gap-3">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${tierSolidCircle(color)}`}>
                  <TierIcon size={15} />
                </span>
                <span className="w-16 text-sm text-slate">{tier}</span>
                <span className="h-4 flex-1 overflow-hidden rounded-[4px] bg-line">
                  <span
                    className="block h-full rounded-[4px] bg-primary"
                    style={{ width: `${Math.round((count / tierMax) * 100)}%` }}
                  />
                </span>
                <span className="w-12 text-right text-sm text-slate">{num(count)}</span>
              </li>
              );
            })}
          </ul>
          <p className="mt-3 text-right text-sm text-slate">รวม {num(tierTotal)}</p>
        </div>
      </div>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink">กิจกรรมที่มีผู้ลงทะเบียน</h2>
          <Link to="/admin/events" className="flex items-center text-sm text-primary">
            ดูทั้งหมด <Icon.Next size={14} />
          </Link>
        </div>

        <ul className="space-y-4">
          {data.events.map((event) => {
            const capacity = event.capacity || Math.max(event.joined, 1);
            const pct = Math.round((event.joined / capacity) * 100);
            return (
              <li key={event.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,2fr)_auto] md:items-center md:gap-4">
                <span className="truncate font-semibold text-slate">{event.title}</span>
                <span className="text-sm text-muted">วันที่ {dateRange(event.event_date, event.end_date)}</span>
                <span>
                  <span className="mb-1 block text-right text-2xs font-semibold text-primary">{pct} %</span>
                  <ProgressBar value={event.joined} max={capacity} tone="primary" />
                </span>
                <span className="text-sm text-slate">
                  {num(event.joined)} / {num(capacity)} คน
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <h2 className="font-semibold text-ink">รายการรอรับของ</h2>
          <Link to="/admin/rewards?tab=redemptions" className="flex items-center text-sm text-primary">
            ดูทั้งหมด <Icon.Next size={14} />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">ชื่อ-สกุล</th>
                <th className="th">แผนก</th>
                <th className="th">ของรางวัลที่แลก</th>
                <th className="th">แต้มที่ใช้</th>
                <th className="th">เวลา</th>
                <th className="th">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {data.pickups.map((row) => (
                <tr key={row.id}>
                  <td className="td">{row.display_name}</td>
                  <td className="td">{row.department}</td>
                  <td className="td">{row.reward_name}</td>
                  <td className="td">{num(row.points_used)}</td>
                  <td className="td">{dateTime(row.redeemed_at)}</td>
                  <td className="td">
                    <Badge className="bg-gold-wash text-gold-ink">รอรับของ</Badge>
                  </td>
                </tr>
              ))}
              {data.pickups.length === 0 && (
                <tr>
                  <td className="td text-center text-muted" colSpan={6}>
                    ยังไม่มีรายการรอรับของ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* กราฟแท่งและกราฟเส้นวาดด้วย SVG ตรง ๆ จะได้ไม่ต้องพึ่งไลบรารีเพิ่ม */
/* ---------- แท็บการวิเคราะห์ ---------- */

const RANGES = [
  { value: 'month', label: 'เดือนนี้' },
  { value: 'year', label: 'ปีนี้' },
  { value: 'custom', label: 'กำหนดเอง' },
];

const MONTH_OPTIONS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// ปี พ.ศ. 2565 ถึง 2600 เก็บเป็น ค.ศ. ในตัวแปร แล้วค่อยบวก 543 ตอนแสดง
const YEAR_OPTIONS = Array.from({ length: 2600 - 2565 + 1 }, (_, i) => 2565 + i - 543);

// ตัวเลือกเดือนสำหรับช่องเลือก ค่าเป็นข้อความเพราะ Select เทียบค่าแบบตรงตัว
const monthChoices = MONTH_OPTIONS.map((m, i) => ({ value: String(i + 1), label: m }));

const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const monthLabel = (value) => MONTH_LABELS[Number(String(value).slice(5, 7)) - 1] || value;

function Panel({ title, hint, action, children, className = '' }) {
  return (
    <section className={`card p-4 ${className}`}>
      {/* ปล่อยให้คำอธิบายสีตกลงบรรทัดใหม่ทั้งก้อนเมื่อการ์ดแคบ
          ดีกว่าบีบจนคำว่า "คะแนนที่แจก" ขึ้นบรรทัดใหม่กลางคำ */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-ink">
          {title}
          {/* ไอคอนคำอธิบาย ชี้ค้างแล้วเห็นว่าตัวเลขในกราฟคิดมาจากอะไร
              ใส่เป็น title ของปุ่ม เบราว์เซอร์จึงแสดงให้เองโดยไม่ต้องเขียน tooltip */}
          {hint && (
            <button
              type="button"
              title={hint}
              aria-label={hint}
              className="text-primary"
            >
              <Icon.Alert size={16} />
            </button>
          )}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function MiniStat({ icon: Ico, label, value, foot, tone = 'text-primary', surface = 'bg-white' }) {
  return (
    <div className={`rounded-card border border-line p-4 ${surface}`}>
      <p className="flex items-center gap-2 text-sm font-medium text-slate">
        <span className={tone}>
          <Ico size={18} />
        </span>
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold leading-none ${tone}`}>{value}</p>
      {/* ตัวหารของเปอร์เซ็นต์ ถ้าไม่โชว์ไว้ คนอ่านจะตรวจทานเลขเองไม่ได้ */}
      {foot ? <p className="mt-1 text-2xs text-muted">{foot}</p> : null}
    </div>
  );
}

function AnalyticsTab() {
  const now = new Date();
  const [filters, setFilters] = useState({
    range: 'year',
    department: 'all',
    tier: 'all',
    event: 'all',
    year: now.getFullYear(),
    fromMonth: 1,
    toMonth: now.getMonth() + 1,
  });
  const [data, setData] = useState(null);
  const [bucket, setBucket] = useState(null);

  const [loading, setLoading] = useState(false);

  /*
    ไม่ล้างข้อมูลเดิมทิ้งตอนโหลดรอบใหม่

    เดิมสั่ง setData(null) ก่อนยิง ทำให้ทั้งหน้าถูกถอดออกแล้วแทนด้วยตัวหมุน
    ความสูงหน้าหดเหลือไม่กี่สิบพิกเซล เบราว์เซอร์จึงเลื่อนกลับขึ้นบนสุดเอง
    พอข้อมูลมา หน้ายืดกลับ แต่ตำแหน่งที่เคยดูอยู่หายไปแล้ว

    ตอนนี้คงของเดิมไว้แล้วหรี่ลงระหว่างรอ ความสูงไม่เปลี่ยน
    คนที่เลื่อนลงมาดูกราฟล่างแล้วเปลี่ยนตัวกรอง จึงยังอยู่ที่เดิม
  */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api
      .adminAnalytics(filters)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // กดเปลี่ยนตัวกรองรัว ๆ แล้วคำตอบเก่ามาทีหลัง ต้องไม่ทับคำตอบใหม่
    return () => {
      cancelled = true;
    };
  }, [filters]);

  // Select ของระบบคืนค่าที่เลือกมาตรง ๆ ไม่ใช่ event เหมือน <select> ของเบราว์เซอร์
  const pick = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));

  /*
    เปลี่ยนช่วงเวลาแล้วล้างกิจกรรมที่เลือกไว้ทิ้งเสมอ

    แต่ละปีมีกิจกรรมคนละชุด กิจกรรมของปี 2569 ไม่มีอยู่ในข้อมูลปี 2568
    ถ้าปล่อยค้างไว้ ผู้ดูแลจะสลับปีแล้วเจอกราฟว่างเปล่าโดยไม่รู้ว่าเพราะตัวกรองค้าง
    ไม่ใช่เพราะปีนั้นไม่มีข้อมูล

    ล้างทิ้งเลยดีกว่าพยายามจับคู่กิจกรรมชื่อเดียวกันข้ามปีให้ เพราะ "กีฬาสีประจำปี"
    ของสองปีคือคนละงานกัน การจับคู่ให้เองจะกลายเป็นการสลับข้อมูลใต้มือผู้ใช้
  */
  const pickRange = (key) => (value) =>
    setFilters((f) => ({ ...f, [key]: value, event: 'all' }));

  // ตัวหมุนเต็มหน้าเฉพาะครั้งแรกที่ยังไม่มีข้อมูลอะไรเลย
  // รอบถัดไปใช้การหรี่แทน หน้าจะได้ไม่หดจนเลื่อนเด้งขึ้นบน
  if (!data) return <Spinner />;

  const { events, points } = data;

  /*
    เซิร์ฟเวอร์รุ่นเก่ายังส่งคีย์ชุดเดิมมา ฟิลด์ที่เพิ่มใหม่จึงเป็น undefined
    แล้วหน้าจอขึ้นว่า "undefined %" ซึ่งไม่บอกอะไรเลยว่าต้องไปทำอะไรต่อ

    ตรวจจากฟิลด์ที่รู้ว่ามีเฉพาะรุ่นใหม่ แล้วบอกตรง ๆ ว่าให้รีสตาร์ทเซิร์ฟเวอร์
    ดีกว่าปล่อยให้เห็นคำว่า undefined แล้วเดาว่าข้อมูลเสีย
  */
  const staleServer = events.joinRate === undefined || events.audience === undefined;

  const eventChoices = [
    { value: 'all', label: 'ทุกกิจกรรม' },
    ...(data.eventOptions || []).map((e) => ({ value: String(e.id), label: e.label })),
  ];

  /*
    เลือกกิจกรรมเดียว = ทั้งหน้ากลายเป็นรายงานของงานนั้นงานเดียว

    บล็อกที่ผูกกับกิจกรรมไม่ได้ (ของรางวัล, ภาพรวมคะแนนรวมของทั้งระบบ) ถูกซ่อนไว้
    เพราะการแลกของรางวัลไม่ได้เกิดจากกิจกรรมใดกิจกรรมหนึ่ง ถ้าปล่อยให้แสดงต่อ
    ตัวเลขพวกนั้นจะเป็นของทั้งระบบ ปนอยู่กับตัวเลขของงานเดียว แล้วอ่านรวมกันผิด
  */
  const oneEvent = filters.event !== 'all';
  const eventName = oneEvent
    ? (eventChoices.find((c) => c.value === filters.event)?.label ?? 'กิจกรรมที่เลือก')
    : '';

  /*
    ตัวเศษของเปอร์เซ็นต์เปลี่ยนความหมายไปตามช่องเลือกกิจกรรม

      ทุกกิจกรรม   = เฉลี่ยจากกิจกรรมทั้งหมดในช่วงที่เลือก (N กิจกรรม)
      กิจกรรมเดียว = อัตราของกิจกรรมนั้นกิจกรรมเดียว (เฉลี่ยจากหนึ่งงาน ก็คืองานนั้นเอง)

    สูตรเดียวกันทั้งสองโหมด แต่ตัวเลขที่ได้ต่างกันคนละเรื่อง
    ตรวจกับข้อมูลจริงสามงาน (19/10/4 คน จากพนักงาน 31 คน) ได้
      ทุกกิจกรรม     เฉลี่ย 11 คน  → 35.48%
      เฉพาะงานแรก    19 คน        → 61.29%
    ถ้าหน้าจอไม่เขียนว่ากำลังดูโหมดไหน สองเลขนี้จะดูเหมือนเลขเดียวกันที่ขัดกันเอง
  */
  const basis = oneEvent
    ? `${eventName} กิจกรรมเดียว`
    : events.events
      ? `เฉลี่ยจาก ${num(events.events)} กิจกรรมในช่วงนี้`
      : 'เฉลี่ยทุกกิจกรรมในช่วงนี้';
  const scopeFoot = oneEvent ? 'เฉพาะกิจกรรมที่เลือก' : 'รวมทุกกิจกรรมในช่วงที่เลือก';

  return (
    <div
      className={`space-y-8 transition-opacity ${loading ? 'pointer-events-none opacity-60' : ''}`}
    >
      {staleServer && (
        <div className="rounded-card bg-gold-wash px-4 py-3 text-sm text-gold-ink">
          <b>เซิร์ฟเวอร์ที่รันอยู่ยังเป็นรุ่นเก่า</b> ตัวเลขบางช่องจึงขึ้นเป็นขีด
          <br />
          ปิดแล้วสั่ง <code className="rounded bg-white/60 px-1">go run .</code> ใหม่ในโฟลเดอร์
          backend ระบบจะต่อเติมตารางให้เองตอนเปิด
        </div>
      )}

      {/* ตัวกรองใช้ร่วมกันทุกบล็อกในหน้านี้ */}
      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-slate">
          ช่วงวันที่
          <div className="w-32">
            <Select options={RANGES} value={filters.range} onChange={pickRange('range')} />
          </div>
        </label>

        {/* เลือกเองว่าปีไหน เดือนไหนถึงเดือนไหน โผล่เฉพาะตอนเลือกกำหนดเอง */}
        {filters.range === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
            <div className="w-24">
              <Select
                options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: String(y + 543) }))}
                value={String(filters.year)}
                onChange={pickRange('year')}
              />
            </div>
            <div className="w-32">
              <Select
                options={monthChoices}
                value={String(filters.fromMonth)}
                onChange={pickRange('fromMonth')}
              />
            </div>
            ถึง
            <div className="w-32">
              <Select
                options={monthChoices}
                value={String(filters.toMonth)}
                onChange={pickRange('toMonth')}
              />
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate">
          แผนก
          <div className="w-36">
            <Select
              options={[
                { value: 'all', label: 'ทั้งหมด' },
                ...data.departmentOptions.map((name) => ({ value: name, label: name })),
              ]}
              value={filters.department}
              onChange={pick('department')}
            />
          </div>
        </label>

        <label className="flex items-center gap-2 text-sm text-slate">
          ระดับสมาชิก
          <div className="w-36">
            <Select
              options={[
                { value: 'all', label: 'ทั้งหมด' },
                { value: 'Member', label: 'Member' },
                { value: 'Silver', label: 'Silver' },
                { value: 'Elite', label: 'Elite' },
              ]}
              value={filters.tier}
              onChange={pick('tier')}
            />
          </div>
        </label>

        {/* กิจกรรม: เลือกทีละงานเพื่อให้ทั้งหน้ากลายเป็นรายงานของงานนั้นงานเดียว
            อยู่แถวเดียวกับตัวกรองอื่น เพราะทั้งสี่ตัวทำงานร่วมกันเป็นชุดเดียว */}
        <label className="flex items-center gap-2 text-sm text-slate">
          กิจกรรม
          <div className="w-48">
            <Select options={eventChoices} value={filters.event} onChange={pick('event')} />
          </div>
        </label>
      </div>

      {/* 1. การวิเคราะห์กิจกรรม */}
      <section>
        <h2 className="mb-3 border-l-4 border-primary pl-2 font-bold text-ink">1. การวิเคราะห์กิจกรรม</h2>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat icon={Icon.Check} label="ลงทะเบียน" value={num(events.registered)} foot={scopeFoot} />
          <MiniStat icon={Icon.Users} label="เข้าร่วมจริง" value={num(events.attended)} foot="เช็กอินหน้างานแล้ว" />
          {/* สองอัตราข้างล่างใช้ตัวหารเดียวกัน (พนักงานทั้งหมด) จะได้บวกกันเป็น 100% พอดี
              บรรทัดเล็กใต้เลขบอกทั้งตัวเศษและตัวหาร ถ้าไม่บอก คนอ่านจะตรวจทานเองไม่ได้
              และจะแยกไม่ออกว่ากำลังดูค่าเฉลี่ยทั้งช่วง หรือดูกิจกรรมเดียว */}
          <MiniStat
            icon={Icon.Clock}
            label="อัตราการเข้าร่วม"
            value={events.joinRate === undefined ? '-' : `${events.joinRate} %`}
            foot={events.audience === undefined ? undefined : `${basis} ÷ พนักงาน ${num(events.audience)} คน`}
          />
          <MiniStat
            icon={Icon.Warning}
            label="ไม่เข้าร่วม"
            value={events.noShowRate === undefined ? '-' : `${events.noShowRate} %`}
            foot={events.audience === undefined ? undefined : `ส่วนที่เหลือจากพนักงาน ${num(events.audience)} คน`}
            tone="text-gold"
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Panel
            title="แนวโน้มอัตราการเข้าร่วมกิจกรรม"
            hint={
              oneEvent
                ? 'เลือกกิจกรรมเดียว = (ผู้เข้าร่วมกิจกรรมนั้น / จำนวนพนักงานทั้งหมด) × 100 เห็นจุดเดียวที่เดือนที่จัดงาน'
                : 'อัตราเข้าร่วม (รายเดือน) = (จำนวนผู้เข้าร่วมเฉลี่ยต่อกิจกรรมในเดือนนั้น / จำนวนพนักงานทั้งหมด) × 100'
            }
          >
            <LineChart
              data={data.attendanceTrend.map((row) => ({
                label: monthLabel(row.month),
                value: row.rate,
                hasData: row.has_data,
              }))}
            />
          </Panel>

          <Panel
            title="กิจกรรมที่ได้รับความสนใจสูงสุด"
            hint="กิจกรรมที่ได้รับความสนใจสูงสุด = (จำนวนผู้ลงทะเบียนในกิจกรรมนั้น / จำนวนพนักงานทั้งหมด) × 100"
          >
            {data.topEvents.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">ยังไม่มีข้อมูลในช่วงนี้</p>
            ) : (
              <ol className="space-y-3">
                {data.topEvents.map((row, index) => (
                  <li key={row.title} className="flex items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-wash text-2xs font-bold text-primary-dark">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium text-ink">{row.title}</p>
                        <span className="shrink-0 text-2xs text-muted">
                          {num(row.joined)} จาก {num(row.audience)} คน
                        </span>
                      </div>
                      <div className="mt-1">
                        {/* แถบกับเปอร์เซ็นต์ใช้ตัวหารเดียวกัน (พนักงานทั้งหมด)
                            เดิมแถบเทียบกับกิจกรรมอันดับหนึ่ง ส่วนเปอร์เซ็นต์หารด้วย capacity
                            สองอย่างจึงไม่ตรงกันเลย */}
                        <RankBar value={row.joined} max={row.audience} />
                      </div>
                    </div>
                    <span className="w-14 shrink-0 text-right text-sm font-semibold text-ink">
                      {row.rate}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="ความถี่การเข้าร่วมของพนักงาน">
            <DonutChart
              items={data.joinFrequency.buckets.map((b) => ({
                label: b.bucket === '5+' ? 'มากกว่า 5 ครั้ง' : `${b.bucket} ครั้ง`,
                value: b.people,
              }))}
              total={data.joinFrequency.total}
              centerLabel="พนักงานทั้งหมด"
              centerValue={data.joinFrequency.total}
              centerUnit="คน"
              onPick={(index) => {
                const picked = data.joinFrequency.buckets[index];
                if (picked?.people > 0) setBucket(picked.bucket);
              }}
            />
            <p className="mt-3 text-center text-2xs text-muted">กดที่ช่วงเพื่อดูว่ามีใครบ้าง</p>
          </Panel>

          <Panel
            title="อัตราการมีส่วนร่วมตามแผนก"
            hint={
              oneEvent
                ? 'เลือกกิจกรรมเดียว = (คนในแผนกที่มากิจกรรมนั้น / จำนวนพนักงานทั้งหมดในแผนก) × 100'
                : 'อัตราการมีส่วนร่วมเฉลี่ยตามแผนก = (จำนวนผู้เข้าร่วมเฉลี่ยต่อกิจกรรมของแผนก / จำนวนพนักงานทั้งหมดในแผนก) × 100'
            }
          >
            {data.departments.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">ยังไม่มีข้อมูลแผนก</p>
            ) : (
              /*
                แสดงสี่แผนกแรกในกรอบที่เห็น ที่เหลือเลื่อนดูในกล่องเดียวกัน
                โรงงานมีสามสิบกว่าแผนก ถ้าปล่อยยาวทั้งหมดการ์ดใบนี้จะสูงกว่า
                การ์ดข้าง ๆ หลายเท่า แล้วหน้าจอทั้งหน้าจะเสียสมดุล

                ความสูงคิดจากสี่แถวพอดี ผู้ใช้จึงเห็นว่ายังมีต่ออีกข้างล่าง
                ไม่ใช่คิดว่ามีแค่นี้
              */
              <ul className="max-h-[17.5rem] space-y-3 overflow-y-auto pr-1">
                {data.departments.map((row) => (
                  <li key={row.department}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">{row.department}</p>
                      <span className="shrink-0 text-sm font-semibold text-ink">{row.rate}%</span>
                    </div>
                    <div className="mt-1">
                      <RankBar value={row.rate} />
                    </div>
                    <p className="mt-0.5 text-2xs text-muted">
                      {/* เขียนด้วยตัวเลขดิบ ผู้อ่านจึงคำนวณตามได้ตรงกับอัตราที่แสดง
                          ถ้าเขียนเป็นค่าเฉลี่ย เลขจะมีเศษที่ปัดยังไงก็ไม่ลงตัว */}
                      เข้าร่วมรวม {num(row.attendances)} ครั้ง จาก {num(row.events)} กิจกรรม ·
                      ทั้งแผนก {num(row.people)} คน
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </section>

      {/* 2. การวิเคราะห์คะแนน */}
      <section>
        <h2 className="mb-3 border-l-4 border-primary pl-2 font-bold text-ink">2. การวิเคราะห์คะแนน</h2>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            title="การเคลื่อนไหวของคะแนน"
            /* เงื่อนไขนี้เคยอ้าง filters.eventPoints ซึ่งถูกยุบรวมเป็น filters.event ไปแล้ว
               ค่าที่อ่านได้จึงเป็น undefined ตลอด และการ์ดขึ้นคำอธิบายของโหมดกิจกรรมเดียวทุกครั้ง
               แม้กำลังดูทุกกิจกรรมอยู่ */
            hint={
              oneEvent
                ? 'เห็นเฉพาะคะแนนที่กิจกรรมนี้แจก · แท่งคะแนนที่ใช้ไปเป็นศูนย์เสมอ เพราะการแลกของรางวัลไม่ได้ผูกกับกิจกรรมใดกิจกรรมหนึ่ง'
                : 'แท่ง = คะแนนที่แจกและที่ใช้ในเดือนนั้น · เส้น = ยอดสะสมรวม ซึ่งเริ่มจากยอดยกมาก่อนช่วงที่เลือก จึงไม่ได้เริ่มที่ศูนย์'
            }
          >
            {/* คำอธิบายสีย้ายลงมาใต้ช่องเลือกกิจกรรม หัวการ์ดจะได้ไม่แน่นเกินไป
                whitespace-nowrap กันไม่ให้ชื่อแต่ละอันถูกตัดกลางคำตอนการ์ดแคบ */}
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
              <span className="flex items-center gap-1 whitespace-nowrap">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#1FC2A0]" /> คะแนนที่แจก
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#3B6DF5]" /> คะแนนที่ใช้
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <span className="h-0.5 w-4 rounded-full bg-primary" /> เคลื่อนไหวรวม
              </span>
            </div>

            <PointsChart
              data={data.pointTrend.map((row) => ({
                label: monthLabel(row.month),
                given: row.given,
                used: row.used,
                balance: row.balance,
                hasData: row.has_data,
              }))}
            />
          </Panel>

          {!oneEvent && (
          <Panel title="ภาพรวมคะแนน">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniStat icon={Icon.Wallet} label="คะแนนที่แจก" value={num(points.given)} surface="bg-primary-wash/50" />
              <MiniStat icon={Icon.Gift} label="คะแนนที่ใช้" value={num(points.used)} tone="text-[#3B82F6]" surface="bg-[#EFF6FF]" />
              <MiniStat icon={Icon.Clock} label="คะแนนหมดอายุ" value={num(points.expired)} tone="text-gold" surface="bg-[#FFF8E6]" />
              <MiniStat
                icon={Icon.History}
                label="คะแนนเพิ่มสุทธิ"
                value={`${points.net >= 0 ? '+' : ''}${num(points.net)}`}
                tone="text-success"
                surface="bg-success-wash"
              />
            </div>
            <p className="mt-3 text-2xs text-muted">
              คะแนนหมดอายุจะเริ่มนับหลังการตัดยอดประจำปีครั้งแรก
            </p>
          </Panel>
          )}
        </div>
      </section>

      {/* 3. การวิเคราะห์ของรางวัล
          ซ่อนตอนเลือกกิจกรรมเดียว เพราะการแลกของรางวัลไม่ได้เกิดจากกิจกรรมใดกิจกรรมหนึ่ง
          ถ้าปล่อยให้แสดงต่อ ตัวเลขของทั้งระบบจะปนอยู่กับตัวเลขของงานเดียวแล้วอ่านรวมกันผิด */}
      {!oneEvent && (
      <section>
        <h2 className="mb-3 border-l-4 border-primary pl-2 font-bold text-ink">3. การวิเคราะห์ของรางวัล</h2>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="สัดส่วนการแลกรางวัล">
            <DonutChart
              items={data.rewardSplit.items.map((row) => ({ label: row.name, value: row.times }))}
              total={data.rewardSplit.total}
              centerLabel="จำนวนครั้งที่แลก"
              centerValue={data.rewardSplit.total}
              centerUnit="ครั้ง"
            />
          </Panel>

          <Panel title="ของรางวัลยอดนิยม">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th w-14">ลำดับ</th>
                    <th className="th">ของรางวัล</th>
                    <th className="th text-right">จำนวนที่แลก</th>
                    <th className="th text-right">คะแนนที่ใช้</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topRewards.map((row, index) => (
                    <tr key={row.name}>
                      <td className="td">{index + 1}</td>
                      <td className="td max-w-[220px] truncate">{row.name}</td>
                      <td className="td text-right">{num(row.redeemed)}</td>
                      <td className="td text-right">{num(row.points)}</td>
                    </tr>
                  ))}
                  {data.topRewards.length === 0 && (
                    <tr>
                      <td className="td py-10 text-center text-muted" colSpan={4}>
                        ยังไม่มีการแลกของรางวัลในช่วงนี้
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </section>
      )}

      <FrequencyPeople bucket={bucket} filters={filters} onClose={() => setBucket(null)} />
    </div>
  );
}

/** รายชื่อพนักงานในช่วงความถี่ที่กดมาจากโดนัท */
function FrequencyPeople({ bucket, filters, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    if (!bucket) return;
    api.adminFrequencyPeople({ ...filters, bucket }).then(setData);
  }, [bucket, filters]);

  const title = bucket === '5+' ? 'เข้าร่วมมากกว่า 5 ครั้ง' : `เข้าร่วม ${bucket} ครั้ง`;

  return (
    <Modal open={!!bucket} onClose={onClose} size="lg">
      <div className="p-6">
        <h2 className="text-xl font-bold text-ink">{title}</h2>
        {data && <p className="mt-1 text-sm text-muted">ทั้งหมด {num(data.total)} คน</p>}

        {!data ? (
          <div className="py-10">
            <Spinner />
          </div>
        ) : (
          <div className="mt-4 max-h-[60vh] overflow-auto rounded-card border border-line">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th w-16">ลำดับ</th>
                  <th className="th">รหัสพนักงาน</th>
                  <th className="th">ชื่อ - นามสกุล</th>
                  <th className="th">แผนก</th>
                  <th className="th">ตำแหน่ง</th>
                  <th className="th">ระดับ</th>
                  <th className="th text-right">เข้าร่วม</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((row, index) => (
                  <tr key={row.employee_code}>
                    <td className="td text-center">{index + 1}</td>
                    <td className="td">{row.employee_code}</td>
                    <td className="td">{row.display_name}</td>
                    <td className="td">{row.department || '-'}</td>
                    <td className="td">{row.position || '-'}</td>
                    <td className="td">{row.tier}</td>
                    <td className="td text-right">{num(row.times)} ครั้ง</td>
                  </tr>
                ))}
                {data.people.length === 0 && (
                  <tr>
                    <td className="td py-10 text-center text-muted" colSpan={7}>
                      ไม่มีพนักงานในช่วงนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="btn-ghost">
            ปิด
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState('overview');

  return (
    <AdminShell title="ภาพรวม">
      <div className="mb-5 flex gap-6 border-b border-line">
        {[
          { value: 'overview', label: 'ภาพรวมรายวัน' },
          { value: 'analytics', label: 'การวิเคราะห์' },
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setTab(item.value)}
            className={`-mb-px border-b-2 pb-2.5 text-[15px] font-semibold ${
              tab === item.value ? 'border-primary text-primary' : 'border-transparent text-slate'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <OverviewTab /> : <AnalyticsTab />}
    </AdminShell>
  );
}
