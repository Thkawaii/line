import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Badge, Modal, Notice, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import RegistrationSheet from '../../components/RegistrationSheet';
import TranslatedFields from '../../components/TranslatedFields';
import { dateRange, num, timeRange } from '../../lib/format';

// ช่องข้อความที่กรอกคำแปลได้
const TEXT_FIELDS = [
  { name: 'title', label: 'ชื่อกิจกรรม', required: true, full: true },
  { name: 'location', label: 'สถานที่', full: true },
  { name: 'description', label: 'รายละเอียด', type: 'textarea', rows: 3 },
  { name: 'agenda', label: 'กำหนดการ (บรรทัดละหนึ่งช่วงเวลา)', type: 'textarea', rows: 3 },
];

/**
 * ตัวแก้ไขตัวเลือกของกิจกรรมโหวต
 * ตัวเลือกที่มีคนโหวตไปแล้วจะลบไม่ได้ เพื่อไม่ให้ผลโหวตที่บันทึกไว้หายไป
 */
function VoteOptions({ value, onChange }) {
  const update = (index, key, next) =>
    onChange(value.map((item, i) => (i === index ? { ...item, [key]: next } : item)));

  const remove = (index) => onChange(value.filter((_, i) => i !== index));

  const move = (index, step) => {
    const target = index + step;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="rounded-[10px] border border-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="label mb-0">ตัวเลือกให้พนักงานโหวต *</p>
        <button
          type="button"
          onClick={() => onChange([...value, { label: '', detail: '' }])}
          className="btn-ghost btn-sm"
        >
          <Icon.Plus size={15} /> เพิ่มตัวเลือก
        </button>
      </div>

      {value.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          ยังไม่มีตัวเลือก กดเพิ่มตัวเลือกเพื่อให้พนักงานเลือกตอนโหวต
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((option, index) => (
            <li key={option.id ?? `new-${index}`} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-center text-sm text-muted">{index + 1}</span>

              <div className="min-w-0 flex-1 space-y-2">
                <input
                  className="field"
                  value={option.label}
                  onChange={(e) => update(index, 'label', e.target.value)}
                  placeholder="ชื่อตัวเลือก เช่น เชียงใหม่"
                  required
                />
                <input
                  className="field"
                  value={option.detail}
                  onChange={(e) => update(index, 'detail', e.target.value)}
                  placeholder="คำอธิบายสั้น ๆ (ไม่บังคับ)"
                />
              </div>

              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" onClick={() => move(index, -1)} className="text-muted hover:text-primary" aria-label="เลื่อนขึ้น">
                  <Icon.ChevronUp size={16} />
                </button>
                <button type="button" onClick={() => move(index, 1)} className="text-muted hover:text-primary" aria-label="เลื่อนลง">
                  <Icon.Chevron size={16} />
                </button>
              </div>

              {option.votes > 0 ? (
                <span className="mt-2 w-20 shrink-0 text-right text-2xs text-muted">
                  {option.votes} โหวต
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="mt-2 w-20 shrink-0 text-right text-2xs text-danger"
                >
                  ลบ
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-2xs text-muted">
        ตัวเลือกที่มีคนโหวตแล้วจะลบไม่ได้ เพื่อไม่ให้ผลโหวตหาย
      </p>
    </div>
  );
}

const EMPTY = {
  options: [],
  title: '',
  description: '',
  agenda: '',
  location: '',
  eventDate: '',
  endDate: '',
  startTime: '09:00',
  endTime: '12:00',
  points: '',
  kind: 'register',
  capacity: '',
  status: 'open',
};

function EventForm({ open, editing, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      editing
        ? {
            title: editing.title,
            description: editing.description,
            agenda: editing.agenda,
            location: editing.location,
            eventDate: editing.event_date.slice(0, 10),
            endDate: editing.end_date ? editing.end_date.slice(0, 10) : '',
            startTime: editing.start_time.slice(0, 5),
            endTime: editing.end_time.slice(0, 5),
            points: editing.points,
            kind: editing.kind,
            capacity: editing.capacity,
            status: editing.status,
          }
        : EMPTY
    );
    setOptions(
      editing?.options?.map((o) => ({ id: o.id, label: o.label, detail: o.detail || '', votes: o.votes })) || []
    );
  }, [open, editing]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      // ส่งตัวเลือกเฉพาะกิจกรรมโหวต กิจกรรมแบบลงทะเบียนส่ง null เพื่อไม่ให้ไปแตะของเดิม
      options: form.kind === 'vote' ? options.filter((o) => o.label.trim()) : null,
      // ส่งค่าว่างไปด้วยเพื่อให้ล้างวันสิ้นสุดได้ ไม่ใช่แค่ตั้งใหม่
      endDate: form.endDate || '',
      points: Number(form.points || 0),
      capacity: Number(form.capacity || 0),
    };
    try {
      if (editing) await api.adminUpdateEvent(editing.id, payload);
      else await api.adminCreateEvent(payload);
      toast(editing ? 'บันทึกกิจกรรมแล้ว' : 'สร้างกิจกรรมแล้ว', 'primary');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <form onSubmit={submit} className="p-6">
        <h2 className="text-xl font-bold text-ink">{editing ? 'แก้ไขกิจกรรม' : 'สร้างกิจกรรม'}</h2>
        {error && (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        )}

        <div className="mt-4">
          <TranslatedFields
            fields={TEXT_FIELDS}
            value={form}
            onChange={setForm}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="eventDate">
              วันที่เริ่มจัด *
            </label>
            <input id="eventDate" type="date" className="field" value={form.eventDate} onChange={set('eventDate')} required />
          </div>
          <div>
            <label className="label" htmlFor="endDate">
              วันที่สิ้นสุด
            </label>
            <input id="endDate" type="date" className="field" value={form.endDate} min={form.eventDate} onChange={set('endDate')} />
            <p className="mt-1 text-2xs text-muted">เว้นว่างถ้าจัดวันเดียว</p>
          </div>
          <div>
            <label className="label" htmlFor="startTime">
              เวลาเริ่ม
            </label>
            <input id="startTime" type="time" className="field" value={form.startTime} onChange={set('startTime')} />
          </div>
          <div>
            <label className="label" htmlFor="endTime">
              เวลาสิ้นสุด
            </label>
            <input id="endTime" type="time" className="field" value={form.endTime} onChange={set('endTime')} />
          </div>
          <div>
            <label className="label" htmlFor="points">
              คะแนนที่ได้รับ
            </label>
            <input id="points" type="number" min="0" className="field" value={form.points} onChange={set('points')} />
          </div>
          <div>
            <label className="label" htmlFor="capacity">
              จำนวนที่รับ (0 = ไม่จำกัด)
            </label>
            <input id="capacity" type="number" min="0" className="field" value={form.capacity} onChange={set('capacity')} />
          </div>
          {form.kind === 'vote' && (
            <div className="sm:col-span-2">
              <VoteOptions value={options} onChange={setOptions} />
            </div>
          )}

          <div>
            <label className="label" htmlFor="kind">
              ประเภท
            </label>
            <select id="kind" className="field" value={form.kind} onChange={set('kind')}>
              <option value="register">ลงทะเบียนเข้าร่วม</option>
              <option value="vote">โหวต (ได้คะแนนทันที)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="status">
              สถานะ
            </label>
            <select id="status" className="field" value={form.status} onChange={set('status')}>
              <option value="open">เปิดรับ</option>
              <option value="draft">ร่าง</option>
              <option value="closed">ปิดแล้ว</option>
            </select>
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

function CheckInBox({ event, onClose, onDone }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await api.adminCheckIn(event.id, code.trim());
      setResult(`เช็คอิน ${res.name} แล้ว ให้คะแนน ${num(res.points)} คะแนน`);
      setCode('');
      onDone();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <Modal open={!!event} onClose={onClose} size="sm">
      <form onSubmit={submit} className="p-6">
        <h2 className="text-lg font-bold text-ink">เช็คอินหน้างาน</h2>
        <p className="mt-1 text-sm text-muted">{event?.title}</p>

        <label className="label mt-4" htmlFor="code">
          รหัสพนักงาน (หรือค่าที่อ่านได้จาก QR)
        </label>
        <input id="code" className="field" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />

        {result && (
          <p className="mt-3 rounded-[10px] bg-success-wash px-3 py-2 text-sm text-success">{result}</p>
        )}

        <button type="submit" className="btn-primary mt-5 w-full">
          ยืนยันเช็คอิน
        </button>
      </form>
    </Modal>
  );
}

export default function AdminEvents() {
  const [events, setEvents] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [checkIn, setCheckIn] = useState(null);
  const [sheetFor, setSheetFor] = useState(null);

  const load = useCallback(() => api.adminEvents().then(({ events }) => setEvents(events)), []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell
      title="จัดการกิจกรรม"
      actions={
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="btn-primary btn-sm"
        >
          <Icon.Plus size={16} /> สร้างกิจกรรม
        </button>
      }
    >
      <section className="card overflow-hidden">
        {!events ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">กิจกรรม</th>
                  <th className="th">วันที่</th>
                  <th className="th">เวลา</th>
                  <th className="th">สถานที่</th>
                  <th className="th">คะแนน</th>
                  <th className="th">ลงทะเบียน</th>
                  <th className="th">ประเภท</th>
                  <th className="th">สถานะ</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="td max-w-xs truncate">{event.title}</td>
                    <td className="td">{dateRange(event.event_date, event.end_date)}</td>
                    <td className="td">{timeRange(event.start_time, event.end_time)}</td>
                    <td className="td max-w-[180px] truncate">{event.location || '-'}</td>
                    <td className="td">{num(event.points)}</td>
                    <td className="td">
                      {num(event.joined)}
                      {event.capacity > 0 && ` / ${num(event.capacity)}`}
                    </td>
                    <td className="td">{event.kind === 'vote' ? 'โหวต' : 'ลงทะเบียน'}</td>
                    <td className="td">
                      <Badge
                        className={
                          event.status === 'open'
                            ? 'bg-success-wash text-success'
                            : event.status === 'draft'
                              ? 'bg-line text-slate'
                              : 'bg-danger-wash text-danger'
                        }
                      >
                        {event.status === 'open' ? 'เปิดรับ' : event.status === 'draft' ? 'ร่าง' : 'ปิดแล้ว'}
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex gap-3">
                        <button onClick={() => setSheetFor(event.id)} className="text-primary">
                          รายชื่อ
                        </button>
                        <button onClick={() => setCheckIn(event)} className="text-primary">
                          เช็คอิน
                        </button>
                        <button
                          onClick={() => {
                            setEditing(event);
                            setFormOpen(true);
                          }}
                          className="text-slate"
                        >
                          แก้ไข
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EventForm open={formOpen} editing={editing} onClose={() => setFormOpen(false)} onSaved={load} />
      {checkIn && <CheckInBox event={checkIn} onClose={() => setCheckIn(null)} onDone={load} />}
      <RegistrationSheet eventId={sheetFor} onClose={() => setSheetFor(null)} />
    </AdminShell>
  );
}
