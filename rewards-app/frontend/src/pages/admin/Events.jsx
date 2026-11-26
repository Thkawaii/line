import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Select } from '../../components/ComboBox';
import EventSummary from '../../components/EventSummary';
import { SpecialPointIcon } from '../../components/SpecialPoints';
import { getPosition } from '../../lib/geolocation';
import { useAuth } from '../../context/AuthContext';
import { isBackOffice } from '../../lib/org';
import { Badge, Modal, Notice, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import RegistrationSheet from '../../components/RegistrationSheet';
import ImageCropper from '../../components/ImageCropper';
import TranslatedFields from '../../components/TranslatedFields';
import { dateRange, num, thaiDate, timeRange } from '../../lib/format';
import DateField from '../../components/DateField';

// ช่องข้อความที่กรอกคำแปลได้
const TEXT_FIELDS = [
  { name: 'title', label: 'ชื่อกิจกรรม', required: true, full: true },
  { name: 'location', label: 'สถานที่', full: true },
  { name: 'description', label: 'รายละเอียด', type: 'textarea', rows: 3 },
  { name: 'agenda', label: 'กำหนดการ', type: 'textarea', rows: 3 },
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
  imageUrl: '',
  title: '',
  description: '',
  agenda: '',
  location: '',
  eventDate: '',
  endDate: '',
  startTime: '09:00',
  endTime: '12:00',
  points: '',
  specialPoints: '',
  specialPointsExpireAt: '',
  venueLat: '',
  venueLng: '',
  venueRadius: 150,
  kind: 'register',
  capacity: '',
  status: 'open',
  feedbackLead: 60,
  feedbackLeadUnit: 'minutes',
};

/*
แปลงนาทีที่เก็บในฐานข้อมูล กลับเป็นตัวเลข+หน่วยที่อ่านสบายตา

เก็บเป็นนาทีหน่วยเดียวเพื่อให้คำนวณง่าย แต่ 120 นาทีควรโชว์ว่า 2 ชั่วโมง
ไม่ใช่ให้ผู้ดูแลมานั่งหารเอง ส่วน 90 นาทีโชว์เป็นนาทีเพราะ 1.5 ชั่วโมงกรอกเป็นจำนวนเต็มไม่ได้
*/
function splitLead(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) return { feedbackLead: 60, feedbackLeadUnit: 'minutes' };
  if (value > 0 && value % 60 === 0) return { feedbackLead: value / 60, feedbackLeadUnit: 'hours' };
  return { feedbackLead: value, feedbackLeadUnit: 'minutes' };
}

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
            specialPoints: editing.special_points || '',
            specialPointsExpireAt: (editing.special_points_expire_at || '').slice(0, 10),
            venueLat: editing.venue_lat ?? '',
            venueLng: editing.venue_lng ?? '',
            venueRadius: editing.venue_radius ?? 150,
            kind: editing.kind,
            capacity: editing.capacity,
            status: editing.status,
            imageUrl: editing.image_url || '',
            ...splitLead(editing.feedback_lead_minutes ?? 60),
          }
        : EMPTY
    );
    setOptions(
      editing?.options?.map((o) => ({ id: o.id, label: o.label, detail: o.detail || '', votes: o.votes })) || []
    );
  }, [open, editing]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // เก็บหน่วยเดียวคือนาที หน้าเว็บเป็นฝ่ายแปลงจากหน่วยที่ผู้ดูแลเลือก
  const leadMinutes =
    Math.max(0, Math.round(Number(form.feedbackLead || 0))) *
    (form.feedbackLeadUnit === 'hours' ? 60 : 1);

  /*
    บอกเวลาที่แบบประเมินจะขึ้นจริง ไม่ใช่ให้ผู้ดูแลคิดในใจเอง

    "ก่อนจบ 90 นาที" ของงานที่เลิก 16:30 คือ 15:00 ซึ่งคิดเองก็ได้
    แต่พอเป็นงานหลายวัน หรือเวลาเลิกคร่อมเที่ยงคืน คนจะคิดผิดได้ง่าย
    และความผิดแบบนี้จะไม่มีใครรู้จนกว่าจะถึงวันงานจริง
  */
  const leadPreview = (() => {
    const lastDay = form.endDate || form.eventDate;
    if (!lastDay || !form.endTime) return null;

    const ends = new Date(`${lastDay}T${form.endTime}`);
    if (Number.isNaN(ends.getTime())) return null;

    const opens = new Date(ends.getTime() - leadMinutes * 60000);
    const starts = form.eventDate && form.startTime ? new Date(`${form.eventDate}T${form.startTime}`) : null;

    return {
      text: `${thaiDate(opens)} ${String(opens.getHours()).padStart(2, '0')}:${String(opens.getMinutes()).padStart(2, '0')} น.`,
      // ขึ้นก่อนงานเริ่มไม่ใช่เรื่องผิดกฎ แต่เกือบทุกครั้งคือกรอกเกินมาโดยไม่ตั้งใจ
      beforeStart: starts ? opens < starts : false,
    };
  })();

  /** เติมพิกัดจากตำแหน่งที่ผู้ดูแลยืนอยู่ สะดวกกว่าไปหาพิกัดจากแผนที่มากรอกเอง */
  async function useMyLocation() {
    try {
      const spot = await getPosition();
      setForm((f) => ({
        ...f,
        // ทศนิยม 6 ตำแหน่งละเอียดระดับ 0.1 เมตร พอเกินพอสำหรับงานนี้
        venueLat: spot.lat.toFixed(6),
        venueLng: spot.lng.toFixed(6),
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(event) {
    event.preventDefault();

    // กันไว้อีกชั้นเผื่อเบราว์เซอร์ไม่บังคับ required ของ input ที่เพิ่งถูกแสดง
    // ฝั่งเซิร์ฟเวอร์ตรวจซ้ำอยู่แล้ว แต่บอกตรงนี้ผู้ดูแลไม่ต้องรอรอบไป-กลับ
    const special = Number(form.specialPoints || 0);
    if (special > 0 && !form.specialPointsExpireAt) {
      setError('กิจกรรมที่ให้คะแนนพิเศษต้องระบุวันหมดอายุของคะแนนพิเศษ');
      return;
    }

    const payload = {
      ...form,
      // ส่งตัวเลือกเฉพาะกิจกรรมโหวต กิจกรรมแบบลงทะเบียนส่ง null เพื่อไม่ให้ไปแตะของเดิม
      options: form.kind === 'vote' ? options.filter((o) => o.label.trim()) : null,
      // ส่งค่าว่างไปด้วยเพื่อให้ล้างวันสิ้นสุดได้ ไม่ใช่แค่ตั้งใหม่
      endDate: form.endDate || '',
      points: Number(form.points || 0),
      specialPoints: special,
      // ไม่ให้คะแนนพิเศษแล้วก็ไม่ต้องเก็บวันหมดอายุค้างไว้
      specialPointsExpireAt: special > 0 ? form.specialPointsExpireAt : '',
      // ส่ง null เมื่อเว้นว่าง = เลิกตรวจตำแหน่ง
      venueLat: form.venueLat === '' ? null : Number(form.venueLat),
      venueLng: form.venueLng === '' ? null : Number(form.venueLng),
      venueRadius: Number(form.venueRadius) || 150,
      capacity: Number(form.capacity || 0),
      // ส่งเป็นนาทีเสมอ ฝั่งเซิร์ฟเวอร์เก็บหน่วยเดียว หน้าเว็บเป็นฝ่ายแปลงให้
      feedbackLeadMinutes: leadMinutes,
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
            <DateField id="eventDate" className="field" value={form.eventDate} onChange={set('eventDate')} required />
          </div>
          <div>
            <label className="label" htmlFor="endDate">
              วันที่สิ้นสุด
            </label>
            <DateField id="endDate" className="field" value={form.endDate} min={form.eventDate} onChange={set('endDate')} />
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
            <label className="label" htmlFor="specialPoints">
              <span className="inline-flex items-center gap-1.5">
                <SpecialPointIcon size={18} /> คะแนนพิเศษ
              </span>
            </label>
            <input
              id="specialPoints"
              type="number"
              min="0"
              className="field"
              value={form.specialPoints}
              onChange={set('specialPoints')}
            />
          </div>

          {/* ช่องวันหมดอายุโผล่เมื่อกิจกรรมนี้ให้คะแนนพิเศษจริงเท่านั้น
              กิจกรรมที่ไม่ให้คะแนนพิเศษไม่ต้องมีช่องนี้มารกฟอร์ม
              แต่ถ้าให้คะแนนพิเศษแล้วต้องกรอก ไม่มีทางเลือก "ไม่มีวันหมดอายุ" อีกต่อไป */}
          {Number(form.specialPoints) > 0 && (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="specialPointsExpireAt">
                <span className="inline-flex items-center gap-1.5">
                  <SpecialPointIcon size={18} /> คะแนนพิเศษหมดอายุวันที่ *
                </span>
              </label>
              <DateField
                id="specialPointsExpireAt"
                                className="field"
                min={form.eventDate || undefined}
                value={form.specialPointsExpireAt}
                onChange={set('specialPointsExpireAt')}
                required
              />
            </div>
          )}
          <div>
            <label className="label" htmlFor="capacity">
              จำนวนที่รับ (0 = ไม่จำกัด)
            </label>
            <input id="capacity" type="number" min="0" className="field" value={form.capacity} onChange={set('capacity')} />
          </div>

          {/* เวลาที่แบบประเมินจะขึ้น ย้ายมาจากหน้าตั้งค่าระบบ
              เพราะงานสั้นกับงานทั้งวันใช้ค่าเดียวกันไม่ได้ */}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="feedbackLead">
              แบบประเมินความพึงพอใจขึ้นก่อนจบกิจกรรม
            </label>
            <div className="flex gap-2">
              <input
                id="feedbackLead"
                type="number"
                min="0"
                className="field w-28"
                value={form.feedbackLead}
                onChange={set('feedbackLead')}
              />
              <div className="w-32">
                <Select
                  options={[
                    { value: 'minutes', label: 'นาที' },
                    { value: 'hours', label: 'ชั่วโมง' },
                  ]}
                  value={form.feedbackLeadUnit}
                  onChange={(value) => setForm((f) => ({ ...f, feedbackLeadUnit: value }))}
                />
              </div>
              {leadPreview && (
                <p className="self-center text-2xs text-muted">
                  จะขึ้นให้ประเมิน <b className="text-ink">{leadPreview.text}</b>
                </p>
              )}
            </div>
            {leadPreview?.beforeStart && (
              <p className="mt-1.5 text-2xs text-gold-ink">
                เวลานี้อยู่ก่อนกิจกรรมเริ่ม พนักงานจะประเมินได้ตั้งแต่ยังไม่ได้เข้าร่วม
              </p>
            )}
          </div>
          {/* พื้นที่จัดงาน — เว้นว่างไว้คือไม่ตรวจตำแหน่ง */}
          <fieldset className="rounded-[10px] border border-line p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-semibold text-ink">
              พื้นที่จัดงาน (ไม่บังคับ)
            </legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="venueLat">
                  ละติจูด
                </label>
                <input
                  id="venueLat"
                  className="field"
                  value={form.venueLat}
                  onChange={set('venueLat')}
                />
              </div>
              <div>
                <label className="label" htmlFor="venueLng">
                  ลองจิจูด
                </label>
                <input
                  id="venueLng"
                  className="field"
                  value={form.venueLng}
                  onChange={set('venueLng')}
                />
              </div>
              <div>
                <label className="label" htmlFor="venueRadius">
                  รัศมี (เมตร)
                </label>
                <input
                  id="venueRadius"
                  type="number"
                  min="20"
                  className="field"
                  value={form.venueRadius}
                  onChange={set('venueRadius')}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={useMyLocation} className="btn-ghost btn-sm">
                <Icon.Pin size={16} /> ใช้ตำแหน่งปัจจุบัน
              </button>
              {(form.venueLat !== '' || form.venueLng !== '') && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, venueLat: '', venueLng: '' }))}
                  className="btn-ghost btn-sm text-danger"
                >
                  ล้างพิกัด (เลิกตรวจตำแหน่ง)
                </button>
              )}
            </div>

            {/* GPS คลาดเคลื่อนได้หลายสิบเมตร บอกไว้ให้ผู้ดูแลตั้งรัศมีเผื่อ */}
            <p className="mt-2 text-2xs text-muted">
              ระบบเผื่อความคลาดเคลื่อนของ GPS ให้อีก 50 เมตรจากรัศมีที่ตั้งไว้
              เพราะสัญญาณในอาคารมักเพี้ยนหลายสิบเมตร
            </p>
          </fieldset>

          {form.kind === 'vote' && (
            <div className="sm:col-span-2">
              <VoteOptions value={options} onChange={setOptions} />
            </div>
          )}

          <div>
            <label className="label" htmlFor="kind">
              ประเภท
            </label>
            <Select
              id="kind"
              options={[
                { value: 'register', label: 'ลงทะเบียนเข้าร่วม' },
                { value: 'vote', label: 'โหวต (ได้คะแนนทันที)' },
              ]}
              value={form.kind}
              onChange={(value) => setForm((f) => ({ ...f, kind: value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="status">
              สถานะ
            </label>
            <Select
              id="status"
              options={[
                { value: 'open', label: 'เปิดรับ' },
                { value: 'draft', label: 'ร่าง' },
                { value: 'closed', label: 'ปิดแล้ว' },
              ]}
              value={form.status}
              onChange={(value) => setForm((f) => ({ ...f, status: value }))}
            />
          </div>

          <div className="sm:col-span-2">
            {/* สัดส่วน 2.8:1 ให้ตรงกับกรอบรูปในการ์ดกิจกรรมฝั่งพนักงาน */}
            <ImageCropper
              value={form.imageUrl}
              onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
              aspect={2.8}
              outputWidth={1120}
              label="รูปกิจกรรม"
            />
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

  // คนที่ยังไม่ได้ลงทะเบียนแต่มาหน้างาน ระบบจะคืนชื่อมาให้ตรวจก่อนในจังหวะแรก
  // แล้วค่อยกดยืนยันอีกที กันกรณีพิมพ์รหัสผิดแล้วเผลอให้คะแนนคนอื่น
  const [walkIn, setWalkIn] = useState(null);

  // คนที่ลงทะเบียนในแอปไปแล้วและได้คะแนนไปแล้ว ต้องเตือนไม่ให้สแกนซ้ำ
  const [already, setAlready] = useState(null);

  async function checkIn(employeeCode, allowWalkIn) {
    try {
      const res = await api.adminCheckIn(event.id, employeeCode, allowWalkIn);

      if (res.ok === false && res.status === 'not-registered') {
        setWalkIn({ code: employeeCode, name: res.name });
        setAlready(null);
        setResult(null);
        return;
      }

      if (res.ok === false && res.status === 'already-registered') {
        setAlready({ name: res.name });
        setWalkIn(null);
        setResult(null);
        return;
      }

      setResult({
        text: `เช็คอิน ${res.name} แล้ว ให้คะแนน ${num(res.points)} คะแนน`,
        walkIn: res.walkIn,
      });
      setWalkIn(null);
      setAlready(null);
      setCode('');
      onDone();
    } catch (err) {
      setWalkIn(null);
      toast(err.message);
    }
  }

  function submit(e) {
    e.preventDefault();
    const value = code.trim();
    if (value) checkIn(value, false);
  }

  return (
    <Modal open={!!event} onClose={onClose} size="sm">
      <form onSubmit={submit} className="p-6">
        <h2 className="text-lg font-bold text-ink">เช็คอินกิจกรรม</h2>
        <p className="mt-1 text-sm text-muted">{event?.title}</p>

        <label className="label mt-4" htmlFor="code">
          รหัสพนักงาน
        </label>
        <input
          id="code"
          className="field"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setWalkIn(null);
            setAlready(null);
          }}
          autoFocus
        />

        {/* ลงทะเบียนในแอปไปแล้ว ไม่ต้องสแกนซ้ำ และระบบไม่จ่ายคะแนนให้อีกรอบ */}
        {already && (
          <div className="mt-3 rounded-[10px] bg-primary-wash px-3 py-3">
            <p className="flex items-start gap-2 text-sm font-medium text-primary-dark">
              <span className="mt-0.5 shrink-0">
                <Icon.CheckCircle size={16} />
              </span>
              <span>{already.name} ลงทะเบียนในแอปแล้ว</span>
            </p>
          </div>
        )}

        {walkIn && (
          <div className="mt-3 rounded-[10px] bg-gold-wash px-3 py-3">
            <p className="text-sm font-medium text-gold-ink">
              {walkIn.name} ยังไม่ได้ลงทะเบียนกิจกรรมนี้
            </p>
            <button
              type="button"
              onClick={() => checkIn(walkIn.code, true)}
              className="btn-gold btn-sm mt-3 w-full"
            >
              เช็คอินหน้างาน
            </button>
          </div>
        )}

        {result && (
          <div className="mt-3 rounded-[10px] bg-success-wash px-3 py-2">
            <p className="text-sm text-success">{result.text}</p>
            {result.walkIn && (
              <p className="mt-0.5 text-2xs text-success/80">บันทึกเป็นผู้เข้าร่วมแบบหน้างาน</p>
            )}
          </div>
        )}

        <button type="submit" className="btn-primary mt-5 w-full">
          ยืนยันเช็คอิน
        </button>
      </form>
    </Modal>
  );
}

export default function AdminEvents() {
  // ฝ่ายธุรการ (ga) เปิดหน้านี้ได้เพื่อดูรายชื่อและความคืบหน้ารายแผนกของแต่ละกิจกรรม
  // แต่สร้าง แก้ไข และเช็คอินไม่ได้ ซึ่งเซิร์ฟเวอร์กันไว้อีกชั้นแล้ว
  const { user } = useAuth();
  // พนักงานแผนกหลังบ้านจัดการหน้านี้ได้เท่าผู้ดูแลระบบ
  // ที่กันไว้เฉพาะผู้ดูแลระบบตัวจริงคือกลุ่มเมนู "ตั้งค่าระบบ" เท่านั้น
  const isAdmin = isBackOffice(user);

  const [events, setEvents] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [checkIn, setCheckIn] = useState(null);
  const [sheetFor, setSheetFor] = useState(null);
  const [summaryFor, setSummaryFor] = useState(null);

  const load = useCallback(() => api.adminEvents().then(({ events }) => setEvents(events)), []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell
      title={isAdmin ? 'จัดการกิจกรรม' : 'กิจกรรม'}
      actions={
        isAdmin ? (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="btn-primary btn-sm"
          >
            <Icon.Plus size={16} /> สร้างกิจกรรม
          </button>
        ) : null
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
                  <th className="th">ลำดับ</th>
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
                {events.map((event, index) => (
                  <tr key={event.id}>
                    <td className="td">{index + 1}</td>
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
                        <button onClick={() => setSummaryFor(event.id)} className="text-primary">
                          สรุปข้อมูล
                        </button>
                        <button onClick={() => setSheetFor(event.id)} className="text-primary">
                          รายชื่อ
                        </button>
                        {isAdmin && (
                          <>
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
                          </>
                        )}
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
      <EventSummary eventId={summaryFor} onClose={() => setSummaryFor(null)} />
      <RegistrationSheet eventId={sheetFor} onClose={() => setSheetFor(null)} />
    </AdminShell>
  );
}
