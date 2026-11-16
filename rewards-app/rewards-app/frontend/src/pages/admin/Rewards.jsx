import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Badge, ImagePlaceholder, Modal, Notice, Spinner, useToast } from '../../components/ui';
import ImageCropper from '../../components/ImageCropper';
import TranslatedFields from '../../components/TranslatedFields';
import { Icon } from '../../components/icons';
import { dateTime, num } from '../../lib/format';

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
            <label className="label" htmlFor="points">
              คะแนนที่ใช้แลก *
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
            <select id="minTier" className="field" value={form.minTier} onChange={set('minTier')}>
              <option value="Member">Member — ทุกคนแลกได้</option>
              <option value="Silver">Silver ขึ้นไป</option>
              <option value="Elite">Elite เท่านั้น</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="status">
              สถานะ
            </label>
            <select id="status" className="field" value={form.status} onChange={set('status')}>
              <option value="active">แสดงในแอป</option>
              <option value="hidden">ซ่อน</option>
            </select>
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

  const loadRewards = useCallback(() => api.adminRewards().then(({ rewards }) => setRewards(rewards)), []);
  const loadRedemptions = useCallback(
    () => api.adminRedemptions(status).then(({ redemptions }) => setRedemptions(redemptions)),
    [status]
  );

  useEffect(() => {
    loadRewards();
  }, [loadRewards]);

  useEffect(() => {
    setRedemptions(null);
    loadRedemptions();
  }, [loadRedemptions]);

  async function markReceived(id) {
    try {
      await api.adminReceiveRedemption(id);
      toast('ยืนยันการรับของแล้ว', 'primary');
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
                      <td className="td">{num(reward.points)}</td>
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
        <section className="card overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            {[
              { value: 'pending', label: 'รอรับของ' },
              { value: 'received', label: 'รับแล้ว' },
              { value: 'all', label: 'ทั้งหมด' },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setStatus(item.value)}
                className={`chip ${status === item.value ? 'chip-on' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {!redemptions ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">ลำดับ</th>
                    <th className="th">ชื่อ-สกุล</th>
                    <th className="th">แผนก</th>
                    <th className="th">ของรางวัล</th>
                    <th className="th">แต้มที่ใช้</th>
                    <th className="th">เวลาแลก</th>
                    <th className="th">สถานะ</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((row, index) => (
                    <tr key={row.id}>
                      <td className="td">{index + 1}</td>
                      <td className="td">{row.display_name}</td>
                      <td className="td">{row.department}</td>
                      <td className="td max-w-xs truncate">{row.reward_name}</td>
                      <td className="td">{num(row.points_used)}</td>
                      <td className="td">{dateTime(row.redeemed_at)}</td>
                      <td className="td">
                        <Badge
                          className={
                            row.status === 'received' ? 'bg-success-wash text-success' : 'bg-gold-wash text-gold-ink'
                          }
                        >
                          {row.status === 'received' ? 'รับสินค้าแล้ว' : 'รอรับของ'}
                        </Badge>
                      </td>
                      <td className="td">
                        {row.status === 'pending' && (
                          <button onClick={() => markReceived(row.id)} className="btn-primary btn-sm">
                            ยืนยันรับของ
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {redemptions.length === 0 && (
                    <tr>
                      <td className="td text-center text-muted" colSpan={8}>
                        ไม่มีรายการในสถานะนี้
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <RewardForm open={formOpen} editing={editing} onClose={() => setFormOpen(false)} onSaved={loadRewards} />
    </AdminShell>
  );
}
