import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import Membership from './Membership';
import AdminShell from '../../components/AdminShell';
import { Badge, Modal, Notice, Pagination, SearchInput, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { STATUS_STYLE, dateTime, num } from '../../lib/format';

/* ---------- Admin Accounts ---------- */

function AccountsPage() {
  const toast = useToast();
  const [admins, setAdmins] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', displayName: '', email: '', department: '', position: '', password: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => api.adminAdmins().then(({ admins }) => setAdmins(admins)), []);
  useEffect(() => {
    load();
  }, [load]);

  function start(admin) {
    setEditing(admin);
    setError('');
    setForm(
      admin
        ? {
            username: admin.username,
            displayName: admin.display_name,
            email: admin.email,
            department: admin.department || '',
            position: admin.position || '',
            password: '',
          }
        : { username: '', displayName: '', email: '', department: '', position: '', password: '' }
    );
    setOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    try {
      if (editing) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await api.adminUpdateAdmin(editing.id, payload);
      } else {
        await api.adminCreateAdmin(form);
      }
      toast(editing ? 'บันทึกบัญชีแล้ว' : 'เพิ่มบัญชีผู้ดูแลแล้ว', 'primary');
      setOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleStatus(admin) {
    try {
      await api.adminUpdateAdmin(admin.id, { status: admin.status === 'Active' ? 'Inactive' : 'Active' });
      load();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <AdminShell
      title="ตั้งค่าระบบ"
      breadcrumb="Admin Accounts"
      actions={
        <button onClick={() => start(null)} className="btn-primary btn-sm">
          <Icon.Plus size={16} /> เพิ่มผู้ดูแลระบบ
        </button>
      }
    >
      <section className="card overflow-hidden">
        <h2 className="border-l-4 border-primary px-4 py-3 font-semibold text-ink">บัญชีผู้ดูแลระบบ</h2>

        {!admins ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">ชื่อผู้ใช้</th>
                  <th className="th">ชื่อ - สกุล</th>
                  <th className="th">อีเมล</th>
                  <th className="th">ตำแหน่ง</th>
                  <th className="th">สถานะ</th>
                  <th className="th">สร้างเมื่อ</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td className="td font-medium text-ink">{admin.username}</td>
                    <td className="td">{admin.display_name}</td>
                    <td className="td">{admin.email}</td>
                    <td className="td">{admin.position}</td>
                    <td className="td">
                      <button onClick={() => toggleStatus(admin)}>
                        <Badge className={STATUS_STYLE[admin.status]}>{admin.status}</Badge>
                      </button>
                    </td>
                    <td className="td">{dateTime(admin.created_at)}</td>
                    <td className="td">
                      <button onClick={() => start(admin)} className="text-primary">
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

      <Modal open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="p-6">
          <h2 className="text-lg font-bold text-ink">{editing ? 'แก้ไขบัญชีผู้ดูแล' : 'เพิ่มผู้ดูแลระบบ'}</h2>
          {error && (
            <div className="mt-3">
              <Notice>{error}</Notice>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="adminUsername">
                ชื่อผู้ใช้ *
              </label>
              <input
                id="adminUsername"
                className="field"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                disabled={!!editing}
              />
            </div>
            <div>
              <label className="label" htmlFor="adminName">
                ชื่อ - สกุล *
              </label>
              <input
                id="adminName"
                className="field"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="adminEmail">
                อีเมล *
              </label>
              <input
                id="adminEmail"
                type="email"
                className="field"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="adminDept">
                แผนก
              </label>
              <input
                id="adminDept"
                className="field"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="adminPosition">
                ตำแหน่ง
              </label>
              <input
                id="adminPosition"
                className="field"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="adminPassword">
                รหัสผ่าน {editing ? '(เว้นว่างถ้าไม่เปลี่ยน)' : '*'}
              </label>
              <input
                id="adminPassword"
                type="password"
                className="field"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editing}
                minLength={8}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              ยกเลิก
            </button>
            <button type="submit" className="btn-primary">
              บันทึก
            </button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}

/* ---------- Audit Logs ---------- */

function AuditPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => api.adminAuditLogs({ q, page, limit: 20 }).then(setData), q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [q, page]);

  return (
    <AdminShell title="ตั้งค่าระบบ" breadcrumb="Audit Logs">
      <div className="mb-4 max-w-sm">
        <SearchInput
          value={q}
          onChange={(v) => {
            setPage(1);
            setQ(v);
          }}
          placeholder="ค้นหาการกระทำหรือผู้ใช้"
        />
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
                    <th className="th">เวลา</th>
                    <th className="th">ผู้ดำเนินการ</th>
                    <th className="th">การกระทำ</th>
                    <th className="th">เป้าหมาย</th>
                    <th className="th">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((log) => (
                    <tr key={log.id}>
                      <td className="td">{dateTime(log.created_at)}</td>
                      <td className="td">{log.actor_name || 'ระบบ'}</td>
                      <td className="td">
                        <Badge className="bg-primary-wash text-primary-dark">{log.action}</Badge>
                      </td>
                      <td className="td">{log.target || '-'}</td>
                      <td className="td max-w-sm truncate">{log.detail || '-'}</td>
                    </tr>
                  ))}
                  {data.logs.length === 0 && (
                    <tr>
                      <td className="td text-center text-muted" colSpan={5}>
                        ยังไม่มีบันทึกการใช้งาน
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
    </AdminShell>
  );
}

/* ---------- System Settings ---------- */

function SystemPage() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [values, setValues] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminSettings().then(({ settings }) => {
      setSettings(settings);
      setValues(Object.fromEntries(settings.map((s) => [s.key, s.value])));
    });
  }, []);

  async function save(event) {
    event.preventDefault();
    try {
      const { settings } = await api.adminSaveSettings(values);
      setSettings(settings);
      toast('บันทึกการตั้งค่าแล้ว', 'primary');
    } catch (err) {
      setError(err.message);
    }
  }

  if (!settings) {
    return (
      <AdminShell title="ตั้งค่าระบบ" breadcrumb="System Settings">
        <Spinner />
      </AdminShell>
    );
  }

  return (
    <AdminShell title="ตั้งค่าระบบ" breadcrumb="System Settings">
      <form onSubmit={save} className="card max-w-3xl p-5">
        {error && (
          <div className="mb-3">
            <Notice>{error}</Notice>
          </div>
        )}

        <h2 className="font-semibold text-ink">ค่าตั้งทั่วไป</h2>
        <p className="mt-1 text-sm text-muted">ค่าเหล่านี้มีผลกับทั้งฝั่งพนักงานและการทำงานเบื้องหลัง</p>

        <div className="mt-5 space-y-4">
          {settings.map((setting) => (
            <div key={setting.key} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
              <label htmlFor={setting.key} className="text-[15px] text-slate">
                {setting.label}
                <span className="ml-2 text-2xs text-muted">{setting.key}</span>
              </label>

              {setting.kind === 'boolean' ? (
                <label className="flex items-center gap-2 text-sm text-slate">
                  <input
                    id={setting.key}
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={values[setting.key] === 'true'}
                    onChange={(e) => setValues({ ...values, [setting.key]: String(e.target.checked) })}
                  />
                  {values[setting.key] === 'true' ? 'เปิด' : 'ปิด'}
                </label>
              ) : (
                <input
                  id={setting.key}
                  type={setting.kind === 'number' ? 'number' : 'text'}
                  className="field"
                  value={values[setting.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [setting.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-2xs text-muted">
            แก้ไขล่าสุด {settings[0] ? dateTime(settings[0].updated_at) : '-'}
          </p>
          <button type="submit" className="btn-primary">
            บันทึกการตั้งค่า
          </button>
        </div>
      </form>
    </AdminShell>
  );
}

export default function AdminSettings() {
  const { key } = useParams();
  if (key === 'accounts') return <AccountsPage />;
  if (key === 'audit') return <AuditPage />;
  if (key === 'system') return <SystemPage />;
  return <Membership />;
}
