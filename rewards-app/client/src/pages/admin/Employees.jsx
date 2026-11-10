import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import {
  Avatar,
  Badge,
  Modal,
  Notice,
  Pagination,
  SearchInput,
  Spinner,
  useToast,
} from '../../components/ui';
import { Icon } from '../../components/icons';
import { STATUS_STYLE, TIER_STYLE, dateTime, num, signedPoints, thaiDate } from '../../lib/format';

const EMPTY_FORM = {
  employeeCode: '',
  displayName: '',
  email: '',
  phone: '',
  birthDate: '',
  position: '',
  department: '',
  branch: '',
  tier: 'Member',
  status: 'Active',
};

function EmployeeForm({ open, onClose, editing, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      editing
        ? {
            employeeCode: editing.employee_code,
            displayName: editing.display_name,
            email: editing.email,
            phone: editing.phone || '',
            birthDate: editing.birth_date ? editing.birth_date.slice(0, 10) : '',
            position: editing.position || '',
            department: editing.department || '',
            branch: editing.branch || '',
            tier: editing.tier,
            status: editing.status,
          }
        : EMPTY_FORM
    );
  }, [open, editing]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing) await api.adminUpdateEmployee(editing.id, form);
      else await api.adminCreateEmployee(form);
      toast(editing ? 'บันทึกข้อมูลแล้ว' : 'เพิ่มพนักงานแล้ว', 'primary');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <form onSubmit={submit} className="p-6">
        <h2 className="text-xl font-bold text-ink">{editing ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงาน'}</h2>
        <p className="mt-1 text-sm text-muted">
          {editing ? 'ปรับปรุงข้อมูลส่วนตัวและข้อมูลองค์กรของพนักงาน' : 'เพิ่มข้อมูลพนักงานเข้าสู่ระบบ'}
        </p>

        {error && (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        )}

        <h3 className="mt-5 font-semibold text-primary">ข้อมูลส่วนตัว</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="employeeCode">
              รหัสพนักงาน *
            </label>
            <input
              id="employeeCode"
              className="field"
              value={form.employeeCode}
              onChange={set('employeeCode')}
              required
              disabled={!!editing}
            />
          </div>
          <div>
            <label className="label" htmlFor="displayName">
              ชื่อ - สกุล *
            </label>
            <input id="displayName" className="field" value={form.displayName} onChange={set('displayName')} required />
          </div>
          <div>
            <label className="label" htmlFor="email">
              อีเมล *
            </label>
            <input id="email" type="email" className="field" value={form.email} onChange={set('email')} required />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              เบอร์โทรศัพท์
            </label>
            <input id="phone" className="field" value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className="label" htmlFor="birthDate">
              วันเกิด
            </label>
            <input id="birthDate" type="date" className="field" value={form.birthDate} onChange={set('birthDate')} />
          </div>
        </div>

        <h3 className="mt-6 font-semibold text-primary">ข้อมูลองค์กร</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="position">
              ตำแหน่ง
            </label>
            <input id="position" className="field" value={form.position} onChange={set('position')} />
          </div>
          <div>
            <label className="label" htmlFor="department">
              แผนก
            </label>
            <input id="department" className="field" value={form.department} onChange={set('department')} />
          </div>
          <div>
            <label className="label" htmlFor="branch">
              สาขา
            </label>
            <input id="branch" className="field" value={form.branch} onChange={set('branch')} />
          </div>
          <div>
            <label className="label" htmlFor="tier">
              ระดับสมาชิก
            </label>
            <select id="tier" className="field" value={form.tier} onChange={set('tier')}>
              {['Member', 'Silver', 'Elite'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="status">
              สถานะ
            </label>
            <select id="status" className="field" value={form.status} onChange={set('status')}>
              {['Active', 'Inactive'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'กำลังบันทึก' : 'บันทึก'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EmployeeDetail({ id, onClose, onEdit }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('info');

  useEffect(() => {
    setData(null);
    if (id) api.adminEmployee(id).then(setData);
  }, [id]);

  return (
    <Modal open={!!id} onClose={onClose} size="xl">
      {!data ? (
        <Spinner />
      ) : (
        <div className="p-6">
          <h2 className="text-xl font-bold text-primary">รายละเอียดพนักงาน</h2>

          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-card border border-line p-4">
            <Avatar name={data.user.display_name} size={56} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{data.user.display_name}</p>
              <p className="text-sm text-muted">{data.user.employee_code}</p>
              <p className="text-sm text-muted">
                {data.user.position} • {data.user.department}
              </p>
            </div>
            <div className="text-sm">
              <p className="text-muted">Membership</p>
              <Badge className={TIER_STYLE[data.user.tier]}>{data.user.tier}</Badge>
            </div>
            <div className="text-sm">
              <p className="text-muted">คะแนนสะสม</p>
              <p className="font-bold text-primary">{num(data.user.points)} คะแนน</p>
            </div>
            <Badge className={STATUS_STYLE[data.user.status]}>{data.user.status}</Badge>
            <button onClick={() => onEdit(data.user)} className="btn-primary btn-sm">
              แก้ไขข้อมูล
            </button>
          </div>

          <div className="mt-5 flex gap-5 border-b border-line">
            {[
              { value: 'info', label: 'ข้อมูลทั่วไป' },
              { value: 'points', label: 'คะแนน' },
              { value: 'events', label: 'กิจกรรม' },
              { value: 'rewards', label: 'ของรางวัล' },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setTab(item.value)}
                className={`-mb-px border-b-2 pb-2 text-sm font-semibold ${
                  tab === item.value ? 'border-primary text-primary' : 'border-transparent text-slate'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === 'info' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <dl className="card space-y-2 p-4 text-sm">
                  <p className="font-semibold text-primary">ข้อมูลส่วนตัว</p>
                  {[
                    ['ชื่อ - สกุล', data.user.display_name],
                    ['รหัสพนักงาน', data.user.employee_code],
                    ['อีเมล', data.user.email],
                    ['เบอร์โทรศัพท์', data.user.phone || '-'],
                    ['วันเกิด', data.user.birth_date ? thaiDate(data.user.birth_date) : '-'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <dt className="w-32 shrink-0 text-muted">{k}</dt>
                      <dd className="text-slate">{v}</dd>
                    </div>
                  ))}
                </dl>

                <dl className="card space-y-2 p-4 text-sm">
                  <p className="font-semibold text-primary">ข้อมูลองค์กร</p>
                  {[
                    ['ตำแหน่ง', data.user.position || '-'],
                    ['แผนก', data.user.department || '-'],
                    ['สาขา', data.user.branch || '-'],
                    ['ระดับสมาชิก', data.user.tier],
                    ['สถานะ', data.user.status],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <dt className="w-32 shrink-0 text-muted">{k}</dt>
                      <dd className="text-slate">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {tab === 'points' && (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">รายการ</th>
                    <th className="th">วันที่ทำรายการ</th>
                    <th className="th">คะแนน</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="td">{tx.title}</td>
                      <td className="td">{dateTime(tx.created_at)}</td>
                      <td className={`td font-semibold ${tx.points > 0 ? 'text-success' : 'text-danger'}`}>
                        {signedPoints(tx.points)}
                      </td>
                    </tr>
                  ))}
                  {data.transactions.length === 0 && (
                    <tr>
                      <td className="td text-center text-muted" colSpan={3}>
                        ยังไม่มีรายการคะแนน
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {tab === 'events' && (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">กิจกรรม</th>
                    <th className="th">วันที่จัด</th>
                    <th className="th">คะแนน</th>
                    <th className="th">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((event, i) => (
                    <tr key={i}>
                      <td className="td">{event.title}</td>
                      <td className="td">{thaiDate(event.event_date)}</td>
                      <td className="td">+ {num(event.points)}</td>
                      <td className="td">
                        <Badge className={event.status === 'attended' ? 'bg-success-wash text-success' : 'bg-line text-slate'}>
                          {event.status === 'attended' ? 'เข้าร่วมแล้ว' : 'ลงทะเบียนแล้ว'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {data.events.length === 0 && (
                    <tr>
                      <td className="td text-center text-muted" colSpan={4}>
                        ยังไม่เคยลงทะเบียนกิจกรรม
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {tab === 'rewards' && (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">รหัสอ้างอิง</th>
                    <th className="th">ของรางวัล</th>
                    <th className="th">คะแนนที่ใช้</th>
                    <th className="th">วันที่แลก</th>
                    <th className="th">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.redemptions.map((row) => (
                    <tr key={row.ref_code}>
                      <td className="td">{row.ref_code}</td>
                      <td className="td">{row.name}</td>
                      <td className="td">{num(row.points_used)}</td>
                      <td className="td">{dateTime(row.redeemed_at)}</td>
                      <td className="td">
                        <Badge className={row.status === 'received' ? 'bg-success-wash text-success' : 'bg-gold-wash text-gold-ink'}>
                          {row.status === 'received' ? 'รับแล้ว' : 'รอรับของ'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {data.redemptions.length === 0 && (
                    <tr>
                      <td className="td text-center text-muted" colSpan={5}>
                        ยังไม่เคยแลกของรางวัล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Employees() {
  const [filters, setFilters] = useState({ q: '', department: '', branch: '', status: '', tier: '' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(() => {
    api.adminEmployees({ ...filters, page, limit }).then(setData);
  }, [filters, page, limit]);

  useEffect(() => {
    const timer = setTimeout(load, filters.q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.q]);

  const setFilter = (key) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: e.target.value }));
  };

  const reset = () => {
    setFilters({ q: '', department: '', branch: '', status: '', tier: '' });
    setPage(1);
  };

  return (
    <AdminShell title="จัดการพนักงาน">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px] flex-1">
            <SearchInput
              value={filters.q}
              onChange={(v) => {
                setPage(1);
                setFilters((f) => ({ ...f, q: v }));
              }}
              placeholder="ค้นหาพนักงาน"
            />
          </div>
          <button className="btn-ghost btn-sm" onClick={() => window.print()}>
            <Icon.Export size={16} /> Export
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Icon.Plus size={16} /> เพิ่มพนักงาน
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {[
            { key: 'department', label: 'แผนก', options: data?.departments || [] },
            { key: 'branch', label: 'สาขา', options: data?.branches || [] },
            { key: 'status', label: 'สถานะ', options: ['Active', 'Inactive'] },
            { key: 'tier', label: 'ระดับสมาชิก', options: ['Member', 'Silver', 'Elite'] },
          ].map((filter) => (
            <label key={filter.key} className="flex items-center gap-2">
              <span className="text-slate">{filter.label}</span>
              <select value={filters[filter.key]} onChange={setFilter(filter.key)} className="field h-9 w-36 py-0">
                <option value="">ทั้งหมด</option>
                {filter.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <button onClick={reset} className="ml-auto flex items-center gap-1.5 text-primary">
            <Icon.Refresh size={16} /> รีเซ็ต
          </button>
        </div>

        <section className="card overflow-hidden">
          <p className="px-4 py-3 font-semibold text-ink">พบทั้งหมด {num(data?.total)} รายการ</p>

          {!data ? (
            <Spinner />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">รหัสพนักงาน</th>
                      <th className="th">ชื่อ - นามสกุล</th>
                      <th className="th">แผนก</th>
                      <th className="th">ตำแหน่ง</th>
                      <th className="th">สาขา</th>
                      <th className="th">ระดับสมาชิก</th>
                      <th className="th">สถานะ</th>
                      <th className="th" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-primary-wash/40">
                        <td className="td">{emp.employee_code}</td>
                        <td className="td">{emp.display_name}</td>
                        <td className="td">{emp.department}</td>
                        <td className="td">{emp.position}</td>
                        <td className="td">{emp.branch}</td>
                        <td className="td">
                          <Badge className={TIER_STYLE[emp.tier]}>{emp.tier}</Badge>
                        </td>
                        <td className="td">
                          <Badge className={STATUS_STYLE[emp.status]}>{emp.status}</Badge>
                        </td>
                        <td className="td">
                          <button
                            onClick={() => setDetailId(emp.id)}
                            className="text-muted hover:text-primary"
                            aria-label={`ดูรายละเอียดของ ${emp.display_name}`}
                          >
                            <Icon.Next size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {data.employees.length === 0 && (
                      <tr>
                        <td className="td text-center text-muted" colSpan={8}>
                          ไม่พบพนักงานที่ตรงกับเงื่อนไข
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line">
                <label className="flex items-center gap-2 px-4 text-sm text-slate">
                  แสดงต่อหน้า
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    className="field h-8 w-20 py-0"
                  >
                    {[10, 20, 50].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  รายการ
                </label>
                <Pagination page={data.page} total={data.total} limit={data.limit} onChange={setPage} />
              </div>
            </>
          )}
        </section>
      </div>

      <EmployeeForm open={formOpen} editing={editing} onClose={() => setFormOpen(false)} onSaved={load} />

      <EmployeeDetail
        id={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(user) => {
          setDetailId(null);
          setEditing(user);
          setFormOpen(true);
        }}
      />
    </AdminShell>
  );
}
