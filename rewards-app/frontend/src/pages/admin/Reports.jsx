import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Modal,
  Notice,
  Spinner,
  useToast,
} from '../../components/ui';
import { Icon } from '../../components/icons';
import { num, thaiDate } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';

/**
 * รายงานสรุปการลงทะเบียน / แบบสำรวจ
 *
 * หน้านี้เปิดให้ทั้งผู้ดูแลระบบและฝ่ายธุรการ (role ga) เข้าได้ แต่เห็นไม่เท่ากัน
 *
 *   ฝ่ายธุรการ  เห็นเฉพาะตัวเลขรายแผนก — เหลือกี่คน กี่เปอร์เซ็นต์
 *   ผู้ดูแลระบบ เห็นเพิ่มอีกสองอย่างคือ รายชื่อคนที่ยังไม่ได้ทำ (ไว้ตามงาน)
 *               และความคิดเห็นที่พนักงานเขียนมา (ไม่มีชื่อผู้เขียน ถ้าหัวข้อตั้งเป็นไม่ระบุตัวตน)
 *
 * การซ่อนไม่ได้ทำแค่ที่หน้าจอ เซิร์ฟเวอร์ไม่ส่งข้อมูลพวกนี้ให้ฝ่ายธุรการตั้งแต่แรก
 * ดูได้ที่ backend/controllers/surveys.go
 */

const KIND_LABEL = {
  register: 'ลงทะเบียน',
  survey: 'แบบสำรวจ',
  feedback: 'ความคิดเห็น',
};

const STATUS_BADGE = {
  open: { label: 'เปิดอยู่', className: 'bg-success-wash text-success' },
  draft: { label: 'ฉบับร่าง', className: 'bg-line text-slate' },
  closed: { label: 'ปิดแล้ว', className: 'bg-gold-wash text-gold-ink' },
};

const emptyTopic = {
  title: '',
  heading: '',
  description: '',
  revision: 'Rev.01',
  asOfLabel: '',
  kind: 'register',
  anonymous: false,
  status: 'open',
  startsAt: '',
  endsAt: '',
  points: 0,
};

/** แถบเปอร์เซ็นต์ที่อ่านง่ายในตาราง ครบแล้วเป็นสีเขียว ยังไม่ครบเป็นสีทอง */
function RateCell({ rate }) {
  const pct = Math.round(rate * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-pill bg-[#D9D9D9]">
        <div
          className={`h-full rounded-pill ${rate >= 1 ? 'bg-success' : 'bg-gold'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm font-semibold ${rate >= 1 ? 'text-success' : 'text-slate'}`}>
        {pct}%
      </span>
    </div>
  );
}

/* ---------- ฟอร์มสร้าง/แก้หัวข้อ ---------- */

function TopicForm({ open, editing, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(emptyTopic);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      editing
        ? {
            title: editing.title || '',
            heading: editing.heading || '',
            description: editing.description || '',
            revision: editing.revision || 'Rev.01',
            asOfLabel: editing.as_of_label || '',
            kind: editing.kind || 'register',
            anonymous: !!editing.anonymous,
            status: editing.status || 'open',
            startsAt: (editing.starts_at || '').slice(0, 10),
            endsAt: (editing.ends_at || '').slice(0, 10),
            points: editing.points || 0,
          }
        : emptyTopic
    );
  }, [open, editing]);

  const set = (key) => (event) => {
    const target = event.target;
    setForm((prev) => ({
      ...prev,
      [key]: target.type === 'checkbox' ? target.checked : target.value,
    }));
  };

  async function save(event) {
    event.preventDefault();
    try {
      const payload = { ...form, points: Number(form.points) || 0 };
      if (editing) await api.adminUpdateSurvey(editing.id, payload);
      else await api.adminCreateSurvey(payload);
      toast(editing ? 'บันทึกหัวข้อแล้ว' : 'สร้างหัวข้อแล้ว', 'primary');
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <form onSubmit={save} className="p-6">
        <h2 className="text-xl font-bold text-ink">
          {editing ? 'แก้ไขหัวข้อ' : 'สร้างหัวข้อใหม่'}
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="topic-title">
              ชื่อหัวข้อ *
            </label>
            <input
              id="topic-title"
              className="field"
              value={form.title}
              onChange={set('title')}
              required
              placeholder="ข้อมูลพนักงานลงทะเบียน Line OA"
            />
            {/* ชื่อนี้ถูกใช้เป็นหัวคอลัมน์กลางตารางในไฟล์ Excel ด้วย จึงอธิบายไว้ให้เห็น */}
            <p className="mt-1 text-2xs text-muted">
              ใช้เป็นหัวคอลัมน์ในไฟล์ Excel ที่ดาวน์โหลด เปลี่ยนตรงนี้แล้วหัวตารางเปลี่ยนตาม
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="topic-heading">
              หัวเรื่องบนสุดของรายงาน
            </label>
            <input
              id="topic-heading"
              className="field"
              value={form.heading}
              onChange={set('heading')}
              placeholder="สรุปจำนวนข้อมูลพนักงานลงทะเบียนใช้ Line OA"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="topic-desc">
              คำอธิบายที่พนักงานจะเห็น
            </label>
            <textarea
              id="topic-desc"
              rows={3}
              className="field"
              value={form.description}
              onChange={set('description')}
            />
          </div>

          <div>
            <label className="label" htmlFor="topic-kind">
              ชนิด
            </label>
            <select id="topic-kind" className="field" value={form.kind} onChange={set('kind')}>
              <option value="register">ลงทะเบียน</option>
              <option value="survey">แบบสำรวจ</option>
              <option value="feedback">แสดงความคิดเห็น</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="topic-status">
              สถานะ
            </label>
            <select id="topic-status" className="field" value={form.status} onChange={set('status')}>
              <option value="open">เปิดให้ทำ</option>
              <option value="draft">ฉบับร่าง</option>
              <option value="closed">ปิดรับแล้ว</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="topic-start">
              เริ่มวันที่
            </label>
            <input
              id="topic-start"
              type="date"
              className="field"
              value={form.startsAt}
              onChange={set('startsAt')}
            />
          </div>

          <div>
            <label className="label" htmlFor="topic-end">
              ถึงวันที่
            </label>
            <input
              id="topic-end"
              type="date"
              className="field"
              value={form.endsAt}
              onChange={set('endsAt')}
            />
          </div>

          <div>
            <label className="label" htmlFor="topic-points">
              คะแนนที่ได้เมื่อทำเสร็จ
            </label>
            <input
              id="topic-points"
              type="number"
              min={0}
              className="field"
              value={form.points}
              onChange={set('points')}
            />
          </div>

          <div>
            <label className="label" htmlFor="topic-revision">
              เลขรุ่นเอกสาร
            </label>
            <input
              id="topic-revision"
              className="field"
              value={form.revision}
              onChange={set('revision')}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="topic-asof">
              ข้อความกำกับจำนวนพนักงาน (มุมขวาบนของรายงาน)
            </label>
            <input
              id="topic-asof"
              className="field"
              value={form.asOfLabel}
              onChange={set('asOfLabel')}
              placeholder="Manpower as 31-Aug-26 (End)"
            />
          </div>

          <label className="flex items-start gap-3 rounded-[10px] border border-line p-3 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.anonymous}
              onChange={set('anonymous')}
            />
            <span className="text-sm">
              <span className="font-semibold text-ink">ไม่ระบุตัวตนผู้ตอบ</span>
              <span className="mt-0.5 block text-2xs text-muted">
                ปกติปิดไว้ — ผู้ดูแลระบบและฝ่ายธุรการจะเห็นว่าใครตอบอะไร
                และพนักงานจะเห็นข้อความแจ้งแบบนั้นก่อนกดส่ง
                <br />
                เปิดเมื่อถามเรื่องที่คนจะตอบตรง ๆ ก็ต่อเมื่อไม่ต้องเปิดเผยตัว
                เช่นความพึงพอใจต่อหัวหน้างาน เปิดแล้วคำตอบจะไม่มีชื่อผู้ตอบติดมา
                ไม่ว่าใครเป็นคนเรียกดู แต่ยังดูรายชื่อคนที่ยังไม่ได้ทำเพื่อตามงานได้ตามปกติ
              </span>
            </span>
          </label>
        </div>

        {error && (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
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

/* ---------- หน้าหลัก ---------- */

export default function Reports() {
  const toast = useToast();
  const { user } = useAuth();

  // ฝ่ายธุรการ (ga) ดูได้ทุกอย่างเท่าผู้ดูแลระบบ รวมถึงรายชื่อพนักงาน
  // ต่างกันแค่แก้ไขข้อมูลและส่งแจ้งเตือนไม่ได้ ซึ่งเซิร์ฟเวอร์กันไว้อีกชั้นแล้ว
  const isAdmin = user?.role === 'admin';
  const canSee = isAdmin || user?.role === 'ga';

  const [topics, setTopics] = useState(null);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pending, setPending] = useState(null);
  const [responses, setResponses] = useState(null);
  const [tab, setTab] = useState('summary');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [remindOpen, setRemindOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadTopics = useCallback(
    () =>
      api.adminSurveys().then(({ topics }) => {
        setTopics(topics);
        // เลือกหัวข้อแรกให้อัตโนมัติ ผู้ใช้จะได้เห็นข้อมูลทันทีโดยไม่ต้องกดเพิ่ม
        setSelected((current) => current ?? topics[0]?.id ?? null);
      }),
    []
  );

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  // โหลดรายละเอียดของหัวข้อที่เลือก ฝ่ายธุรการจะไม่ยิงสองเส้นทางที่ต้องเป็นผู้ดูแล
  useEffect(() => {
    if (!selected) return;
    setSummary(null);
    setPending(null);
    setResponses(null);
    setTab('summary');

    api.adminSurveySummary(selected).then(setSummary);
    if (canSee) {
      api.adminSurveyPending(selected).then(({ pending }) => setPending(pending));
      api.adminSurveyResponses(selected).then(setResponses);
    }
  }, [selected, canSee]);

  const topic = topics?.find((item) => item.id === selected);

  async function download() {
    setBusy(true);
    try {
      // โหลดตัวสร้างไฟล์ตอนกดเท่านั้น ไม่ต้องให้ทุกคนที่เปิดหน้าแบกไปด้วย
      const { downloadRegistrationReport } = await import('../../lib/registrationReport');
      downloadRegistrationReport({
        topic: summary.topic,
        rows: summary.rows,
        total: summary.total,
        pending: canSee ? pending || [] : undefined,
        company: 'KOBELCO',
      });
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    setRemindOpen(false);
    const { sent } = await api.adminRemindSurvey(selected);
    toast(`ส่งแจ้งเตือนถึง ${num(sent)} คนแล้ว`, 'primary');
  }

  async function remove() {
    const target = removing;
    setRemoving(null);
    await api.adminDeleteSurvey(target.id);
    toast('ลบหัวข้อแล้ว');
    setSelected(null);
    loadTopics();
  }

  const actions = isAdmin ? (
    <button
      onClick={() => {
        setEditing(null);
        setFormOpen(true);
      }}
      className="btn-primary btn-sm"
    >
      <Icon.Plus size={16} /> สร้างหัวข้อ
    </button>
  ) : null;

  return (
    <AdminShell title="สรุปการลงทะเบียน" breadcrumb="รายงาน" actions={actions}>
      {!topics ? (
        <Spinner />
      ) : topics.length === 0 ? (
        <EmptyState
          icon={Icon.Grid}
          title="ยังไม่มีหัวข้อ"
          hint={isAdmin ? 'กดปุ่มสร้างหัวข้อเพื่อเริ่มเก็บข้อมูล' : 'รอผู้ดูแลระบบสร้างหัวข้อก่อน'}
        />
      ) : (
        <div className="space-y-4">
          {/* เลือกหัวข้อ */}
          <div className="flex flex-wrap gap-2">
            {topics.map((item) => {
              const badge = STATUS_BADGE[item.status] || STATUS_BADGE.open;
              const active = item.id === selected;

              return (
                <button
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className={`rounded-card border px-4 py-3 text-left transition-colors ${
                    active ? 'border-primary bg-primary-wash' : 'border-line bg-white hover:bg-page'
                  }`}
                >
                  <span className="block font-semibold text-ink">{item.title}</span>
                  <span className="mt-1 flex items-center gap-2 text-2xs text-muted">
                    <Badge className={badge.className}>{badge.label}</Badge>
                    {KIND_LABEL[item.kind] || item.kind}
                    {item.anonymous && <span>· ไม่ระบุตัวตน</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {!summary ? (
            <Spinner />
          ) : (
            <>
              {/* หัวรายงานและปุ่มทำงาน */}
              <section className="rounded-card border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-ink">
                      {summary.topic.heading || summary.topic.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {summary.topic.revision}
                      {summary.topic.as_of_label && ` · ${summary.topic.as_of_label}`}
                      {` · ข้อมูล ณ ${thaiDate(new Date())}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button onClick={download} disabled={busy} className="btn-primary btn-sm">
                      <Icon.Export size={16} />
                      {busy ? 'กำลังสร้างไฟล์' : 'ดาวน์โหลด Excel'}
                    </button>

                    {isAdmin && (
                      <>
                        <button
                          onClick={() => setRemindOpen(true)}
                          disabled={summary.total.not_complete === 0}
                          className="btn-ghost btn-sm"
                        >
                          <Icon.Megaphone size={16} /> แจ้งเตือนคนที่ยังไม่ทำ
                        </button>
                        <button
                          onClick={() => {
                            setEditing(topic);
                            setFormOpen(true);
                          }}
                          className="btn-ghost btn-sm"
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => setRemoving(topic)}
                          className="btn-ghost btn-sm text-danger"
                        >
                          <Icon.Trash size={16} /> ลบ
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* ยอดรวม */}
                <dl className="mt-4 grid gap-3 sm:grid-cols-4">
                  {[
                    ['พนักงานทั้งหมด', num(summary.total.manpower), 'text-ink'],
                    ['ทำแล้ว', num(summary.total.completed), 'text-success'],
                    ['ยังไม่ได้ทำ', num(summary.total.not_complete), 'text-danger'],
                    ['ความคืบหน้า', `${Math.round(summary.total.rate * 100)}%`, 'text-primary'],
                  ].map(([label, value, tone]) => (
                    <div key={label} className="rounded-[10px] bg-page p-3">
                      <dt className="text-2xs text-muted">{label}</dt>
                      <dd className={`mt-1 text-xl font-bold ${tone}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              {/* แท็บ: ผู้ดูแลเห็นครบ ฝ่ายธุรการเห็นแค่สรุป */}
              {canSee && (
                <div className="flex gap-2">
                  {[
                    ['summary', 'สรุปรายแผนก'],
                    ['pending', `ยังไม่ได้ทำ (${num(pending?.length || 0)})`],
                    ['responses', `ความคิดเห็น (${num(responses?.total || 0)})`],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={`rounded-pill px-4 py-2 text-sm ${
                        tab === key ? 'bg-primary font-semibold text-white' : 'bg-white text-slate'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {tab === 'summary' && (
                <div className="overflow-x-auto rounded-card border border-line bg-white">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th">Location</th>
                        <th className="th">Section</th>
                        <th className="th text-center">Manpower</th>
                        <th className="th text-center">Completed</th>
                        <th className="th text-center">Not Complete</th>
                        <th className="th">Completion Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.rows.map((row) => (
                        <tr key={`${row.location}-${row.section}`}>
                          <td className="td">{row.location}</td>
                          <td className="td">{row.section}</td>
                          <td className="td text-center">{num(row.manpower)}</td>
                          <td className="td text-center">{num(row.completed)}</td>
                          <td
                            className={`td text-center ${
                              row.not_complete > 0 ? 'font-semibold text-danger' : ''
                            }`}
                          >
                            {num(row.not_complete)}
                          </td>
                          <td className="td">
                            <RateCell rate={row.rate} />
                          </td>
                        </tr>
                      ))}

                      <tr className="bg-page font-semibold">
                        <td className="td" colSpan={2}>
                          Grand Total
                        </td>
                        <td className="td text-center">{num(summary.total.manpower)}</td>
                        <td className="td text-center">{num(summary.total.completed)}</td>
                        <td className="td text-center">{num(summary.total.not_complete)}</td>
                        <td className="td">
                          <RateCell rate={summary.total.rate} />
                        </td>
                      </tr>
                    </tbody>
                  </table>


                </div>
              )}

              {canSee && tab === 'pending' && (
                <div className="overflow-x-auto rounded-card border border-line bg-white">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th w-16">ลำดับ</th>
                        <th className="th">รหัสพนักงาน</th>
                        <th className="th">ชื่อ - นามสกุล</th>
                        <th className="th">ตำแหน่ง</th>
                        <th className="th">แผนก</th>
                        <th className="th">สาขา</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pending || []).map((person, index) => (
                        <tr key={person.employee_code}>
                          <td className="td text-center">{index + 1}</td>
                          <td className="td">{person.employee_code}</td>
                          <td className="td">{person.display_name}</td>
                          <td className="td">{person.position || '-'}</td>
                          <td className="td">{person.department || '-'}</td>
                          <td className="td">{person.branch || '-'}</td>
                        </tr>
                      ))}
                      {pending?.length === 0 && (
                        <tr>
                          <td className="td py-10 text-center text-muted" colSpan={6}>
                            ทุกคนทำครบแล้ว
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {canSee && tab === 'responses' && (
                <div className="rounded-card border border-line bg-white p-5">
                  {responses?.anonymous && (
                    <p className="mb-4 flex items-start gap-2 rounded-[10px] bg-page p-3 text-2xs text-muted">
                      <span className="mt-0.5 shrink-0">
                        <Icon.Lock size={14} />
                      </span>
                      หัวข้อนี้ตั้งเป็นไม่ระบุตัวตน ระบบจึงไม่ส่งชื่อผู้ตอบมาให้
                      แม้แต่กับผู้ดูแลระบบ แสดงได้เพียงแผนกที่ตอบมา
                    </p>
                  )}

                  <ul className="space-y-3">
                    {(responses?.responses || [])
                      .filter((row) => row.comment)
                      .map((row) => (
                        <li key={row.id} className="rounded-[10px] border border-line p-3">
                          <p className="whitespace-pre-line text-sm text-ink">{row.comment}</p>
                          <p className="mt-2 text-2xs text-muted">
                            {row.branch || '-'} · {row.department || '-'} ·{' '}
                            {thaiDate(row.submitted_at)}
                            {row.display_name && ` · ${row.display_name}`}
                          </p>
                        </li>
                      ))}
                  </ul>

                  {(responses?.responses || []).every((row) => !row.comment) && (
                    <p className="py-6 text-center text-sm text-muted">ยังไม่มีใครเขียนความคิดเห็น</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <TopicForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          loadTopics();
          if (selected) api.adminSurveySummary(selected).then(setSummary);
        }}
      />

      <ConfirmDialog
        open={!!removing}
        title="ลบหัวข้อนี้"
        message={`ลบ "${removing?.title}" พร้อมคำตอบทั้งหมดใช่ไหม การลบย้อนกลับไม่ได้`}
        confirmLabel="ลบ"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />

      <ConfirmDialog
        open={remindOpen}
        tone="primary"
        title="แจ้งเตือนคนที่ยังไม่ทำ"
        message={`ส่งแจ้งเตือนถึงพนักงาน ${num(
          summary?.total.not_complete || 0
        )} คนที่ยังไม่ได้ทำรายการนี้`}
        confirmLabel="ส่งแจ้งเตือน"
        onConfirm={remind}
        onCancel={() => setRemindOpen(false)}
      />
    </AdminShell>
  );
}
