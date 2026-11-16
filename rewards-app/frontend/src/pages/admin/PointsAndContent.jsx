import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Select } from '../../components/ComboBox';
import {
  Badge,
  ConfirmDialog,
  Modal,
  Notice,
  Pagination,
  SearchInput,
  Spinner,
  useToast,
} from '../../components/ui';
import { Icon } from '../../components/icons';
import { dateTime, num, signedPoints, thaiDate } from '../../lib/format';
import { canAdjustPoints } from '../../lib/org';
import { SpecialPointIcon } from '../../components/SpecialPoints';
import { useAuth } from '../../context/AuthContext';

export function AdminPoints() {
  const toast = useToast();
  const { user } = useAuth();

  /*
   * สิทธิ์ปรับคะแนนผูกกับตำแหน่งงาน ไม่ใช่แค่การเป็นผู้ดูแลระบบ
   * role admin ทำได้เสมอ คนอื่นต้องมีตำแหน่งตั้งแต่ Chief Engineer ขึ้นไป
   *
   * ซ่อนปุ่มที่หน้าจอเป็นแค่ความสะดวก การกันจริงอยู่ที่เซิร์ฟเวอร์
   * (CanAdjustPoints ใน backend/controllers/positions.go)
   */
  const mayAdjust = canAdjustPoints(user);

  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [form, setForm] = useState({
    employee: '',
    points: '',
    title: '',
    pointKind: 'point',
    expireAt: '',
  });
  const [error, setError] = useState('');
  const [reset, setReset] = useState(null);

  const load = useCallback(() => {
    api.adminPoints({ q, kind, page, limit: 20 }).then(setData);
    api.adminResetStatus().then(setReset);
  }, [q, kind, page]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  async function adjust(event) {
    event.preventDefault();
    setError('');
    try {
      // หาผู้ใช้จากรหัสพนักงานก่อน แล้วค่อยปรับคะแนน
      const { employees } = await api.adminEmployees({ q: form.employee, limit: 5 });
      const target = employees.find(
        (e) => e.employee_code.toLowerCase() === form.employee.trim().toLowerCase()
      );
      if (!target) return setError('ไม่พบพนักงานรหัสนี้');

      await api.adminAdjustPoints({
        userId: target.id,
        points: Number(form.points),
        title: form.title || 'ปรับคะแนนโดยผู้ดูแลระบบ',
        pointKind: form.pointKind,
        // ส่งวันหมดอายุเฉพาะตอนเพิ่มคะแนนพิเศษ การหักคืนไม่ควรไปเลื่อนวันหมดอายุ
        expireAt: form.pointKind === 'special' ? form.expireAt : '',
      });
      toast(`ปรับคะแนนให้ ${target.display_name} แล้ว`, 'primary');
      setAdjustOpen(false);
      setForm({ employee: '', points: '', title: '', pointKind: 'point', expireAt: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  /*
    ตัดยอดคะแนนประจำปีด้วยมือ

    ปกติไม่ต้องกด ระบบตรวจทุกชั่วโมงและทำให้เองเมื่อถึงวันที่ตั้งไว้
    ปุ่มนี้มีไว้เผื่อต้องการตัดก่อนกำหนด หรือกำหนดผ่านไปแล้วตอนเซิร์ฟเวอร์ปิดอยู่
  */
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function runAnnualReset() {
    setResetting(true);
    try {
      const result = await api.adminAnnualReset();
      toast(
        `ตัดยอดเรียบร้อย ${num(result.total)} บัญชี · คงระดับ ${num(result.kept)} · ลดระดับ ${num(result.demoted)}`,
        'primary'
      );
      setConfirmReset(false);
      load();
    } catch (err) {
      toast(err.message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <AdminShell
      title="จัดการคะแนน"
      actions={
        <div className="flex gap-2">
          {/* ตัดยอดประจำปีย้อนกลับไม่ได้และกระทบทุกคนในระบบ
              จึงใช้สิทธิ์ชุดเดียวกับการปรับคะแนน คือต้องอยู่ในแผนกหลังบ้าน
              และมีตำแหน่งตั้งแต่ Chief Officer ขึ้นไป */}
          {mayAdjust && (
            <button onClick={() => setConfirmReset(true)} className="btn-ghost btn-sm">
              <Icon.Refresh size={16} /> ตัดยอดคะแนนประจำปี
            </button>
          )}
          {mayAdjust && (
            <button onClick={() => setAdjustOpen(true)} className="btn-primary btn-sm">
              <Icon.Plus size={16} /> ปรับคะแนน
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {reset && (
          <section className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
            <p className="text-slate">
              ตัดยอดคะแนนรอบถัดไป : <b className="text-ink">{thaiDate(reset.nextResetAt)}</b>
            </p>
            <p className="text-slate">
              ตัดยอดล่าสุด :{' '}
              <b className="text-ink">{reset.lastResetYear ? `ปี ${reset.lastResetYear}` : 'ยังไม่เคย'}</b>
            </p>
            <p className={reset.atRisk > 0 ? 'text-gold' : 'text-slate'}>
              เสี่ยงถูกลดระดับ : <b>{num(reset.atRisk)}</b> คน
            </p>
            <p className="w-full text-2xs text-muted">
              ระบบรีเซ็ตคะแนนอัตโนมัติเมื่อสิ้นปี โดยระดับ Silver ต้องได้รับคะแนนอย่างน้อย 500 คะแนน
              และระดับ Elite อย่างน้อย 1,000 คะแนนภายในรอบปี เพื่อรักษาระดับสมาชิก
            </p>
          </section>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px] flex-1">
            <SearchInput
              value={q}
              onChange={(v) => {
                setPage(1);
                setQ(v);
              }}
              placeholder="ค้นหาจากชื่อหรือรหัสพนักงาน"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate">
            ประเภท
            <div className="w-40">
              <Select
                options={[
                  { value: '', label: 'ทั้งหมด' },
                  { value: 'earn', label: 'ได้รับคะแนน' },
                  { value: 'redeem', label: 'แลกของรางวัล' },
                  { value: 'adjust', label: 'ปรับโดยแอดมิน' },
                ]}
                value={kind}
                onChange={(value) => {
                  setPage(1);
                  setKind(value);
                }}
                placeholder="ทั้งหมด"
              />
            </div>
          </label>
        </div>

        <section className="card overflow-hidden">
          {!data ? (
            <Spinner />
          ) : (
            <>
              <p className="px-4 py-3 font-semibold text-ink">พบทั้งหมด {num(data.total)} รายการ</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">ลำดับ</th>
                      <th className="th">รหัสพนักงาน</th>
                      <th className="th">ชื่อ-สกุล</th>
                      <th className="th">แผนก</th>
                      <th className="th">รายการ</th>
                      <th className="th">ประเภท</th>
                      <th className="th">คะแนน</th>
                      <th className="th">เวลา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tx, index) => (
                      <tr key={tx.id}>
                        <td className="td">{(data.page - 1) * data.limit + index + 1}</td>
                        <td className="td">{tx.employee_code}</td>
                        <td className="td">{tx.display_name}</td>
                        <td className="td">{tx.department}</td>
                        <td className="td max-w-xs truncate">{tx.title}</td>
                        <td className="td">
                          <Badge className={tx.points > 0 ? 'bg-success-wash text-success' : 'bg-danger-wash text-danger'}>
                            {tx.kind === 'earn' ? 'ได้รับ' : tx.kind === 'redeem' ? 'แลกรางวัล' : 'ปรับคะแนน'}
                          </Badge>
                        </td>
                        <td className={`td font-semibold ${tx.points > 0 ? 'text-success' : 'text-danger'}`}>
                          {signedPoints(tx.points)}
                        </td>
                        <td className="td">{dateTime(tx.created_at)}</td>
                      </tr>
                    ))}
                    {data.transactions.length === 0 && (
                      <tr>
                        <td className="td text-center text-muted" colSpan={8}>
                          ไม่พบรายการคะแนน
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-line">
                <Pagination page={data.page} total={data.total} limit={data.limit} onChange={setPage} />
              </div>
            </>
          )}
        </section>
      </div>

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} size="sm">
        <form onSubmit={adjust} className="p-6">
          <h2 className="text-lg font-bold text-ink">ปรับคะแนนพนักงาน</h2>

          {error && (
            <div className="mt-3">
              <Notice>{error}</Notice>
            </div>
          )}

          <label className="label mt-4" htmlFor="employee">
            รหัสพนักงาน
          </label>
          <input
            id="employee"
            className="field"
            value={form.employee}
            onChange={(e) => setForm({ ...form, employee: e.target.value })}
            required
          />

          <label className="label mt-3" htmlFor="adjustKind">
            ปรับคะแนนแบบไหน
          </label>
          <Select
            id="adjustKind"
            options={[
              { value: 'point', label: 'คะแนนปกติ' },
              { value: 'special', label: 'คะแนนพิเศษ' },
            ]}
            value={form.pointKind}
            onChange={(value) => setForm({ ...form, pointKind: value })}
          />
          {form.pointKind === 'special' && (
            <>
              <p className="mt-1 flex items-center gap-1.5 text-2xs text-muted">
                <SpecialPointIcon size={14} />
                คะแนนพิเศษไม่นำไปคิดระดับสมาชิก และไม่ถูกตัดยอดพร้อมคะแนนปกติตอนสิ้นปี
              </p>

              <label className="label mt-3" htmlFor="adjustExpire">
                คะแนนพิเศษหมดอายุวันที่
              </label>
              <input
                id="adjustExpire"
                type="date"
                className="field"
                value={form.expireAt}
                onChange={(e) => setForm({ ...form, expireAt: e.target.value })}
              />
              <p className="mt-1 text-2xs text-muted">
                เว้นว่างไว้ = ไม่มีวันหมดอายุ · พ้นวันนี้แล้วคะแนนพิเศษของพนักงานคนนี้จะถูกตัดเหลือ 0
                <br />
                ถ้าเขามีวันหมดอายุเดิมอยู่แล้ว ระบบจะเก็บวันที่ไกลกว่าไว้
                เพื่อไม่ให้คะแนนก้อนใหม่หายไปพร้อมก้อนเก่า
              </p>
            </>
          )}

          <label className="label mt-3" htmlFor="adjustPoints">
            จำนวนคะแนน
          </label>
          <input
            id="adjustPoints"
            type="number"
            className="field"
            value={form.points}
            onChange={(e) => setForm({ ...form, points: e.target.value })}
            required
          />
          {/* วางไว้ติดช่องที่กำลังกรอก ไม่ใช่ใต้หัวข้อหน้าต่าง
              คำแนะนำการกรอกอ่านตอนกรอกถึงจะมีประโยชน์ */}
          <p className="mt-1 text-2xs text-muted">ใส่จำนวนติดลบเพื่อหักคะแนน</p>

          <label className="label mt-3" htmlFor="reason">
            เหตุผล
          </label>
          <input
            id="reason"
            className="field"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <button type="submit" className="btn-primary mt-5 w-full">
            บันทึก
          </button>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmReset}
        tone="danger"
        busy={resetting}
        title="ตัดยอดคะแนนประจำปีตอนนี้เลยใช่ไหม"
        confirmLabel="ตัดยอดเลย"
        onConfirm={runAnnualReset}
        onCancel={() => setConfirmReset(false)}
      />
    </AdminShell>
  );
}

function SystemEventsTab() {
  const toast = useToast();
  const [events, setEvents] = useState(null);

  const load = useCallback(() => api.adminNotificationEvents().then(({ events }) => setEvents(events)), []);
  useEffect(() => {
    load();
  }, [load]);

  async function update(key, patch) {
    await api.adminUpdateNotificationEvent(key, patch);
    toast('บันทึกแล้ว', 'primary');
    load();
  }

  if (!events) return <Spinner />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">Event</th>
            <th className="th">Description</th>
            <th className="th">Channel</th>
            <th className="th">สถานะ</th>
            <th className="th">แก้ไขล่าสุด</th>
          </tr>
        </thead>
        <tbody>
          {events.map((row) => (
            <tr key={row.key}>
              <td className="td font-medium text-ink">{row.name}</td>
              <td className="td max-w-sm whitespace-normal">{row.description}</td>
              <td className="td">
                <div className="flex gap-2">
                  <button onClick={() => update(row.key, { inApp: !row.in_app })}>
                    <Badge className={row.in_app ? 'bg-primary-wash text-primary-dark' : 'bg-line text-muted'}>
                      In-App
                    </Badge>
                  </button>
                  <button onClick={() => update(row.key, { email: !row.email })}>
                    <Badge className={row.email ? 'bg-danger-wash text-danger' : 'bg-line text-muted'}>Email</Badge>
                  </button>
                </div>
              </td>
              <td className="td">
                <button onClick={() => update(row.key, { active: !row.active })}>
                  <Badge className={row.active ? 'bg-success-wash text-success' : 'bg-line text-slate'}>
                    {row.active ? 'Active' : 'Inactive'}
                  </Badge>
                </button>
              </td>
              <td className="td">{dateTime(row.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminNotifications() {
  const toast = useToast();
  const [tab, setTab] = useState('broadcast');
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', category: 'announce', channel: 'in-app' });
  const [error, setError] = useState('');

  const load = useCallback(() => api.adminNotifications().then(({ notifications }) => setItems(notifications)), []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await api.adminCreateNotification(form);
      toast('ส่งประกาศแล้ว', 'primary');
      setOpen(false);
      setForm({ title: '', body: '', category: 'announce', channel: 'in-app' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminShell
      title="ประกาศและเนื้อหา"
      breadcrumb="Notifications"
      actions={
        tab === 'broadcast' && (
          <button onClick={() => setOpen(true)} className="btn-primary btn-sm">
            <Icon.Plus size={16} /> สร้าง Notification
          </button>
        )
      }
    >
      <section className="card overflow-hidden">
        <h2 className="border-l-4 border-primary px-4 py-3 font-semibold text-ink">Notification</h2>

        <div className="flex gap-6 border-b border-line px-4">
          {[
            { value: 'broadcast', label: 'Broadcast', icon: Icon.Megaphone },
            { value: 'system', label: 'Systems Event', icon: Icon.Settings },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setTab(item.value)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm font-semibold ${
                tab === item.value ? 'border-primary text-primary' : 'border-transparent text-slate'
              }`}
            >
              <item.icon size={16} /> {item.label}
            </button>
          ))}
        </div>

        {tab === 'system' ? (
          <SystemEventsTab />
        ) : !items ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">หัวข้อ</th>
                  <th className="th">กลุ่มเป้าหมาย</th>
                  <th className="th">Channel</th>
                  <th className="th">หมวด</th>
                  <th className="th">เวลา</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className="td max-w-sm truncate">{row.title}</td>
                    <td className="td">{row.target_name || 'พนักงานทุกคน'}</td>
                    <td className="td">
                      <Badge className={row.channel === 'email' ? 'bg-danger-wash text-danger' : 'bg-primary-wash text-primary-dark'}>
                        {row.channel === 'email' ? 'Email' : 'In-App'}
                      </Badge>
                    </td>
                    <td className="td">{row.category}</td>
                    <td className="td">{dateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={open} onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="p-6">
          <h2 className="text-lg font-bold text-ink">สร้าง Notification</h2>
          <p className="mt-1 text-sm text-muted">ประกาศนี้จะส่งถึงพนักงานทุกคน</p>

          {error && (
            <div className="mt-3">
              <Notice>{error}</Notice>
            </div>
          )}

          <label className="label mt-4" htmlFor="notifTitle">
            หัวข้อ *
          </label>
          <input
            id="notifTitle"
            className="field"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />

          <label className="label mt-3" htmlFor="notifBody">
            รายละเอียด
          </label>
          <textarea
            id="notifBody"
            rows={3}
            className="field"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="notifCategory">
                หมวด
              </label>
              <Select
                id="notifCategory"
                options={[
                  { value: 'announce', label: 'ประกาศ' },
                  { value: 'event', label: 'กิจกรรม' },
                  { value: 'reward', label: 'ของรางวัล' },
                  { value: 'point', label: 'คะแนน' },
                ]}
                value={form.category}
                onChange={(value) => setForm({ ...form, category: value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="notifChannel">
                Channel
              </label>
              <Select
                id="notifChannel"
                options={['in-app', 'email']}
                value={form.channel}
                onChange={(value) => setForm({ ...form, channel: value })}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              ยกเลิก
            </button>
            <button type="submit" className="btn-primary">
              ส่งประกาศ
            </button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
