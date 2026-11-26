import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Select } from '../../components/ComboBox';
import ImageCropper from '../../components/ImageCropper';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Modal,
  Notice,
  SearchInput,
  Spinner,
  useToast,
} from '../../components/ui';
import { Icon } from '../../components/icons';
import { dateTime, num, thaiDate } from '../../lib/format';
import DateField from '../../components/DateField';

/*
จัดการประชาสัมพันธ์

ใช้ตารางเดียวกับประกาศข่าวสารเดิม แยกด้วย channel = 'pr'
หน้านี้จึงไม่เห็นประกาศบังคับอ่าน และหน้าประกาศข่าวสารก็ไม่เห็นของที่นี่

สองแท็บ: รายการประชาสัมพันธ์ กับ ประวัติการรับคะแนน
*/

const STATUS = {
  published: { label: 'เผยแพร่', className: 'bg-success-wash text-success' },
  draft: { label: 'ฉบับร่าง', className: 'bg-line text-slate' },
  archived: { label: 'เก็บเข้าคลัง', className: 'bg-gold-wash text-gold-ink' },
};

const KIND = {
  text: { label: 'ข้อความ', icon: Icon.Megaphone },
  image: { label: 'รูปภาพ', icon: Icon.Eye },
  video: { label: 'วิดีโอ', icon: Icon.Play },
};

const CATEGORY = { news: 'ข่าวสาร', announce: 'ประกาศ' };

/*
ตัวเลือกสำเร็จรูป บวกตัวเลือก "กำหนดเอง" สำหรับค่าที่ไม่ได้อยู่ในรายการ

ค่า custom ไม่ใช่ตัวเลข จึงไม่ชนกับค่าจริงตัวไหน
เวลาเปิดข่าวเก่าขึ้นมาแก้ ถ้าค่าที่เก็บไว้ไม่ตรงกับตัวเลือกไหนเลย
ช่องจะเด้งไปที่ "กำหนดเอง" พร้อมเติมตัวเลขเดิมให้ ไม่ใช่เงียบ ๆ เปลี่ยนค่าของเขา
*/
const CUSTOM = 'custom';

const READ_CHOICES = [
  { value: '15', label: 'อ่านครบ 15 วินาที' },
  { value: '30', label: 'อ่านครบ 30 วินาที' },
  { value: '60', label: 'อ่านครบ 1 นาที' },
  { value: '120', label: 'อ่านครบ 2 นาที' },
  { value: CUSTOM, label: 'กำหนดเอง' },
];

const WATCH_CHOICES = [
  { value: '30', label: 'ดูอย่างน้อย 30% ของวิดีโอ' },
  { value: '50', label: 'ดูอย่างน้อย 50% ของวิดีโอ' },
  { value: '70', label: 'ดูอย่างน้อย 70% ของวิดีโอ' },
  { value: '90', label: 'ดูอย่างน้อย 90% ของวิดีโอ' },
  { value: '100', label: 'ดูจนจบคลิป' },
  { value: CUSTOM, label: 'กำหนดเอง' },
];

// วินาทีที่เก็บไว้ ตรงกับตัวเลือกสำเร็จรูปตัวไหนไหม ถ้าไม่ตรงถือว่ากำหนดเอง
const readChoiceOf = (seconds) =>
  READ_CHOICES.some((c) => c.value === String(seconds)) ? String(seconds) : CUSTOM;

const watchChoiceOf = (percent) =>
  WATCH_CHOICES.some((c) => c.value === String(percent)) ? String(percent) : CUSTOM;

/*
แยกวินาทีออกเป็นตัวเลข + หน่วย ให้อ่านง่าย

90 วินาทีโชว์เป็นวินาที เพราะ 1.5 นาทีกรอกเป็นจำนวนเต็มนาทีไม่ได้
ส่วน 120 วินาทีโชว์เป็น 2 นาที ซึ่งอ่านง่ายกว่า
*/
function splitSeconds(seconds) {
  const value = Number(seconds) || 0;
  if (value > 0 && value % 60 === 0) return { amount: value / 60, unit: 'minutes' };
  return { amount: value, unit: 'seconds' };
}

const emptyForm = {
  title: '',
  summary: '',
  body: '',
  imageUrl: '',
  kind: 'text',
  category: 'news',
  videoKind: 'upload',
  videoUrl: '',
  videoMinutes: 0,
  videoSecondsPart: 0,
  points: 1,
  readSeconds: 30,
  watchPercent: 90,
  status: 'published',
  startsAt: '',
  endsAt: '',
};

// วันนี้ในรูปแบบที่ช่อง input type=date ใช้ได้
const today = () => new Date().toISOString().slice(0, 10);

/* เงื่อนไขการรับคะแนนเขียนเป็นข้อความสั้น ๆ ใช้ทั้งตารางรายการและตารางประวัติ */
export function ruleText(row) {
  if (row.kind === 'video') return `ดูครบ ${row.watch_percent}%`;
  const s = row.read_seconds || 0;
  return s >= 60 && s % 60 === 0 ? `อ่านครบ ${s / 60} นาที` : `อ่านครบ ${s} วินาที`;
}

export default function AdminPr() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'items';

  return (
    <AdminShell title="จัดการประชาสัมพันธ์">
      <div className="mb-4 flex gap-2">
        {[
          { value: 'items', label: 'รายการประชาสัมพันธ์' },
          { value: 'history', label: 'ประวัติการรับคะแนน' },
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setParams(item.value === 'items' ? {} : { tab: item.value })}
            className={`chip ${tab === item.value ? 'chip-on' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'items' ? <PrItems /> : <PrHistory />}
    </AdminShell>
  );
}

/* ---------- แท็บรายการ ---------- */

function PrItems() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // แถวที่แก้ไข หรือ 'new'
  const [removing, setRemoving] = useState(null);

  const load = useCallback(() => {
    api
      .adminPr()
      .then((res) => setItems(res.items || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  async function remove() {
    try {
      await api.adminDeletePr(removing.id);
      toast('ลบแล้ว');
      setRemoving(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (error) return <Notice>{error}</Notice>;
  if (!items) return <Spinner />;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setEditing('new')} className="btn-primary">
          <Icon.Plus size={18} /> เพิ่มประชาสัมพันธ์
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Icon.Megaphone}
          title="ยังไม่มีเรื่องประชาสัมพันธ์"
          hint="กดเพิ่มประชาสัมพันธ์เพื่อสร้างเรื่องแรก"
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">หัวข้อ</th>
                  <th className="th">ประเภท</th>
                  <th className="th">เงื่อนไขการรับคะแนน</th>
                  <th className="th text-right">คะแนน</th>
                  <th className="th">ช่วงเผยแพร่</th>
                  <th className="th text-right">รับไปแล้ว</th>
                  <th className="th">สถานะ</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const kind = KIND[row.kind] || KIND.text;
                  const status = STATUS[row.status] || STATUS.draft;
                  return (
                    <tr key={row.id} className="hover:bg-page">
                      <td className="td">
                        <p className="font-semibold text-ink">{row.title}</p>
                        <p className="text-2xs text-muted">{CATEGORY[row.category] || '-'}</p>
                      </td>
                      <td className="td whitespace-nowrap">
                        <span className="flex items-center gap-1.5 text-slate">
                          <kind.icon size={15} />
                          {kind.label}
                        </span>
                      </td>
                      <td className="td whitespace-nowrap text-slate">{ruleText(row)}</td>
                      <td className="td whitespace-nowrap text-right font-bold text-primary">
                        {num(row.points)}
                      </td>
                      <td className="td whitespace-nowrap text-2xs text-muted">
                        {row.starts_at ? thaiDate(row.starts_at) : 'ทันที'}
                        {' - '}
                        {row.ends_at ? thaiDate(row.ends_at) : 'ไม่กำหนด'}
                      </td>
                      <td className="td whitespace-nowrap text-right">
                        <span className="font-semibold text-ink">{num(row.awarded_count)}</span>
                        <span className="text-2xs text-muted"> / {num(row.audience)} คน</span>
                      </td>
                      <td className="td">
                        <Badge className={status.className}>{status.label}</Badge>
                      </td>
                      <td className="td">
                        <span className="flex items-center justify-end gap-1.5">
                          <button onClick={() => setEditing(row)} className="btn-ghost btn-sm">
                            แก้ไข
                          </button>
                          <button
                            onClick={() => setRemoving(row)}
                            className="btn-ghost btn-sm text-danger"
                          >
                            ลบ
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <PrForm
          editing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        title="ลบรายการนี้"
        confirmLabel="ลบ"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

/* ---------- ฟอร์มเพิ่ม/แก้ไข ---------- */

function PrForm({ editing, onClose, onSaved }) {
  const toast = useToast();
  const fileRef = useRef(null);

  const [form, setForm] = useState(
    editing
      ? {
          title: editing.title || '',
          summary: editing.summary || '',
          body: editing.body || '',
          imageUrl: editing.image_url || '',
          kind: editing.kind || 'text',
          category: editing.category || 'news',
          videoKind: editing.video_kind || 'upload',
          videoUrl: editing.video_url || '',
          videoMinutes: Math.floor((editing.video_seconds || 0) / 60),
          videoSecondsPart: (editing.video_seconds || 0) % 60,
          points: editing.points ?? 1,
          readSeconds: editing.read_seconds ?? 30,
          watchPercent: editing.watch_percent ?? 90,
          status: editing.status || 'published',
          startsAt: editing.starts_at ? String(editing.starts_at).slice(0, 10) : '',
          endsAt: editing.ends_at ? String(editing.ends_at).slice(0, 10) : '',
        }
      : { ...emptyForm, startsAt: today() }
  );
  const [uploading, setUploading] = useState(0); // 0 = ไม่ได้อัปโหลดอยู่
  const [videoName, setVideoName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /*
    ช่องเลือกเงื่อนไข แยก state ออกจากค่าจริงที่จะบันทึก

    ต้องแยกเพราะ "กำหนดเอง" ไม่ใช่ค่า แต่เป็นสถานะของช่อง
    ถ้าผูกช่องเลือกไว้กับตัวเลขโดยตรง พอผู้ใช้เลือกกำหนดเองแล้วลบตัวเลขในช่องจนว่าง
    ช่องเลือกจะเด้งกลับไปที่ตัวเลือกสำเร็จรูปเองกลางคัน
  */
  const [readChoice, setReadChoice] = useState(() =>
    readChoiceOf(editing ? (editing.read_seconds ?? 30) : emptyForm.readSeconds)
  );
  const [watchChoice, setWatchChoice] = useState(() =>
    watchChoiceOf(editing ? (editing.watch_percent ?? 90) : emptyForm.watchPercent)
  );

  const initialRead = splitSeconds(editing ? (editing.read_seconds ?? 30) : emptyForm.readSeconds);
  const [readAmount, setReadAmount] = useState(initialRead.amount);
  const [readUnit, setReadUnit] = useState(initialRead.unit);

  /*
    ความยาวคลิป กรอกเป็นนาทีกับวินาที แล้วรวมเป็นวินาทีเดียวก่อนส่ง

    ตัวเลขนี้คือตัวหารของเงื่อนไข "ดูครบ N%" ถ้าไม่มี ระบบจะไม่รู้ว่า N% คือกี่วินาที
    คลิปที่อัปโหลดเองอ่านความยาวจากไฟล์ได้เลย แต่คลิป YouTube อ่านไม่ได้
    ผู้ดูแลจึงต้องกรอกเอง โดยดูจากความยาวที่แสดงบนหน้าคลิป
  */
  const clipSeconds =
    Math.max(0, Math.round(Number(form.videoMinutes) || 0)) * 60 +
    Math.max(0, Math.round(Number(form.videoSecondsPart) || 0));

  // เวลาอ่านแบบกำหนดเอง แปลงเป็นวินาทีเสมอ เพราะฐานข้อมูลเก็บหน่วยเดียว
  const customSeconds = Math.max(0, Math.round(Number(readAmount) || 0)) * (readUnit === 'minutes' ? 60 : 1);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pick = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  async function chooseVideo(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setUploading(1);
    try {
      const res = await api.adminUploadVideo(file, setUploading);
      setForm((f) => ({ ...f, videoUrl: res.url }));
      setVideoName(`${res.name} (${(res.size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(0);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const body = {
      title: form.title.trim(),
      summary: form.summary.trim(),
      body: form.body,
      imageUrl: form.imageUrl,
      kind: form.kind,
      category: form.category,
      videoKind: form.videoKind,
      videoUrl: form.kind === 'video' ? form.videoUrl.trim() : '',
      videoSeconds: form.kind === 'video' ? clipSeconds : 0,
      points: Number(form.points) || 0,
      readSeconds: readChoice === CUSTOM ? customSeconds : Number(form.readSeconds) || 0,
      watchPercent: Number(form.watchPercent) || 0,
      status: form.status,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
    };

    try {
      if (editing) await api.adminUpdatePr(editing.id, body);
      else await api.adminCreatePr(body);
      toast(editing ? 'บันทึกแล้ว' : 'เพิ่มแล้ว');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const isVideo = form.kind === 'video';

  return (
    <Modal open onClose={onClose} size="lg">
      <form onSubmit={submit} className="p-6">
        <h2 className="flex items-center gap-2 pr-10 text-lg font-bold text-ink">
          <span className="text-primary">
            <Icon.Plus size={20} />
          </span>
          {editing ? 'แก้ไขประชาสัมพันธ์' : 'เพิ่มประชาสัมพันธ์'}
        </h2>

        <div className="mt-5 space-y-4">
          <div>
            <label className="label" htmlFor="pr-title">
              หัวข้อประชาสัมพันธ์ <span className="text-danger">*</span>
            </label>
            <input
              id="pr-title"
              className="field"
              value={form.title}
              onChange={set('title')}
              required
            />
          </div>

          {/* ประเภทเนื้อหา เลือกเป็นปุ่มไม่ใช่ช่องเลือก เพราะมีสามตัวเลือกและเป็นตัวตัดสินว่าฟอร์มจะโชว์อะไรต่อ */}
          <div>
            <span className="label">
              ประเภทเนื้อหา <span className="text-danger">*</span>
            </span>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(KIND).map(([value, info]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kind: value }))}
                  className={`flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 text-sm font-medium ${
                    form.kind === value
                      ? 'border-primary bg-primary-wash text-primary-dark'
                      : 'border-line bg-white text-slate'
                  }`}
                >
                  <info.icon size={16} />
                  {info.label}
                </button>
              ))}
            </div>
          </div>

          {isVideo ? (
            <VideoPicker
              form={form}
              setForm={setForm}
              fileRef={fileRef}
              uploading={uploading}
              videoName={videoName}
              onChoose={chooseVideo}
              clipSeconds={clipSeconds}
            />
          ) : (
            <ImageCropper
              value={form.imageUrl}
              onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
              aspect={16 / 9}
              outputWidth={1280}
              label={form.kind === 'image' ? 'รูปภาพ' : 'รูปหน้าปก'}
            />
          )}

          <div>
            <label className="label" htmlFor="pr-body">
              เนื้อหา
            </label>
            <textarea
              id="pr-body"
              className="field min-h-32"
              value={form.body}
              onChange={set('body')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label">
                เงื่อนไขการรับคะแนน <span className="text-danger">*</span>
              </span>
              {isVideo ? (
                <>
                  <Select
                    options={WATCH_CHOICES}
                    value={watchChoice}
                    onChange={(v) => {
                      setWatchChoice(v);
                      if (v !== CUSTOM) pick('watchPercent')(Number(v));
                    }}
                  />
                  {watchChoice === CUSTOM && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm text-slate">ดูอย่างน้อย</span>
                      <input
                        type="number"
                        min="10"
                        max="100"
                        className="field w-24"
                        value={form.watchPercent}
                        onChange={set('watchPercent')}
                        aria-label="เปอร์เซ็นต์การรับชมที่กำหนดเอง"
                      />
                      <span className="text-sm text-slate">% ของวิดีโอ</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Select
                    options={READ_CHOICES}
                    value={readChoice}
                    onChange={(v) => {
                      setReadChoice(v);
                      if (v !== CUSTOM) pick('readSeconds')(Number(v));
                    }}
                  />
                  {readChoice === CUSTOM && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm text-slate">อ่านครบ</span>
                      <input
                        type="number"
                        min="0"
                        className="field w-24"
                        value={readAmount}
                        onChange={(e) => setReadAmount(e.target.value)}
                        aria-label="เวลาอ่านที่กำหนดเอง"
                      />
                      <div className="w-28">
                        <Select
                          options={[
                            { value: 'seconds', label: 'วินาที' },
                            { value: 'minutes', label: 'นาที' },
                          ]}
                          value={readUnit}
                          onChange={setReadUnit}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="label" htmlFor="pr-points">
                คะแนนที่ได้รับ <span className="text-danger">*</span>
              </label>
              <input
                id="pr-points"
                type="number"
                min="0"
                className="field"
                value={form.points}
                onChange={set('points')}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label">หมวด</span>
              <Select
                options={[
                  { value: 'news', label: 'ข่าวสาร' },
                  { value: 'announce', label: 'ประกาศ' },
                ]}
                value={form.category}
                onChange={pick('category')}
              />
            </div>
            <div>
              <span className="label">สถานะ</span>
              <Select
                options={[
                  { value: 'published', label: 'เผยแพร่' },
                  { value: 'draft', label: 'ฉบับร่าง' },
                  { value: 'archived', label: 'เก็บเข้าคลัง' },
                ]}
                value={form.status}
                onChange={pick('status')}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pr-start">
                วันที่เผยแพร่
              </label>
              <DateField
                id="pr-start"
                                className="field"
                value={form.startsAt}
                onChange={set('startsAt')}
              />
            </div>
            <div>
              <label className="label" htmlFor="pr-end">
                วันสิ้นสุด
              </label>
              <DateField
                id="pr-end"
                                className="field"
                value={form.endsAt}
                onChange={set('endsAt')}
              />
              <p className="mt-1.5 text-2xs text-muted">เว้นว่างได้ ถ้าไม่มีกำหนดสิ้นสุด</p>
            </div>
          </div>

          {error && <Notice>{error}</Notice>}
        </div>

        {/* ปุ่มกว้างเท่ากันทั้งคู่ บันทึกอยู่ซ้าย ยกเลิกอยู่ขวา */}
        <div className="mt-6 flex gap-2">
          <button type="submit" disabled={busy || uploading > 0} className="btn-primary flex-1">
            บันทึกข้อมูล
          </button>
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            ยกเลิก
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* เลือกวิดีโอ อัปโหลดไฟล์เองหรือใส่ลิงก์ YouTube */
function VideoPicker({ form, setForm, fileRef, uploading, videoName, onChoose, clipSeconds }) {
  return (
    <div>
      <span className="label">
        วิดีโอ <span className="text-danger">*</span>
      </span>

      <div className="mb-3 flex gap-4">
        {[
          { value: 'upload', label: 'อัปโหลดไฟล์' },
          { value: 'youtube', label: 'ใส่ URL YouTube' },
        ].map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm text-slate">
            <input
              type="radio"
              name="videoKind"
              checked={form.videoKind === opt.value}
              onChange={() => setForm((f) => ({ ...f, videoKind: opt.value, videoUrl: '' }))}
            />
            {opt.label}
          </label>
        ))}
      </div>

      {form.videoKind === 'youtube' ? (
        <>
          <input
            className="field"
            placeholder="https://www.youtube.com/watch?v=..."
            value={form.videoUrl}
            onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
          />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading > 0}
            className="btn-primary btn-sm"
          >
            <Icon.Import size={16} /> เลือกไฟล์
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm"
            className="hidden"
            onChange={onChoose}
          />

          {uploading > 0 ? (
            <span className="flex min-w-40 items-center gap-2 text-2xs text-slate">
              <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-page">
                <span
                  className="block h-full rounded-pill bg-primary transition-all"
                  style={{ width: `${uploading}%` }}
                />
              </span>
              {uploading}%
            </span>
          ) : (
            <span className="text-2xs text-muted">
              {videoName || (form.videoUrl ? 'มีไฟล์วิดีโออยู่แล้ว' : 'ยังไม่ได้เลือกไฟล์')}
            </span>
          )}
        </div>
      )}

      {form.videoUrl && form.videoKind === 'upload' && (
        <video
          src={form.videoUrl}
          controls
          className="mt-3 aspect-video w-full rounded-card bg-black"
          onLoadedMetadata={(e) => {
            // ไฟล์ที่อัปเองอ่านความยาวได้จากตัวไฟล์ กรอกให้เลยไม่ต้องให้ผู้ดูแลมานั่งจับเวลา
            const total = Math.round(e.currentTarget.duration || 0);
            if (total > 0) {
              setForm((f) => ({
                ...f,
                videoMinutes: Math.floor(total / 60),
                videoSecondsPart: total % 60,
              }));
            }
          }}
        />
      )}

      <p className="mt-1.5 text-2xs text-muted">รองรับ MP4 และ WEBM ขนาดไม่เกิน 1 GB</p>

      {/*
        ความยาวคลิปคือตัวหารของเงื่อนไข "ดูครบ N%"
        ไม่มีตัวเลขนี้ ระบบจะไม่รู้ว่า N% คือกี่วินาที และไม่มีใครรับคะแนนได้เลย
      */}
      <div className="mt-4">
        <span className="label">
          ความยาวคลิป {form.videoKind === 'youtube' && <span className="text-danger">*</span>}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            className="field w-24"
            value={form.videoMinutes}
            onChange={(e) => setForm((f) => ({ ...f, videoMinutes: e.target.value }))}
            aria-label="ความยาวคลิป นาที"
          />
          <span className="text-sm text-slate">นาที</span>
          <input
            type="number"
            min="0"
            max="59"
            className="field w-24"
            value={form.videoSecondsPart}
            onChange={(e) => setForm((f) => ({ ...f, videoSecondsPart: e.target.value }))}
            aria-label="ความยาวคลิป วินาที"
          />
          <span className="text-sm text-slate">วินาที</span>
        </div>

        {form.videoKind === 'youtube' ? (
          <p className="mt-1.5 text-2xs text-muted">
            คลิป YouTube ต้องกรอกความยาวเอง ดูได้จากเวลาที่แสดงบนคลิป
          </p>
        ) : (
          <p className="mt-1.5 text-2xs text-muted">
            ระบบอ่านความยาวจากไฟล์ที่อัปโหลดให้อัตโนมัติ แก้เองได้ถ้าต้องการ
          </p>
        )}

        {clipSeconds > 0 && (
          <p className="mt-1.5 text-2xs text-primary-dark">
            ต้องดูอย่างน้อย {Math.round((clipSeconds * (Number(form.watchPercent) || 0)) / 100)} วินาที
            จึงจะรับคะแนนได้
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- แท็บประวัติ ---------- */

function PrHistory() {
  const [filters, setFilters] = useState({ q: '', kind: 'all', since: '', until: '' });
  const [query, setQuery] = useState({ q: '', kind: 'all', since: '', until: '', page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api
      .adminPrHistory({ ...query, limit: 10 })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [query]);

  function search() {
    setQuery({ ...filters, page: 1 });
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-white p-4">
        <div className="min-w-56 flex-1">
          <span className="label">ค้นหา</span>
          <SearchInput
            value={filters.q}
            onChange={(v) => setFilters((f) => ({ ...f, q: v }))}
            placeholder="ค้นหาชื่อพนักงาน / หัวข้อข่าว..."
          />
        </div>

        <div className="w-44">
          <span className="label">ประเภท</span>
          <Select
            options={[
              { value: 'all', label: 'ประเภททั้งหมด' },
              { value: 'text', label: 'ข้อความ' },
              { value: 'image', label: 'รูปภาพ' },
              { value: 'video', label: 'วิดีโอ' },
            ]}
            value={filters.kind}
            onChange={(v) => setFilters((f) => ({ ...f, kind: v }))}
          />
        </div>

        <div>
          <span className="label">ช่วงวันที่</span>
          <div className="flex items-center gap-2">
            <DateField
              className="field w-40"
              value={filters.since}
              onChange={(e) => setFilters((f) => ({ ...f, since: e.target.value }))}
            />
            <span className="text-muted">-</span>
            <DateField
              className="field w-40"
              value={filters.until}
              onChange={(e) => setFilters((f) => ({ ...f, until: e.target.value }))}
            />
          </div>
        </div>

        <button onClick={search} className="btn-primary">
          <Icon.Search size={18} /> ค้นหา
        </button>
      </div>

      {error && <Notice>{error}</Notice>}

      {!data ? (
        <Spinner />
      ) : data.rows.length === 0 ? (
        <EmptyState icon={Icon.History} title="ยังไม่มีประวัติการรับคะแนนในเงื่อนไขนี้" />
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-line bg-white">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">ลำดับ</th>
                    <th className="th">รหัสพนักงาน</th>
                    <th className="th">ชื่อ-สกุล</th>
                    <th className="th">หัวข้อข่าว</th>
                    <th className="th">ประเภท</th>
                    <th className="th">เงื่อนไขการอ่าน</th>
                    <th className="th text-right">คะแนน</th>
                    <th className="th">วันที่รับคะแนน</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={row.id} className="hover:bg-page">
                      <td className="td text-muted">{(data.page - 1) * data.limit + i + 1}</td>
                      <td className="td whitespace-nowrap font-medium text-ink">
                        {row.employee_code}
                      </td>
                      <td className="td whitespace-nowrap">
                        {row.display_name}
                        <span className="ml-1.5 text-2xs text-muted">{row.department}</span>
                      </td>
                      <td className="td">{row.title}</td>
                      <td className="td whitespace-nowrap text-slate">
                        {(KIND[row.kind] || KIND.text).label}
                      </td>
                      <td className="td whitespace-nowrap text-slate">{ruleText(row)}</td>
                      <td className="td whitespace-nowrap text-right font-bold text-primary">
                        {num(row.points)}
                      </td>
                      <td className="td whitespace-nowrap text-2xs text-muted">
                        {dateTime(row.awarded_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xs text-muted">
              แสดง {(data.page - 1) * data.limit + 1}-
              {Math.min(data.page * data.limit, data.total)} จาก {num(data.total)} รายการ ·
              แจกไปแล้วรวม <b className="text-ink">{num(data.points)}</b> คะแนน
            </p>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
                disabled={data.page <= 1}
                className="btn-ghost btn-sm"
              >
                <Icon.Back size={16} />
              </button>
              <span className="text-2xs text-slate">
                {data.page} / {pages}
              </span>
              <button
                onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
                disabled={data.page >= pages}
                className="btn-ghost btn-sm"
              >
                <Icon.Next size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
