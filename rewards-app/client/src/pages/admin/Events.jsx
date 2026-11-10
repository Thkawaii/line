import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Badge, Modal, Notice, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { num, thaiDate, timeRange } from '../../lib/format';

const EMPTY = {
  title: '',
  description: '',
  agenda: '',
  location: '',
  eventDate: '',
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
            startTime: editing.start_time.slice(0, 5),
            endTime: editing.end_time.slice(0, 5),
            points: editing.points,
            kind: editing.kind,
            capacity: editing.capacity,
            status: editing.status,
          }
        : EMPTY
    );
  }, [open, editing]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    const payload = { ...form, points: Number(form.points || 0), capacity: Number(form.capacity || 0) };
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

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="title">
              ชื่อกิจกรรม *
            </label>
            <input id="title" className="field" value={form.title} onChange={set('title')} required />
          </div>
          <div>
            <label className="label" htmlFor="eventDate">
              วันที่จัด *
            </label>
            <input id="eventDate" type="date" className="field" value={form.eventDate} onChange={set('eventDate')} required />
          </div>
          <div>
            <label className="label" htmlFor="location">
              สถานที่
            </label>
            <input id="location" className="field" value={form.location} onChange={set('location')} />
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
          <div className="sm:col-span-2">
            <label className="label" htmlFor="description">
              รายละเอียด
            </label>
            <textarea id="description" rows={3} className="field" value={form.description} onChange={set('description')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="agenda">
              กำหนดการ (บรรทัดละหนึ่งช่วงเวลา)
            </label>
            <textarea id="agenda" rows={3} className="field" value={form.agenda} onChange={set('agenda')} />
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
                    <td className="td">{thaiDate(event.event_date)}</td>
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
    </AdminShell>
  );
}
