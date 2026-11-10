import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Badge, ProgressBar, Spinner } from '../../components/ui';
import { Icon } from '../../components/icons';
import { dateTime, num, thaiDate } from '../../lib/format';

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
              { icon: Icon.Box, label: 'รายการรอรับของ', value: data.todo.pending, to: '/admin/rewards', tone: 'text-primary' },
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
            {Object.entries(data.tiers).map(([tier, count]) => (
              <li key={tier} className="flex items-center gap-3">
                <span className="w-16 text-sm text-slate">{tier}</span>
                <span className="h-4 flex-1 overflow-hidden rounded-[4px] bg-line">
                  <span
                    className="block h-full rounded-[4px] bg-primary"
                    style={{ width: `${Math.round((count / tierMax) * 100)}%` }}
                  />
                </span>
                <span className="w-12 text-right text-sm text-slate">{num(count)}</span>
              </li>
            ))}
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
                <span className="text-sm text-muted">วันที่ {thaiDate(event.event_date)}</span>
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
          <Link to="/admin/rewards" className="flex items-center text-sm text-primary">
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
function Sparkline({ points }) {
  if (points.length < 2) return <p className="py-8 text-center text-sm text-muted">ข้อมูลยังไม่พอวาดกราฟ</p>;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = 100 / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${40 - (p.value / max) * 34}`)
    .join(' ');

  return (
    <svg viewBox="0 0 100 44" className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label="กราฟแนวโน้ม">
      <path d={path} fill="none" stroke="#00ADB0" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={p.label} cx={i * step} cy={40 - (p.value / max) * 34} r="1.2" fill="#00ADB0" />
      ))}
    </svg>
  );
}

function AnalyticsTab() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.adminAnalytics().then(setData);
  }, []);

  if (!data) return <Spinner />;

  const rate = data.registrations ? ((data.attended / data.registrations) * 100).toFixed(2) : '0.00';
  const monthly = data.monthly.map((m) => ({ label: m.month, value: m.earned }));
  const maxBar = Math.max(...data.monthly.map((m) => Math.max(m.earned, m.spent)), 1);

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-3 border-l-4 border-primary pl-2 font-bold text-ink">1. การวิเคราะห์กิจกรรม</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Icon.Users} label="ลงทะเบียน" value={num(data.registrations)} />
          <StatCard icon={Icon.Check} label="เข้าร่วมจริง" value={num(data.attended)} />
          <StatCard icon={Icon.Clock} label="อัตราการเข้าร่วมกิจกรรม" value={`${rate} %`} />
          <StatCard
            icon={Icon.Warning}
            label="ไม่มาตามนัด"
            value={num(data.registrations - data.attended)}
            tone="gold"
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate">แนวโน้มคะแนนที่แจกรายเดือน</h3>
            <Sparkline points={monthly} />
            <div className="flex justify-between text-2xs text-muted">
              {data.monthly.map((m) => (
                <span key={m.month}>{m.month.slice(5)}</span>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate">กิจกรรมที่ได้รับความสนใจสูงสุด</h3>
            <ul className="mt-3 space-y-3">
              {data.topEvents.map((event, index) => {
                const capacity = event.capacity || Math.max(event.joined, 1);
                return (
                  <li key={event.title}>
                    <p className="mb-1 flex items-center gap-2 text-sm">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-gold-wash text-2xs font-bold text-gold-ink">
                        {index + 1}
                      </span>
                      <span className="flex-1 truncate text-slate">{event.title}</span>
                      <span className="text-2xs text-muted">{num(event.joined)} คน</span>
                    </p>
                    <ProgressBar value={event.joined} max={capacity} tone="primary" />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 border-l-4 border-primary pl-2 font-bold text-ink">2. การวิเคราะห์คะแนน</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate">การเคลื่อนไหวของคะแนน</h3>
            <div className="mt-4 flex h-40 items-end gap-3">
              {data.monthly.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-32 w-full items-end justify-center gap-1">
                    <span
                      className="w-3 rounded-t bg-primary"
                      style={{ height: `${(m.earned / maxBar) * 100}%` }}
                      title={`แจก ${num(m.earned)}`}
                    />
                    <span
                      className="w-3 rounded-t bg-[#2D4FA0]"
                      style={{ height: `${(m.spent / maxBar) * 100}%` }}
                      title={`ใช้ ${num(m.spent)}`}
                    />
                  </div>
                  <span className="text-2xs text-muted">{m.month.slice(5)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex gap-4 text-2xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> คะแนนที่แจก
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#2D4FA0]" /> คะแนนที่ใช้
              </span>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard icon={Icon.Wallet} label="คะแนนที่แจก" value={num(data.pointsOut)} />
            <StatCard icon={Icon.Bag} label="คะแนนที่ใช้" value={num(data.pointsIn)} />
            <StatCard icon={Icon.Hourglass} label="คะแนนคงเหลือสะสม" value={num(data.pointsOut - data.pointsIn)} tone="gold" />
            <StatCard icon={Icon.Gift} label="ของรางวัลที่ถูกแลก" value={num(data.topRewards.reduce((a, r) => a + r.redeemed, 0))} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 border-l-4 border-primary pl-2 font-bold text-ink">3. การวิเคราะห์ของรางวัล</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate">สัดส่วนการแลกรางวัล</h3>
            <ul className="mt-3 space-y-2">
              {data.rewardSplit.length === 0 && <li className="text-sm text-muted">ยังไม่มีการแลกของรางวัล</li>}
              {data.rewardSplit.map((row, i) => {
                const total = data.rewardSplit.reduce((a, r) => a + r.n, 0) || 1;
                const colors = ['#9B72CF', '#2D4FA0', '#A2C4CF', '#00ADB0', '#FFA101'];
                return (
                  <li key={row.category} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-full" style={{ background: colors[i % colors.length] }} />
                    <span className="flex-1 text-slate">{row.category}</span>
                    <span className="text-muted">
                      {((row.n / total) * 100).toFixed(2)}% ({row.n} ครั้ง)
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="card overflow-hidden">
            <h3 className="p-4 text-sm font-semibold text-slate">ของรางวัลยอดนิยม</h3>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">ลำดับ</th>
                  <th className="th">ของรางวัล</th>
                  <th className="th">จำนวนที่แลก</th>
                  <th className="th">คะแนนที่ใช้</th>
                </tr>
              </thead>
              <tbody>
                {data.topRewards.map((row, index) => (
                  <tr key={row.name}>
                    <td className="td">{index + 1}</td>
                    <td className="td">{row.name}</td>
                    <td className="td">{num(row.redeemed)}</td>
                    <td className="td">{num(row.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
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
