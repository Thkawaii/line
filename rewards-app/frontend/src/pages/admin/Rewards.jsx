import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Select } from '../../components/ComboBox';
import SpecialPoints, { SpecialPointIcon } from '../../components/SpecialPoints';
import {
  Badge,
  ImagePlaceholder,
  Modal,
  Notice,
  Pagination,
  SearchInput,
  Spinner,
  useToast,
} from '../../components/ui';
import ImageCropper from '../../components/ImageCropper';
import TranslatedFields from '../../components/TranslatedFields';
import { Icon } from '../../components/icons';
import { dateTime, num, thaiDate } from '../../lib/format';

// ช่องที่แปลได้ ใช้ทั้งในฟอร์มและตอนส่งขึ้น API
const TEXT_FIELDS = [
  { name: 'name', label: 'ชื่อของรางวัล', required: true, full: true },
  { name: 'category', label: 'หมวดหมู่' },
  { name: 'description', label: 'รายละเอียด', type: 'textarea', rows: 3 },
  { name: 'howTo', label: 'วิธีการรับรางวัล', type: 'textarea', rows: 3 },
  { name: 'conditions', label: 'เงื่อนไขการแลกรางวัล', type: 'textarea', rows: 3 },
];

const EMPTY = {
  name: '',
  imageUrl: '',
  minTier: 'Member',
  startsAt: '',
  endsAt: '',
  category: 'ทั่วไป',
  pointKind: 'point',
  points: '',
  oldPoints: '',
  stock: '',
  description: '',
  howTo: '',
  conditions: '',
  status: 'active',
};

function RewardForm({ open, editing, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      editing
        ? {
            name: editing.name,
            imageUrl: editing.image_url || '',
            category: editing.category,
            pointKind: editing.point_kind || 'point',
            points: editing.points,
            oldPoints: editing.old_points || '',
            stock: editing.stock,
            description: editing.description,
            howTo: editing.how_to,
            conditions: editing.conditions,
            status: editing.status,
            minTier: editing.min_tier || 'Member',
            startsAt: editing.starts_at ? editing.starts_at.slice(0, 10) : '',
            endsAt: editing.ends_at ? editing.ends_at.slice(0, 10) : '',
          }
        : EMPTY
    );
  }, [open, editing]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      // ส่งค่าว่างไปด้วยเพื่อให้ล้างช่วงเวลาได้ ไม่ใช่แค่ตั้งใหม่
      startsAt: form.startsAt || '',
      endsAt: form.endsAt || '',
      points: Number(form.points),
      stock: Number(form.stock || 0),
      oldPoints: form.oldPoints ? Number(form.oldPoints) : null,
    };
    try {
      if (editing) await api.adminUpdateReward(editing.id, payload);
      else await api.adminCreateReward(payload);
      toast(editing ? 'บันทึกของรางวัลแล้ว' : 'เพิ่มของรางวัลแล้ว', 'primary');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <form onSubmit={submit} className="p-6">
        <h2 className="text-xl font-bold text-ink">{editing ? 'แก้ไขของรางวัล' : 'เพิ่มของรางวัล'}</h2>
        {error && (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        )}

        <div className="mt-4 sm:col-span-2">
          <TranslatedFields
            fields={TEXT_FIELDS}
            value={form}
            onChange={setForm}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="stock">
              จำนวนคงเหลือ
            </label>
            <input id="stock" type="number" min="0" className="field" value={form.stock} onChange={set('stock')} />
          </div>
          <div>
            <label className="label" htmlFor="pointKind">
              แลกด้วยคะแนนแบบไหน
            </label>
            {/* ของรางวัลชิ้นหนึ่งแลกด้วยกระเป๋าเดียว ไม่ผสมสองกระเป๋า
                เพราะถ้าผสมแล้วพนักงานจะเดาไม่ออกว่าตัวเองจ่ายอะไรไปเท่าไหร่ */}
            <Select
              id="pointKind"
              options={[
                { value: 'point', label: 'คะแนนปกติ' },
                { value: 'special', label: 'คะแนนพิเศษ' },
              ]}
              value={form.pointKind}
              onChange={(value) => setForm({ ...form, pointKind: value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="points">
              <span className="inline-flex items-center gap-1.5">
                {form.pointKind === 'special' && <SpecialPointIcon size={18} />}
                {form.pointKind === 'special' ? 'คะแนนพิเศษที่ใช้แลก *' : 'คะแนนที่ใช้แลก *'}
              </span>
            </label>
            <input id="points" type="number" min="1" className="field" value={form.points} onChange={set('points')} required />
          </div>
          <div>
            <label className="label" htmlFor="oldPoints">
              คะแนนเดิม (แสดงขีดฆ่า)
            </label>
            <input id="oldPoints" type="number" min="0" className="field" value={form.oldPoints} onChange={set('oldPoints')} />
          </div>
          <div>
            <label className="label" htmlFor="minTier">
              ระดับขั้นต่ำที่แลกได้
            </label>
            <Select
              id="minTier"
              options={[
                { value: 'Member', label: 'Member — ทุกคนแลกได้' },
                { value: 'Silver', label: 'Silver ขึ้นไป' },
                { value: 'Elite', label: 'Elite เท่านั้น' },
              ]}
              value={form.minTier}
              onChange={(value) => setForm({ ...form, minTier: value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="status">
              สถานะ
            </label>
            <Select
              id="status"
              options={[
                { value: 'active', label: 'แสดงในแอป' },
                { value: 'hidden', label: 'ซ่อน' },
              ]}
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value })}
            />
          </div>

          <div className="sm:col-span-2">
            {/* สัดส่วน 4:3 ให้ตรงกับกรอบรูปในการ์ดของรางวัลฝั่งพนักงาน */}
            <ImageCropper
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
              aspect={4 / 3}
              outputWidth={800}
              label="รูปของรางวัล"
            />
          </div>
          <div className="sm:col-span-2">
            <p className="label">ช่วงเวลาที่แลกได้</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-2xs text-muted" htmlFor="startsAt">
                  เริ่ม
                </label>
                <input id="startsAt" type="date" className="field" value={form.startsAt} onChange={set('startsAt')} />
              </div>
              <div>
                <label className="mb-1 block text-2xs text-muted" htmlFor="endsAt">
                  สิ้นสุด
                </label>
                <input id="endsAt" type="date" className="field" value={form.endsAt} onChange={set('endsAt')} />
              </div>
            </div>
            <p className="mt-1.5 text-2xs text-muted">
              เว้นว่างทั้งคู่ = แลกได้ตลอด · ถ้าตั้งวันสิ้นสุด ระบบจะซ่อนของรางวัลจากหน้าพนักงานเองเมื่อพ้นกำหนด
            </p>
          </div>
        </div>

        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            ยกเลิก
          </button>
          <button type="submit" className="btn-primary">
            บันทึก
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminRewards() {
  const toast = useToast();

  // เก็บแท็บไว้ใน URL เพื่อให้ลิงก์จากหน้าอื่นเปิดแท็บที่ต้องการได้เลย
  // เช่น "รายการรอรับของ" ในหน้าภาพรวม ต้องพาไปที่แท็บรายการแลก ไม่ใช่แคตตาล็อก
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'redemptions' ? 'redemptions' : 'catalog';
  const setTab = (value) => setParams(value === 'catalog' ? {} : { tab: value }, { replace: true });
  const [rewards, setRewards] = useState(null);
  const [redemptions, setRedemptions] = useState(null);
  const [status, setStatus] = useState('pending');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  /*
    ตัวกรองของแท็บรายการแลก

    แยก page ออกจากตัวกรองอื่น เพราะทุกครั้งที่เปลี่ยนตัวกรองต้องเด้งกลับหน้าแรก
    ไม่งั้นผู้ดูแลที่อยู่หน้า 5 แล้วกรองจนเหลือ 3 รายการ จะเห็นตารางว่าง
  */
  const [filters, setFilters] = useState({ q: '', department: 'all', branch: 'all', date: 'all' });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);

  const setFilter = (key) => (value) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const loadRewards = useCallback(() => api.adminRewards().then(({ rewards }) => setRewards(rewards)), []);
  const loadRedemptions = useCallback(
    () => api.adminRedemptions({ ...filters, status, page, limit: 10 }).then(setRedemptions),
    [filters, status, page]
  );

  useEffect(() => {
    loadRewards();
  }, [loadRewards]);

  useEffect(() => {
    setRedemptions(null);
    // หน่วงตอนพิมพ์ค้นหา จะได้ไม่ยิงคำขอทุกตัวอักษร
    const timer = setTimeout(loadRedemptions, filters.q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadRedemptions, filters.q]);

  async function markReceived(id) {
    try {
      await api.adminReceiveRedemption(id);
      toast('ยืนยันการรับของแล้ว', 'primary');
      setDetail(null);
      loadRedemptions();
    } catch (err) {
      toast(err.message);
    }
  }

  // สแกนผิดคนแล้วกดคืนได้ ตอนยืนยันรับของเกิดขึ้นเร็วมากตรงหน้าเคาน์เตอร์
  async function revert(id) {
    try {
      await api.adminRevertRedemption(id);
      toast('คืนสถานะเป็นรอรับของแล้ว', 'primary');
      setDetail(null);
      loadRedemptions();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <AdminShell
      title="จัดการของรางวัล"
      actions={
        tab === 'catalog' && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="btn-primary btn-sm"
          >
            <Icon.Plus size={16} /> เพิ่มของรางวัล
          </button>
        )
      }
    >
      <div className="mb-5 flex gap-6 border-b border-line">
        {[
          { value: 'catalog', label: 'แคตตาล็อก' },
          { value: 'redemptions', label: 'รายการแลก' },
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

      {tab === 'catalog' ? (
        <section className="card overflow-hidden">
          {!rewards ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">ลำดับ</th>
                    <th className="th w-20">รูป</th>
                    <th className="th">ของรางวัล</th>
                    <th className="th">หมวดหมู่</th>
                    <th className="th">คะแนน</th>
                    <th className="th">คงเหลือ</th>
                    <th className="th">แลกไปแล้ว</th>
                    <th className="th">สถานะ</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {rewards.map((reward, index) => (
                    <tr key={reward.id}>
                      <td className="td">{index + 1}</td>
                      <td className="td">
                        <ImagePlaceholder
                          src={reward.image_url}
                          className="h-10 w-14 rounded-[6px] border border-line"
                        />
                      </td>
                      <td className="td max-w-xs truncate">{reward.name}</td>
                      <td className="td">{reward.category}</td>
                      <td className="td">
                        {reward.point_kind === 'special' ? (
                          <SpecialPoints value={reward.points} size="sm" />
                        ) : (
                          num(reward.points)
                        )}
                      </td>
                      <td className="td">
                        <Badge
                          className={
                            reward.stock === 0
                              ? 'bg-danger-wash text-danger'
                              : reward.stock <= 5
                                ? 'bg-gold-wash text-gold-ink'
                                : 'bg-success-wash text-success'
                          }
                        >
                          {reward.stock}
                        </Badge>
                      </td>
                      <td className="td">{num(reward.redeemed)}</td>
                      <td className="td">{reward.status === 'active' ? 'แสดงในแอป' : 'ซ่อน'}</td>
                      <td className="td">
                        <button
                          onClick={() => {
                            setEditing(reward);
                            setFormOpen(true);
                          }}
                          className="text-primary"
                        >
                          แก้ไข
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <Redemptions
          data={redemptions}
          filters={filters}
          setFilter={setFilter}
          status={status}
          onStatus={(value) => {
            setPage(1);
            setStatus(value);
          }}
          page={page}
          onPage={setPage}
          onOpen={setDetail}
        />
      )}

      <RedemptionDetail
        row={detail}
        onClose={() => setDetail(null)}
        onReceive={markReceived}
        onRevert={revert}
      />

      <RewardForm open={formOpen} editing={editing} onClose={() => setFormOpen(false)} onSaved={loadRewards} />
    </AdminShell>
  );
}

/* ---------- แท็บรายการแลกของ ---------- */

const STATUS_STYLE = {
  pending: { label: 'รอรับ', className: 'bg-gold-wash text-gold-ink' },
  received: { label: 'รับแล้ว', className: 'bg-success-wash text-success' },
  cancelled: { label: 'ยกเลิก', className: 'bg-danger-wash text-danger' },
};

const DATE_OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'today', label: 'วันนี้' },
  { value: 'week', label: '7 วันล่าสุด' },
  { value: 'month', label: 'เดือนนี้' },
];

function Redemptions({ data, filters, setFilter, status, onStatus, page, onPage, onOpen }) {
  const counts = data?.counts || {};

  /*
    ชิปสถานะโชว์จำนวนของทุกอันพร้อมกัน ไม่ใช่เฉพาะอันที่เลือกอยู่

    ผู้ดูแลเปิดหน้านี้มาเพื่อดูว่ามีของค้างส่งกี่ชิ้น ถ้าต้องกดไล่ทีละชิป
    ถึงจะเห็นตัวเลข ก็เท่ากับต้องถามคำถามเดิมสี่รอบ

    ตัวเลขนับตามตัวกรองอื่นที่เปิดอยู่ (ค้นหา แผนก สาขา วันที่)
    เลขบนชิปจึงหมายถึง "ในขอบเขตที่กรองอยู่ตอนนี้ มีสถานะละกี่รายการ"
  */
  const chips = [
    { value: 'pending', label: 'รอรับ', count: counts.pending },
    { value: 'received', label: 'รับแล้ว', count: counts.received },
    { value: 'cancelled', label: 'ยกเลิก', count: counts.cancelled },
    { value: 'all', label: 'ทั้งหมด', count: counts.all },
  ];

  return (
    <section className="card overflow-hidden">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[260px] flex-1">
            <SearchInput
              value={filters.q}
              onChange={setFilter('q')}
              placeholder="กรอกรหัสอ้างอิง หรือรหัสพนักงาน"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate">
          <label className="flex items-center gap-2">
            แผนก
            <div className="w-36">
              <Select
                options={[
                  { value: 'all', label: 'ทั้งหมด' },
                  ...(data?.departments || []).map((name) => ({ value: name, label: name })),
                ]}
                value={filters.department}
                onChange={setFilter('department')}
              />
            </div>
          </label>

          <label className="flex items-center gap-2">
            สาขา
            <div className="w-32">
              <Select
                options={[
                  { value: 'all', label: 'ทั้งหมด' },
                  ...(data?.branches || []).map((name) => ({ value: name, label: name })),
                ]}
                value={filters.branch}
                onChange={setFilter('branch')}
              />
            </div>
          </label>

          <label className="flex items-center gap-2">
            วันที่แลก
            <div className="w-36">
              <Select options={DATE_OPTIONS} value={filters.date} onChange={setFilter('date')} />
            </div>
          </label>

          {/* ปุ่มรีเซ็ตโผล่เฉพาะตอนมีอะไรให้รีเซ็ตจริง
              ปุ่มที่กดแล้วไม่เกิดอะไรขึ้นสอนให้คนเลิกเชื่อปุ่ม */}
          {(filters.q || filters.department !== 'all' || filters.branch !== 'all' || filters.date !== 'all') && (
            <button
              onClick={() => {
                setFilter('q')('');
                setFilter('department')('all');
                setFilter('branch')('all');
                setFilter('date')('all');
              }}
              className="ml-auto flex items-center gap-1.5 text-primary"
            >
              <Icon.Refresh size={16} /> รีเซ็ต
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => onStatus(chip.value)}
              className={`chip ${status === chip.value ? 'chip-on' : ''}`}
            >
              {chip.label}
              {chip.count != null && ` (${num(chip.count)})`}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">วันที่แลก</th>
                  <th className="th">รหัสอ้างอิง</th>
                  <th className="th">พนักงาน</th>
                  <th className="th">แผนก</th>
                  <th className="th">สาขา</th>
                  <th className="th">ของรางวัล</th>
                  <th className="th">สถานะ</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {data.redemptions.map((row) => {
                  const style = STATUS_STYLE[row.status] || STATUS_STYLE.pending;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onOpen(row)}
                      className="cursor-pointer hover:bg-page"
                    >
                      <td className="td whitespace-nowrap">{thaiDate(row.redeemed_at)}</td>
                      <td className="td whitespace-nowrap font-medium tabular-nums">{row.ref_code}</td>
                      <td className="td">
                        {row.display_name}
                        <span className="ml-1.5 text-2xs text-muted">{row.employee_code}</span>
                      </td>
                      <td className="td">{row.department || '-'}</td>
                      <td className="td">{row.branch || '-'}</td>
                      <td className="td max-w-xs truncate">{row.reward_name}</td>
                      <td className="td">
                        <Badge className={style.className}>{style.label}</Badge>
                      </td>
                      <td className="td text-muted">
                        <Icon.Next size={18} />
                      </td>
                    </tr>
                  );
                })}
                {data.redemptions.length === 0 && (
                  <tr>
                    <td className="td text-center text-muted" colSpan={8}>
                      ไม่พบรายการแลกของตามเงื่อนไขนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-line">
            <Pagination page={page} total={data.total} limit={data.limit} onChange={onPage} />
          </div>
        </>
      )}
    </section>
  );
}

/*
หน้าต่างรายละเอียดของรายการแลกหนึ่งใบ

เปิดจากการกดที่แถว เพราะตารางกว้างอยู่แล้ว ยัดทุกอย่างลงไปในแถวจะอ่านไม่ออก
ตรงนี้คือที่ที่ผู้ดูแลยืนยันการรับของ จึงโชว์รหัสอ้างอิงตัวใหญ่ไว้เทียบกับที่พนักงานยื่นมา
*/
function RedemptionDetail({ row, onClose, onReceive, onRevert }) {
  const style = STATUS_STYLE[row?.status] || STATUS_STYLE.pending;

  return (
    <Modal open={!!row} onClose={onClose} size="sm">
      {row && (
        <div className="p-6">
          <div className="flex items-start gap-3">
            <ImagePlaceholder src={row.image_url} className="h-20 w-20 shrink-0 rounded-[8px]" />
            <div className="min-w-0 flex-1">
              <Badge className={style.className}>{style.label}</Badge>
              <h2 className="mt-1.5 font-bold leading-snug text-ink">{row.reward_name}</h2>
              <p className="mt-1 text-2xs text-muted">
                ใช้ไป {num(row.points_used)}{' '}
                {row.point_kind === 'special' ? 'คะแนนพิเศษ' : 'คะแนน'}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-card bg-page px-3 py-2.5">
            <p className="text-2xs text-muted">รหัสอ้างอิง</p>
            <p className="text-lg font-bold tabular-nums text-ink">{row.ref_code}</p>
          </div>

          <dl className="mt-4 space-y-1.5 text-sm">
            {[
              ['พนักงาน', `${row.display_name} (${row.employee_code})`],
              ['ตำแหน่ง', row.position || '-'],
              ['แผนก / สาขา', `${row.department || '-'} · ${row.branch || '-'}`],
              ['วันที่แลก', dateTime(row.redeemed_at)],
              ['วันที่รับของ', row.received_at ? dateTime(row.received_at) : 'ยังไม่ได้รับ'],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <dt className="w-28 shrink-0 text-muted">{label}</dt>
                <dd className="flex-1 text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className="btn-ghost flex-1">
              ปิด
            </button>
            {row.status === 'pending' && (
              <button onClick={() => onReceive(row.id)} className="btn-primary flex-1">
                ยืนยันรับของ
              </button>
            )}
            {row.status === 'received' && (
              <button onClick={() => onRevert(row.id)} className="btn-ghost flex-1">
                คืนเป็นรอรับของ
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
