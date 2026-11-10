import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import {
  Avatar,
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
import { STATUS_STYLE, TIER_STYLE, dateTime, num, signedPoints, thaiDate } from '../../lib/format';

/* ---------- นำเข้าพนักงานจากไฟล์ Excel ---------- */

// หัวคอลัมน์ที่รองรับ เรียงตามลำดับที่ใช้เป็นค่าสำรองถ้าไฟล์ไม่มีหัวตารางที่จับคู่ได้
const IMPORT_COLUMNS = [
  { key: 'employeeCode', label: 'รหัสพนักงาน', match: (h) => h.includes('รหัสพนักงาน') },
  { key: 'displayName', label: 'ชื่อ-สกุล', match: (h) => h.includes('ชื่อ') },
  { key: 'email', label: 'อีเมล', match: (h) => h.includes('อีเมล') || h.toLowerCase().includes('email') },
  { key: 'position', label: 'ตำแหน่ง', match: (h) => h.includes('ตำแหน่ง') },
  { key: 'department', label: 'แผนก', match: (h) => h.includes('แผนก') },
  { key: 'branch', label: 'สาขา', match: (h) => h.includes('สาขา') },
  {
    key: 'password',
    label: 'รหัสผ่าน',
    match: (h) => h.includes('รหัสผ่าน') || h.toLowerCase().includes('password'),
  },
];

// จับคู่หัวตารางในไฟล์กับคอลัมน์ที่ต้องการ ถ้าจับคู่ไม่ได้ (เช่นไฟล์ไม่มีหัวตาราง)
// ใช้ตำแหน่งตามลำดับมาตรฐานแทน: รหัสพนักงาน ชื่อ-สกุล อีเมล ตำแหน่ง แผนก สาขา รหัสผ่าน
function mapImportColumns(headerRow) {
  const idxFor = {};
  (headerRow || []).forEach((raw, i) => {
    const h = (raw || '').toString();
    for (const col of IMPORT_COLUMNS) {
      if (!(col.key in idxFor) && col.match(h)) idxFor[col.key] = i;
    }
  });
  IMPORT_COLUMNS.forEach((col, i) => {
    if (!(col.key in idxFor)) idxFor[col.key] = i;
  });
  return idxFor;
}

// แปลงแถวดิบจากไฟล์ให้เป็นรายชื่อพนักงานพร้อมสถานะความพร้อมนำเข้า
function buildImportRows(sheetRows) {
  if (!sheetRows.length) return [];
  const idxFor = mapImportColumns(sheetRows[0]);
  const seenCodes = new Set();

  return sheetRows
    .slice(1)
    .map((row, i) => {
      const get = (key) => (row[idxFor[key]] ?? '').toString().trim();
      return {
        rowNumber: i + 2,
        employeeCode: get('employeeCode'),
        displayName: get('displayName'),
        email: get('email'),
        position: get('position'),
        department: get('department'),
        branch: get('branch'),
        password: get('password'),
      };
    })
    .filter((r) => r.employeeCode || r.displayName || r.email)
    .map((r) => {
      let issue = '';
      if (!r.employeeCode || !r.displayName) issue = 'ไม่มีรหัสพนักงานหรือชื่อ-สกุล';
      else if (seenCodes.has(r.employeeCode.toLowerCase())) issue = 'รหัสพนักงานซ้ำในไฟล์';
      if (!issue) seenCodes.add(r.employeeCode.toLowerCase());
      return { ...r, issue };
    });
}

function ImportEmployeesModal({ open, onClose, onImported }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState(null);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);

  function reset() {
    setFileName('');
    setRows(null);
    setParseError('');
    setImporting(false);
    setProgress(0);
    setResults(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onPickFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError('');
    setResults(null);
    setRows(null);
    try {
      const { readXlsxRows } = await import('../../lib/xlsx');
      const sheetRows = await readXlsxRows(file);
      setRows(buildImportRows(sheetRows));
    } catch (err) {
      setParseError(err.message || 'อ่านไฟล์ไม่สำเร็จ ตรวจสอบว่าเป็นไฟล์ .xlsx ที่ถูกต้อง');
    }
  }

  async function downloadTemplate() {
    const { downloadXlsx } = await import('../../lib/xlsx');
    downloadXlsx('แบบฟอร์มเพิ่มพนักงาน.xlsx', {
      sheetName: 'พนักงาน',
      widths: [14, 24, 26, 18, 18, 18, 16],
      rows: [
        IMPORT_COLUMNS.map((c) => c.label),
        ['EMP1001', 'สมชาย ใจดี', 'somchai@company.com', 'พนักงานขาย', 'ฝ่ายขาย', 'สาขาสีลม', ''],
      ],
    });
  }

  const validRows = (rows || []).filter((r) => !r.issue);

  async function runImport() {
    setImporting(true);
    setProgress(0);
    const success = [];
    const failed = [];

    for (const row of validRows) {
      try {
        await api.adminCreateEmployee({
          employeeCode: row.employeeCode,
          displayName: row.displayName,
          email: row.email,
          position: row.position,
          department: row.department,
          branch: row.branch,
          tier: 'Member',
          status: 'Active',
          ...(row.password ? { password: row.password } : {}),
        });
        success.push(row);
      } catch (err) {
        failed.push({ ...row, reason: err.message || 'บันทึกไม่สำเร็จ' });
      }
      setProgress((p) => p + 1);
    }

    setImporting(false);
    setResults({ success, failed });
    if (success.length) {
      toast(`นำเข้าพนักงานสำเร็จ ${success.length} คน`, 'primary');
      onImported();
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} size="xl">
      <div className="p-6">
        <h2 className="text-xl font-bold text-ink">อัปโหลดรายชื่อพนักงาน</h2>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-dashed border-line bg-primary-wash/30 p-4">
          <label className="btn-primary btn-sm cursor-pointer">
            <Icon.Import size={16} /> เลือกไฟล์ Excel
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              onChange={onPickFile}
              className="hidden"
            />
          </label>
          {fileName && <span className="text-sm text-slate">{fileName}</span>}
          <button type="button" onClick={downloadTemplate} className="ml-auto flex items-center gap-1.5 text-sm text-primary">
            <Icon.Export size={16} /> ดาวน์โหลดไฟล์ตัวอย่าง
          </button>
        </div>

        {parseError && (
          <div className="mt-3">
            <Notice>{parseError}</Notice>
          </div>
        )}

        {rows && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <p className="font-semibold text-ink">พบทั้งหมด {num(rows.length)} รายการ</p>
              <p className="text-success">พร้อมนำเข้า {num(validRows.length)}</p>
              {rows.length - validRows.length > 0 && (
                <p className="text-danger">ข้อมูลมีปัญหา {num(rows.length - validRows.length)}</p>
              )}
            </div>

            <div className="mt-3 max-h-80 overflow-y-auto rounded-card border border-line">
              <table className="w-full">
                <thead className="sticky top-0">
                  <tr>
                    <th className="th">ลำดับ</th>
                    <th className="th">รหัสพนักงาน</th>
                    <th className="th">ชื่อ-สกุล</th>
                    <th className="th">อีเมล</th>
                    <th className="th">ตำแหน่ง</th>
                    <th className="th">แผนก</th>
                    <th className="th">สาขา</th>
                    <th className="th">รหัสผ่าน</th>
                    <th className="th">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td className="td">{i + 1}</td>
                      <td className="td">{row.employeeCode || '-'}</td>
                      <td className="td">{row.displayName || '-'}</td>
                      <td className="td">{row.email || '-'}</td>
                      <td className="td">{row.position || '-'}</td>
                      <td className="td">{row.department || '-'}</td>
                      <td className="td">{row.branch || '-'}</td>
                      <td className="td">{row.password ? '••••••' : '(ใช้รหัสพนักงาน)'}</td>
                      <td className="td">
                        {row.issue ? (
                          <Badge className="bg-danger-wash text-danger">{row.issue}</Badge>
                        ) : (
                          <Badge className="bg-success-wash text-success">พร้อมนำเข้า</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {results && (
          <div className="mt-4">
            <Notice tone={results.failed.length ? 'warn' : 'info'}>
              นำเข้าสำเร็จ {results.success.length} คน
              {results.failed.length > 0 && ` · ไม่สำเร็จ ${results.failed.length} คน`}
            </Notice>
            {results.failed.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-danger">
                {results.failed.map((row) => (
                  <li key={row.rowNumber}>
                    แถวที่ {row.rowNumber} ({row.employeeCode}): {row.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={handleClose} className="btn-ghost">
            {results ? 'ปิด' : 'ยกเลิก'}
          </button>
          {rows && !results && (
            <button
              type="button"
              onClick={runImport}
              disabled={importing || validRows.length === 0}
              className="btn-primary"
            >
              {importing ? `กำลังนำเข้า ${progress}/${validRows.length}` : `นำเข้า ${validRows.length} รายการ`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

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
  password: '',
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
            password: '',
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
      // รหัสผ่านว่างแปลว่าไม่เปลี่ยน จึงไม่ส่งไป ไม่งั้นจะไปล้างรหัสเดิมทิ้ง
      const payload = { ...form };
      if (!payload.password) delete payload.password;

      if (editing) await api.adminUpdateEmployee(editing.id, payload);
      else await api.adminCreateEmployee(payload);
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
            <label className="label" htmlFor="password">
              รหัสผ่าน {editing ? '' : '*'}
            </label>
            {/* type text เพื่อให้ผู้ดูแลอ่านสิ่งที่พิมพ์ได้ จะได้ไม่พิมพ์ผิดแล้วไม่รู้ตัว
                ตอนแก้ไขช่องนี้ว่างเสมอ เพราะรหัสผ่านถูกเก็บแบบแปลงทางเดียว อ่านกลับมาไม่ได้ */}
            <input
              id="password"
              type="text"
              className="field"
              value={form.password}
              onChange={set('password')}
              required={!editing}
              autoComplete="new-password"
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
              อีเมล
            </label>
            <input id="email" type="email" className="field" value={form.email} onChange={set('email')} />
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

        <div className="mt-7 flex items-center justify-end gap-3">
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

function EmployeeDetail({ id, onClose, onEdit, onDeleted }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('info');
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setData(null);
    setConfirmOpen(false);
    if (id) api.adminEmployee(id).then(setData);
  }, [id]);

  async function remove() {
    setDeleting(true);
    try {
      await api.adminDeleteEmployee(data.user.id);
      toast('ลบพนักงานแล้ว');
      setConfirmOpen(false);
      onDeleted();
      onClose();
    } catch (err) {
      setConfirmOpen(false);
      toast(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
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
            <button onClick={() => setConfirmOpen(true)} disabled={deleting} className="btn-danger btn-sm">
              {deleting ? 'กำลังลบ' : 'ลบพนักงาน'}
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

    <ConfirmDialog
      open={confirmOpen}
      title="ลบข้อมูลพนักงาน"
      message={
        data ? (
          <>
            ต้องการลบพนักงาน <span className="font-semibold text-ink">"{data.user.display_name}"</span> ใช่หรือไม่
          </>
        ) : null
      }
      confirmLabel="ยืนยัน"
      cancelLabel="ยกเลิก"
      tone="danger"
      busy={deleting}
      onConfirm={remove}
      onCancel={() => setConfirmOpen(false)}
    />
    </>
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
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  /**
   * ดาวน์โหลดรายชื่อพนักงานเป็นไฟล์ Excel
   *
   * ดึงใหม่ทั้งหมดโดยไม่สนหน้าที่กำลังดูอยู่ แต่ยังใช้ตัวกรองเดิม
   * เพราะผู้ดูแลที่กรองเฉพาะแผนกหนึ่งไว้ย่อมอยากได้ไฟล์ของแผนกนั้น
   * ส่วนการแบ่งหน้าเป็นเรื่องของการดูบนจอ ไม่ควรทำให้ไฟล์ขาดคน
   */
  async function exportExcel() {
    setExporting(true);
    try {
      const { employees } = await api.adminEmployees({ ...filters, page: 1, limit: 10000 });

      // เรียงรหัสพนักงานจากน้อยไปมาก ใช้ตัวเทียบแบบรู้จักตัวเลข
      // รหัส 9 จึงมาก่อน 10 ไม่ใช่เรียงแบบข้อความที่ 10 มาก่อน 9
      const sorted = [...employees].sort((a, b) =>
        String(a.employee_code).localeCompare(String(b.employee_code), 'th', { numeric: true })
      );

      const { downloadXlsx } = await import('../../lib/xlsx');
      downloadXlsx('รายชื่อพนักงาน.xlsx', {
        sheetName: 'รายชื่อพนักงาน',
        widths: [8, 14, 30, 20, 20, 20, 14],
        rows: [
          ['ลำดับ', 'รหัสพนักงาน', 'ชื่อ - นามสกุล', 'แผนก', 'ตำแหน่ง', 'สาขา', 'ระดับสมาชิก'],
          ...sorted.map((row, index) => [
            String(index + 1),
            row.employee_code,
            row.display_name,
            row.department || '-',
            row.position || '-',
            row.branch || '-',
            row.tier,
          ]),
        ],
      });
    } finally {
      setExporting(false);
    }
  }

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
          <button className="btn-ghost btn-sm" onClick={() => setImportOpen(true)}>
            <Icon.Import size={16} /> อัปโหลด
          </button>
          <button className="btn-ghost btn-sm" onClick={exportExcel} disabled={exporting}>
            <Icon.Export size={16} /> {exporting ? 'กำลังสร้างไฟล์' : 'Export'}
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
                      <th className="th">ลำดับ</th>
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
                    {data.employees.map((emp, index) => (
                      <tr key={emp.id} className="hover:bg-primary-wash/40">
                        <td className="td">{(data.page - 1) * data.limit + index + 1}</td>
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
                        <td className="td text-center text-muted" colSpan={9}>
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

      <ImportEmployeesModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />

      <EmployeeDetail
        id={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(user) => {
          setDetailId(null);
          setEditing(user);
          setFormOpen(true);
        }}
        onDeleted={load}
      />
    </AdminShell>
  );
}
