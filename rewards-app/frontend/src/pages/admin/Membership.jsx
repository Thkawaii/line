import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Modal, Notice, SearchInput, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import TranslatedFields from '../../components/TranslatedFields';
import { num } from '../../lib/format';
import { tierIcon } from '../../lib/tier';

/* ธีมของการ์ดแต่ละระดับ ตามที่ดีไซน์กำหนดไว้สามแบบ */
const THEME = {
  slate: {
    card: 'bg-white border border-line',
    inner: 'border border-dashed border-[#C9D2D2] bg-white',
    name: 'text-ink',
    subtitle: 'text-muted',
    body: 'text-muted',
    iconBox: 'bg-[#9AA3A3] text-white',
    box: 'border border-line bg-white',
    boxLabel: 'text-muted',
    boxValue: 'text-ink',
    heading: 'text-ink',
    check: 'text-primary',
    badge: 'bg-white text-success border border-line',
    button: 'border border-line bg-white text-slate hover:bg-primary-wash',
  },
  sky: {
    card: 'bg-primary border border-primary',
    inner: 'bg-primary',
    name: 'text-white',
    subtitle: 'text-white/80',
    body: 'text-white/90',
    iconBox: 'bg-white/25 text-white',
    box: 'border border-white/40 bg-white/10',
    boxLabel: 'text-white/80',
    boxValue: 'text-white',
    heading: 'text-white',
    check: 'text-white',
    badge: 'bg-white text-success',
    button: 'bg-white text-primary-dark hover:bg-white/90',
  },
  gold: {
    card: 'bg-[#15232B] border border-[#15232B]',
    inner: 'bg-[#15232B]',
    name: 'text-white',
    subtitle: 'text-white/70',
    body: 'text-white/80',
    iconBox: 'bg-[#22343F] text-gold',
    box: 'border border-white/20 bg-white/5',
    boxLabel: 'text-white/70',
    boxValue: 'text-white',
    heading: 'text-white',
    check: 'text-gold',
    badge: 'bg-white text-success',
    button: 'border border-gold bg-transparent text-gold hover:bg-gold/10',
  },
};

// ช่องข้อความที่กรอกคำแปลได้ ส่วนรหัสระดับกับตัวเลขไม่ต้องแปล
const TEXT_FIELDS = [
  { name: 'name', label: 'ชื่อที่แสดง', required: true },
  { name: 'subtitle', label: 'คำกำกับ', placeholder: 'เช่น (ระดับเริ่มต้น)' },
  { name: 'description', label: 'คำอธิบาย', type: 'textarea', rows: 2 },
  { name: 'benefits', label: 'สิทธิประโยชน์ (บรรทัดละข้อ)', type: 'textarea', rows: 4 },
];

const EMPTY = {
  key: '',
  name: '',
  subtitle: '',
  description: '',
  minPoints: 0,
  multiplier: 1,
  benefits: '',
  color: 'slate',
  status: 'active',
};

function StatCard({ icon: Ico, label, value }) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-slate">
        <span className="text-primary">
          <Ico size={20} />
        </span>
        {label}
      </p>
      <p className="mt-2 text-center text-[34px] font-bold leading-none text-ink">{value}</p>
    </div>
  );
}

function TierCard({ tier, onEdit }) {
  const theme = THEME[tier.color] || THEME.slate;
  const TierIcon = tierIcon(tier.color);
  const benefits = (tier.benefits || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const active = tier.status === 'active';

  return (
    <article className={`rounded-card p-4 shadow-card ${theme.card}`}>
      <div className={`rounded-card p-4 ${theme.inner}`}>
        <div className="flex items-start justify-between gap-3">
          <span className={`grid h-12 w-12 place-items-center rounded-full ${theme.iconBox}`}>
            <TierIcon size={30} />
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-2xs font-semibold ${theme.badge}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success' : 'bg-muted'}`} />
            {active ? 'Active' : 'Inactive'}
          </span>
        </div>

        <h3 className={`mt-3 text-2xl font-bold ${theme.name}`}>
          {tier.name}
          {tier.subtitle && (
            <span className={`ml-2 align-middle text-sm font-medium ${theme.subtitle}`}>{tier.subtitle}</span>
          )}
        </h3>

        {tier.description && (
          <p className={`mt-2 text-sm leading-relaxed ${theme.body}`}>{tier.description}</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className={`rounded-[10px] px-3 py-2 ${theme.box}`}>
            <p className={`flex items-center gap-1.5 text-2xs ${theme.boxLabel}`}>
              <Icon.Users size={14} /> จำนวนสมาชิก
            </p>
            <p className={`mt-1 text-center text-lg font-bold ${theme.boxValue}`}>{num(tier.member_count)}</p>
          </div>

          <div className={`rounded-[10px] px-3 py-2 ${theme.box}`}>
            <p className={`flex items-center gap-1.5 text-2xs ${theme.boxLabel}`}>
              <Icon.Star size={14} /> ตัวคูณคะแนน
            </p>
            <p className={`mt-1 text-center text-lg font-bold ${theme.boxValue}`}>
              X {Number(tier.multiplier).toFixed(1)}
            </p>
          </div>
        </div>

        <h4 className={`mt-4 font-semibold ${theme.heading}`}>สิทธิประโยชน์หลัก</h4>
        <ul className={`mt-2 space-y-1.5 text-sm ${theme.body}`}>
          {benefits.map((benefit) => (
            <li key={benefit} className="flex gap-2">
              <span className={`mt-0.5 shrink-0 ${theme.check}`}>
                <Icon.CheckCircle size={16} />
              </span>
              <span>{benefit}</span>
            </li>
          ))}
          {benefits.length === 0 && <li className={theme.subtitle}>ยังไม่ได้ระบุสิทธิประโยชน์</li>}
        </ul>

        <button onClick={onEdit} className={`btn mt-5 h-10 w-full text-sm ${theme.button}`}>
          ดูรายละเอียด <Icon.Next size={16} />
        </button>
      </div>
    </article>
  );
}

export default function Membership() {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.adminTiers(filters).then(setData);
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(load, filters.q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.q]);

  function start(tier) {
    setEditing(tier);
    setError('');
    setForm(
      tier
        ? {
            key: tier.key,
            name: tier.name,
            subtitle: tier.subtitle || '',
            description: tier.description || '',
            minPoints: tier.min_points,
            multiplier: Number(tier.multiplier),
            benefits: tier.benefits || '',
            color: tier.color,
            status: tier.status,
          }
        : EMPTY
    );
    setOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    const payload = {
      ...form,
      minPoints: Number(form.minPoints),
      multiplier: Number(form.multiplier),
    };
    try {
      if (editing) await api.adminUpdateTier(editing.key, payload);
      else await api.adminCreateTier(payload);
      toast(editing ? 'บันทึกระดับสมาชิกแล้ว' : 'สร้างระดับสมาชิกแล้ว', 'primary');
      setOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove() {
    if (!window.confirm(`ลบระดับ ${editing.name} ใช่ไหม`)) return;
    try {
      await api.adminDeleteTier(editing.key);
      toast('ลบระดับสมาชิกแล้ว');
      setOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function recalculate() {
    const { updated } = await api.adminRecalculateTiers();
    toast(`คำนวณระดับสมาชิกใหม่แล้ว ${num(updated)} บัญชี`, 'primary');
    load();
  }

  return (
    <AdminShell
      title="ตั้งค่าระบบ"
      breadcrumb="Membership"
      actions={
        <button onClick={recalculate} className="btn-ghost btn-sm">
          <Icon.Refresh size={16} /> คำนวณระดับใหม่ทั้งระบบ
        </button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="border-l-4 border-primary pl-2 text-xl font-bold text-ink">Membership</h2>
        <button onClick={() => start(null)} className="btn-primary btn-sm">
          <Icon.Plus size={16} /> สร้างระดับสมาชิก
        </button>
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard icon={Icon.Box} label="ระดับสมาชิกทั้งหมด" value={num(data.totalTiers)} />
            <StatCard icon={Icon.Check} label="ระดับที่ใช้งานอยู่" value={num(data.activeTiers)} />
            <StatCard icon={Icon.Users} label="จำนวนสมาชิกทั้งหมด" value={num(data.totalMembers)} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] flex-1">
              <SearchInput
                value={filters.q}
                onChange={(v) => setFilters((f) => ({ ...f, q: v }))}
                placeholder="ค้นหาระดับสมาชิก"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate">
              สถานะ
              <select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className="field h-10 w-36 py-0"
              >
                <option value="">ทั้งหมด</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <button
              onClick={() => setFilters({ q: '', status: '' })}
              className="flex items-center gap-1.5 text-primary"
            >
              <Icon.Refresh size={16} /> รีเซ็ต
            </button>
          </div>

          {data.tiers.length === 0 ? (
            <p className="card mt-4 px-4 py-12 text-center text-muted">ไม่พบระดับสมาชิกที่ตรงกับเงื่อนไข</p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {data.tiers.map((tier) => (
                <TierCard key={tier.key} tier={tier} onEdit={() => start(tier)} />
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} size="lg">
        <form onSubmit={save} className="p-6">
          <h2 className="text-xl font-bold text-ink">
            {editing ? `แก้ไขระดับ ${editing.name}` : 'สร้างระดับสมาชิก'}
          </h2>

          {error && (
            <div className="mt-3">
              <Notice>{error}</Notice>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="tierKey">
                รหัสระดับ *
              </label>
              <input
                id="tierKey"
                className="field"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                required
                disabled={!!editing}
                placeholder="เช่น Platinum"
              />
            </div>
            <div>
              <label className="label" htmlFor="tierPoints">
                เกณฑ์คะแนนขั้นต่ำ
              </label>
              <input
                id="tierPoints"
                type="number"
                min="0"
                className="field"
                value={form.minPoints}
                onChange={(e) => setForm({ ...form, minPoints: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="tierMultiplier">
                ตัวคูณคะแนน
              </label>
              <input
                id="tierMultiplier"
                type="number"
                step="0.1"
                min="0.1"
                className="field"
                value={form.multiplier}
                onChange={(e) => setForm({ ...form, multiplier: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="tierColor">
                ธีมการ์ด
              </label>
              <select
                id="tierColor"
                className="field"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              >
                <option value="slate">พื้นขาว (ระดับเริ่มต้น)</option>
                <option value="sky">พื้นเทอร์ควอยซ์</option>
                <option value="gold">พื้นเข้ม ขอบทอง</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="tierStatus">
                สถานะ
              </label>
              <select
                id="tierStatus"
                className="field"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <TranslatedFields
                fields={TEXT_FIELDS}
                value={form}
                onChange={setForm}
              />
            </div>
          </div>

          <div className="mt-7 flex items-center justify-between gap-3">
            {editing ? (
              <button type="button" onClick={remove} className="text-sm font-medium text-danger">
                ลบระดับนี้
              </button>
            ) : (
              <span />
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
                ยกเลิก
              </button>
              <button type="submit" className="btn-primary">
                บันทึก
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
