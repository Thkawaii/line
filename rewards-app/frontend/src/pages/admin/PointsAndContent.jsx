import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { approverGroup, canAdjustPoints, canRequestPointAdjust } from '../../lib/org';
import { SpecialPointIcon } from '../../components/SpecialPoints';
import { useAuth } from '../../context/AuthContext';
import DateField from '../../components/DateField';

export function AdminPoints() {
  const toast = useToast();
  const { user } = useAuth();

  /*
   * สิทธิ์แยกเป็นสามชุด ไม่ใช่ชุดเดียว
   *
   *   mayRequest  ยื่นขอปรับคะแนน — ER GA HR ทุกตำแหน่ง
   *   myGroup     อนุมัติได้ไหม และอนุมัติในนามฝั่งไหน — GA หรือ HR
   *               ตำแหน่งต้องตั้งแต่ Chief Officer ขึ้นไป
   *   mayReset    ตัดยอดประจำปี — ยังใช้กติกาเดิม แผนกหลังบ้าน + ตำแหน่งในรายการ
   *
   * ซ่อนปุ่มที่หน้าจอเป็นแค่ความสะดวก การกันจริงอยู่ที่เซิร์ฟเวอร์
   * (pointrequests.go และ positions.go)
   */
  const mayRequest = canRequestPointAdjust(user);
  const myGroup = approverGroup(user);
  const mayReset = canAdjustPoints(user);

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
    reason: '',
  });
  const [error, setError] = useState('');
  const [reset, setReset] = useState(null);
  const [requests, setRequests] = useState(null);
  const [requestStatus, setRequestStatus] = useState('pending');
  const [requestError, setRequestError] = useState('');
  const [txDetail, setTxDetail] = useState(null);

  // เก็บแท็บไว้ใน URL ลิงก์จากแจ้งเตือนหรือหน้าอื่นจะได้เปิดมาที่แท็บคำขอได้เลย
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'requests' ? 'requests' : 'ledger';
  const setTab = (value) => setParams(value === 'ledger' ? {} : { tab: value }, { replace: true });

  /*
    โหลดคำขอแล้วล้มต้องขึ้นข้อความ ไม่ใช่หายไปทั้งแผง

    เดิมจับ error แล้วตั้งค่าเป็น null ซึ่งทำให้แผงไม่ถูกวาดเลย
    ผลคือเวลาเซิร์ฟเวอร์ยังไม่ได้รีสตาร์ทหลังอัปเดต หน้าจอดูเหมือน
    "ไม่มีฟีเจอร์นี้" แทนที่จะบอกว่า "เรียกไม่สำเร็จเพราะอะไร"
    ความเงียบแบบนั้นทำให้ไล่ปัญหาผิดทางตั้งแต่ต้น
  */
  const loadRequests = useCallback(() => {
    api
      .adminPointRequests({ status: requestStatus })
      .then((result) => {
        setRequests(result);
        setRequestError('');
      })
      .catch((err) => {
        setRequests(null);
        setRequestError(err.message);
      });
  }, [requestStatus]);

  const load = useCallback(() => {
    api.adminPoints({ q, kind, page, limit: 20 }).then(setData);
    api.adminResetStatus().then(setReset);
    loadRequests();
  }, [q, kind, page, loadRequests]);

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
        reason: form.reason,
      });
      // บอกให้ชัดว่าคะแนนยังไม่เปลี่ยน ไม่งั้นจะไปเปิดดูแล้วคิดว่าระบบไม่ทำงาน
      toast(`ส่งคำขอปรับคะแนนของ ${target.display_name} แล้ว รออนุมัติจากฝั่ง GA และ HR`, 'primary');
      setAdjustOpen(false);
      setForm({ employee: '', points: '', title: '', pointKind: 'point', expireAt: '', reason: '' });
      setRequestStatus('pending');
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
          {mayReset && (
            <button onClick={() => setConfirmReset(true)} className="btn-ghost btn-sm">
              <Icon.Refresh size={16} /> ตัดยอดคะแนนประจำปี
            </button>
          )}
          {mayRequest && (
            <button onClick={() => setAdjustOpen(true)} className="btn-primary btn-sm">
              <Icon.Plus size={16} /> ขอปรับคะแนน
            </button>
          )}
        </div>
      }
    >
      {/* แยกเป็นสองแท็บ เพราะเป็นงานคนละจังหวะกัน
          คำขอคือสิ่งที่ต้องลงมือทำ ส่วนรายการเดินคะแนนคือของที่เกิดไปแล้ว
          ป้ายตัวเลขบนแท็บบอกว่ามีงานค้างกี่ใบโดยไม่ต้องกดเข้าไปดู */}
      <div className="mb-5 flex gap-6 border-b border-line">
        {[
          { value: 'ledger', label: 'รายการคะแนน' },
          { value: 'requests', label: 'คำขอปรับคะแนน', badge: requests?.pending },
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setTab(item.value)}
            className={`-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-[15px] font-semibold ${
              tab === item.value ? 'border-primary text-primary' : 'border-transparent text-slate'
            }`}
          >
            {item.label}
            {item.badge > 0 && (
              <span className="rounded-full bg-gold px-1.5 py-0.5 text-2xs font-bold text-gold-ink">
                {num(item.badge)}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'requests' ? (
        <PointRequests
          data={requests}
          error={requestError}
          status={requestStatus}
          onStatus={setRequestStatus}
          myGroup={myGroup}
          currentUserId={user?.id}
          onDone={load}
        />
      ) : (
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
              {/* บอกจุดเริ่มรอบไว้ด้วย ไม่งั้นเลข "เสี่ยงถูกลดระดับ" อ่านแล้วไม่รู้ว่านับจากเมื่อไหร่
                  โดยเฉพาะปีที่กดตัดยอดเองกลางปี ซึ่งรอบใหม่เริ่มนับจากวันนั้น ไม่ใช่สิ้นปีก่อน */}
              {reset.cycleStart && <> · นับคะแนนรอบนี้ตั้งแต่ {thaiDate(reset.cycleStart)}</>}
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
                      <tr
                        key={tx.id}
                        /* แถวที่มาจากคำขอกดดูรายละเอียดได้ว่าใครขอใครอนุมัติ
                           แถวอื่นไม่มีอะไรให้ดูเพิ่ม จึงไม่ทำให้ดูเหมือนกดได้ */
                        onClick={() => tx.request_id && setTxDetail(tx)}
                        className={tx.request_id ? 'cursor-pointer hover:bg-page' : ''}
                      >
                        <td className="td">{(data.page - 1) * data.limit + index + 1}</td>
                        <td className="td">{tx.employee_code}</td>
                        <td className="td">{tx.display_name}</td>
                        <td className="td">{tx.department}</td>
                        <td className="td max-w-xs truncate">
                          {tx.title}
                          {/* ป้ายเล็ก ๆ บอกว่าแถวนี้ผ่านการอนุมัติมา กดดูได้ว่าใครบ้าง
                              ไม่ยัดชื่อผู้อนุมัติลงในตารางตรง ๆ เพราะตารางกว้างอยู่แล้ว */}
                          {tx.request_id && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-primary-wash px-1.5 py-0.5 text-2xs font-semibold text-primary-dark">
                              <Icon.Check size={11} />
                              {Array.isArray(tx.approvers) ? tx.approvers.length : 0} อนุมัติ
                            </span>
                          )}
                        </td>
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
      )}

      <AdjustmentDetail tx={txDetail} onClose={() => setTxDetail(null)} />

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} size="sm">
        <form onSubmit={adjust} className="p-6">
          <h2 className="text-lg font-bold text-ink">ขอปรับคะแนนพนักงาน</h2>

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
              <DateField
                id="adjustExpire"
                className="field"
                value={form.expireAt}
                onChange={(e) => setForm({ ...form, expireAt: e.target.value })}
              />
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
            ชื่อรายการ
          </label>
          <input
            id="reason"
            className="field"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <p className="mt-1 text-2xs text-muted">ข้อความที่พนักงานจะเห็นในประวัติคะแนนของตัวเอง</p>

          {/* เหตุผลเป็นช่องบังคับ คนอนุมัติไม่ได้อยู่ในเหตุการณ์ด้วย
              ถ้าเห็นแต่ตัวเลขกับชื่อก็ตัดสินใจไม่ได้จริง เหลือแค่กดผ่านไปตามน้ำ */}
          <label className="label mt-3" htmlFor="adjustReason">
            เหตุผลที่ขอปรับ *
          </label>
          <textarea
            id="adjustReason"
            className="field min-h-[72px]"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            required
          />

          <button type="submit" className="btn-primary mt-5 w-full">
            ส่งคำขออนุมัติ
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

/*
AdjustmentDetail รายละเอียดของรายการปรับคะแนนหนึ่งแถว

เปิดจากการกดที่แถวในหน้ารายการคะแนน ตอบคำถามที่เกิดขึ้นจริงเวลามีคนทักว่า
"คะแนนหายไป 200 ใครทำ" โดยไม่ต้องไปไล่จับคู่เองจากวันเวลาในหน้าคำขอ
*/
function AdjustmentDetail({ tx, onClose }) {
  const approvers = Array.isArray(tx?.approvers) ? tx.approvers : [];

  return (
    <Modal open={!!tx} onClose={onClose} size="sm">
      {tx && (
        <div className="p-6">
          <h2 className="pr-10 text-lg font-bold text-ink">รายละเอียดการปรับคะแนน</h2>

          <div className="mt-4 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold leading-none ${
                tx.points > 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {signedPoints(tx.points)}
            </span>
            <span className="text-sm text-slate">
              {tx.point_kind === 'special' ? 'คะแนนพิเศษ' : 'คะแนน'}
            </span>
          </div>
          <p className="mt-1 font-semibold text-ink">{tx.title}</p>

          <dl className="mt-4 space-y-1.5 text-sm">
            {[
              ['พนักงาน', `${tx.display_name} (${tx.employee_code})`],
              ['แผนก', tx.department || '-'],
              ['เวลาที่ปรับ', dateTime(tx.created_at)],
              ['ผู้ยื่นคำขอ', `${tx.requested_by_name} (${tx.requested_by_department || '-'})`],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <dt className="w-24 shrink-0 text-muted">{label}</dt>
                <dd className="flex-1 text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-2xs text-muted">เหตุผลที่ขอปรับ</p>
          <p className="mt-0.5 rounded-card bg-page px-3 py-2 text-sm leading-relaxed text-slate">
            {tx.request_reason}
          </p>

          <p className="mt-4 text-2xs text-muted">อนุมัติโดย</p>
          <ul className="mt-1 space-y-1.5">
            {approvers.map((a, i) => (
              <li key={i} className="flex items-start gap-2 rounded-card bg-success-wash px-3 py-2">
                <span className="mt-0.5 shrink-0 text-success">
                  <Icon.Check size={14} />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-ink">
                    <b className="font-semibold">{a.group}</b> · {a.name}
                    <span className="ml-1 text-2xs text-muted">{a.position}</span>
                  </p>
                  {a.note && <p className="mt-0.5 text-2xs text-muted">{a.note}</p>}
                  <p className="mt-0.5 text-2xs text-muted">{dateTime(a.at)}</p>
                </div>
              </li>
            ))}
            {approvers.length === 0 && (
              <li className="text-sm text-muted">ไม่พบข้อมูลผู้อนุมัติ</li>
            )}
          </ul>

          <button onClick={onClose} className="btn-ghost mt-5 w-full">
            ปิด
          </button>
        </div>
      )}
    </Modal>
  );
}

/* ---------- คำขอปรับคะแนนที่รออนุมัติ ---------- */

const REQUEST_STATUS = {
  pending: { label: 'รออนุมัติ', className: 'bg-gold-wash text-gold-ink' },
  approved: { label: 'อนุมัติแล้ว', className: 'bg-success-wash text-success' },
  rejected: { label: 'ไม่อนุมัติ', className: 'bg-danger-wash text-danger' },
  cancelled: { label: 'ถอนแล้ว', className: 'bg-line text-muted' },
};

const REQUEST_TABS = [
  { value: 'pending', label: 'รออนุมัติ' },
  { value: 'approved', label: 'อนุมัติแล้ว' },
  { value: 'rejected', label: 'ไม่อนุมัติ' },
  { value: 'cancelled', label: 'ถอนแล้ว' },
  { value: 'all', label: 'ทั้งหมด' },
];

/**
 * ป้ายบอกว่าฝั่งไหนลงชื่อแล้ว
 *
 * แสดงทั้งสองฝั่งเสมอ ทั้งฝั่งที่ครบและยังไม่ครบ
 * ถ้าโชว์เฉพาะฝั่งที่ลงแล้ว คนอ่านต้องจำเองว่ากติกาต้องการกี่ฝั่ง
 */
function ApprovalChip({ group, done }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${
        done ? 'bg-success-wash text-success' : 'bg-line text-muted'
      }`}
    >
      {done ? <Icon.Check size={12} /> : <Icon.Clock size={12} />} {group}
    </span>
  );
}

function PointRequests({ data, error, status, onStatus, myGroup, currentUserId, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(0);
  const [noteFor, setNoteFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);

  /*
    เรียกไม่สำเร็จต้องบอกว่าเพราะอะไร ไม่ใช่วาดหน้าว่าง

    กรณีที่เจอจริงคืออัปเดตโค้ดแล้วแต่ยังไม่ได้รีสตาร์ทเซิร์ฟเวอร์
    เส้นทางใหม่จึงยังไม่มี ข้อความตรงนี้บอกตรง ๆ ว่าให้ไปรีสตาร์ท
    ดีกว่าปล่อยให้เข้าใจว่าระบบไม่มีฟีเจอร์นี้
  */
  if (error) {
    return (
      <section className="card p-4">
        <h2 className="font-semibold text-ink">คำขอปรับคะแนน</h2>
        <div className="mt-3">
          <Notice>
            โหลดคำขอไม่สำเร็จ : {error}
            {error.includes('ไม่มีเส้นทาง') && (
              <>
                <br />
                เซิร์ฟเวอร์ที่รันอยู่ยังเป็นรุ่นเก่า ปิดแล้วสั่ง{' '}
                <code className="rounded bg-page px-1">go run .</code> ใหม่ในโฟลเดอร์ backend
                ระบบจะต่อเติมตารางให้เองตอนเปิด
              </>
            )}
          </Notice>
        </div>
      </section>
    );
  }

  if (!data) return <Spinner />;

  const { requests = [], canApprove, counts = {} } = data;

  async function decide(request, decision, note = '') {
    setBusy(request.id);
    try {
      const result = await api.adminDecidePointRequest(request.id, { decision, note });
      if (decision === 'reject') toast('ปฏิเสธคำขอแล้ว', 'primary');
      else if (result.status === 'approved')
        toast('อนุมัติครบสองฝั่งแล้ว คะแนนถูกปรับเรียบร้อย', 'primary');
      else toast(`บันทึกการอนุมัติฝั่ง ${myGroup} แล้ว รออีกฝั่ง`, 'primary');
      setNoteFor(null);
      onDone();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(0);
    }
  }

  async function cancel(request) {
    setBusy(request.id);
    try {
      await api.adminCancelPointRequest(request.id);
      toast('ถอนคำขอแล้ว', 'primary');
      onDone();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(0);
    }
  }

  return (
    <section className="card overflow-hidden">
      {/*
        ชิปสถานะมีจำนวนติดทุกอัน ไม่ใช่เฉพาะอันที่เลือกอยู่

        พออนุมัติครบ คำขอจะย้ายจาก "รออนุมัติ" ไป "อนุมัติแล้ว"
        แล้วหายจากรายการที่เปิดอยู่ ซึ่งถูกต้อง แต่ถ้าไม่มีเลขบอก
        คนกดจะนึกว่าข้อมูลหายไปเลย เลขบนชิปทำให้เห็นว่ามันย้ายไปอยู่ไหน
      */}
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-semibold text-ink">คำขอปรับคะแนน</h2>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {REQUEST_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => onStatus(tab.value)}
              className={`chip ${status === tab.value ? 'chip-on' : ''}`}
            >
              {tab.label}
              {counts[tab.value] != null && ` (${num(counts[tab.value])})`}
            </button>
          ))}
        </div>
      </div>

      {requests.length === 0 ? (
        /* บอกชื่อสถานะที่กำลังดูอยู่ด้วย ไม่ใช่ "ไม่มีรายการในสถานะนี้" ลอย ๆ
           เวลาตัวเลขบนชิปกับรายการไม่ตรงกัน จะได้เห็นทันทีว่ากำลังดูสถานะไหนอยู่ */
        <p className="px-4 py-10 text-center text-sm text-muted">
          ไม่มีคำขอในสถานะ{' '}
          {(REQUEST_TABS.find((tab) => tab.value === status) || {}).label || status}
        </p>
      ) : (
        /*
          ตารางแทนการ์ดเรียงกัน

          แบบการ์ดกินพื้นที่ใบละเกือบ 300 พิกเซล เพราะยัดทั้งเหตุผลและรายชื่อผู้อนุมัติ
          ลงไปในแถว เปิดมาเห็นได้ไม่ถึงสองใบ ต้องเลื่อนยาวกว่าจะรู้ว่ามีงานค้างกี่ชิ้น

          ย้ายเหตุผลกับรายชื่อผู้อนุมัติไปอยู่ในปุ่มรายละเอียดซึ่งมีอยู่แล้ว
          แถวจึงเหลือเฉพาะสิ่งที่ใช้ตัดสินใจว่าจะกดดูใบไหนต่อ
        */
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">วันที่ยื่น</th>
                <th className="th text-right">คะแนน</th>
                <th className="th">รายการ</th>
                <th className="th">พนักงาน</th>
                <th className="th">ผู้ยื่น</th>
                <th className="th">การอนุมัติ</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                /*
                  ปุ่มอนุมัติโผล่เมื่อครบทุกข้อ
                    - คำขอยังรออยู่
                    - คนดูอนุมัติได้ (ฝั่ง GA หรือ HR และตำแหน่งถึงเกณฑ์)
                    - ฝั่งของตัวเองยังไม่มีใครลงชื่อ
                    - ไม่ใช่คำขอที่ตัวเองยื่น
                  เซิร์ฟเวอร์ตรวจซ้ำทุกข้ออยู่แล้ว ตรงนี้แค่ไม่ยื่นปุ่มที่กดไปก็ไม่ผ่านให้กวนใจ
                */
                const mine = request.requested_by_id === currentUserId;
                const sideDone = myGroup === 'GA' ? request.approved_ga : request.approved_hr;
                const showDecide =
                  request.status === 'pending' && canApprove && !sideDone && !mine && !request.mine;

                return (
                  <tr
                    key={request.id}
                    onClick={() => setDetailFor(request)}
                    className="cursor-pointer hover:bg-page"
                  >
                    <td className="td whitespace-nowrap text-muted">
                      {thaiDate(request.created_at)}
                    </td>

                    <td
                      className={`td whitespace-nowrap text-right font-bold ${
                        request.points > 0 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {signedPoints(request.points)}
                      {request.point_kind === 'special' && (
                        <span className="ml-1 text-2xs font-normal text-muted">พิเศษ</span>
                      )}
                    </td>

                    <td className="td max-w-[220px] truncate">{request.title}</td>

                    <td className="td whitespace-nowrap">
                      {request.target_name}
                      <span className="ml-1.5 text-2xs text-muted">{request.target_code}</span>
                    </td>

                    <td className="td whitespace-nowrap text-muted">
                      {request.requested_by_name}
                      {mine && <span className="ml-1 text-2xs text-primary">(คุณ)</span>}
                    </td>

                    <td className="td whitespace-nowrap">
                      {request.status === 'pending' ? (
                        <span className="flex gap-1.5">
                          <ApprovalChip group="GA" done={request.approved_ga} />
                          <ApprovalChip group="HR" done={request.approved_hr} />
                        </span>
                      ) : (
                        <Badge className={(REQUEST_STATUS[request.status] || {}).className}>
                          {(REQUEST_STATUS[request.status] || {}).label}
                        </Badge>
                      )}
                    </td>

                    {/* หยุดไม่ให้การกดปุ่มไหลไปเปิดหน้าต่างรายละเอียดของทั้งแถว */}
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <span className="flex items-center justify-end gap-1.5">
                        {showDecide && (
                          <>
                            <button
                              disabled={busy === request.id}
                              onClick={() => setNoteFor(request)}
                              className="btn-ghost btn-sm"
                            >
                              ไม่อนุมัติ
                            </button>
                            <button
                              disabled={busy === request.id}
                              onClick={() => decide(request, 'approve')}
                              className="btn-primary btn-sm"
                            >
                              <Icon.Check size={16} /> อนุมัติ
                            </button>
                          </>
                        )}
                        {request.status === 'pending' && mine && (
                          <button
                            disabled={busy === request.id}
                            onClick={() => cancel(request)}
                            className="btn-ghost btn-sm"
                          >
                            ถอนคำขอ
                          </button>
                        )}
                        {/* ลูกศร > บอกแค่ว่า "กดได้" แต่ไม่บอกว่ากดแล้วได้อะไร
                            เขียนคำว่ารายละเอียดไปเลย คนอ่านจะได้ไม่ต้องลองกดเพื่อรู้ */}
                        <button onClick={() => setDetailFor(request)} className="btn-ghost btn-sm">
                          รายละเอียด
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ปฏิเสธต้องบอกเหตุผล คนยื่นจะได้รู้ว่าต้องแก้อะไรก่อนยื่นใหม่
          ไม่ใช่เจอแค่คำว่า "ไม่อนุมัติ" แล้วเดาเอง */}
      <RequestDetail request={detailFor} onClose={() => setDetailFor(null)} />

      <RejectDialog
        request={noteFor}
        busy={busy === noteFor?.id}
        onCancel={() => setNoteFor(null)}
        onConfirm={(note) => decide(noteFor, 'reject', note)}
      />
    </section>
  );
}

/*
RequestDetail ใบสรุปของคำขอหนึ่งใบ เปิดดูย้อนหลังได้ทุกสถานะ

ใบที่อนุมัติครบแล้วย้ายไปอยู่แท็บ "อนุมัติแล้ว" ไม่ได้หายไปไหน
หน้าต่างนี้คือที่ที่ตรวจสอบย้อนหลังว่าใครขอ ด้วยเหตุผลอะไร ใครอนุมัติ และเมื่อไหร่

ไล่เรียงตามลำดับเวลาจากบนลงล่าง: ยื่น -> อนุมัติทีละฝั่ง -> ผลสุดท้าย
อ่านแล้วเห็นเส้นทางของใบนี้ทั้งใบในหน้าจอเดียว
*/
/*
Step หนึ่งก้าวของเส้นเวลา

จุดกลมเป็นวงมีไอคอนข้างใน ไม่ใช่จุดทึบเปล่า ๆ
เพราะอ่านผ่าน ๆ จะได้รู้ทันทีว่าก้าวนั้นคือผ่าน ไม่ผ่าน หรือยังรออยู่
โดยไม่ต้องอ่านตัวหนังสือทีละบรรทัด

เส้นต่อระหว่างจุดวาดด้วย div ที่ยืดจากใต้จุดลงไปจนสุดก้าว
ก้าวสุดท้ายไม่วาด เส้นจะได้ไม่ห้อยลอยออกมาใต้ก้าวสุดท้าย
*/
function Step({ tone, icon: Ico, title, meta, note, last }) {
  const tones = {
    primary: 'bg-primary-wash text-primary-dark',
    success: 'bg-success-wash text-success',
    danger: 'bg-danger-wash text-danger',
    muted: 'bg-page text-muted',
  };

  return (
    <li className={`relative flex gap-3 ${last ? '' : 'pb-5'}`}>
      {!last && <span className="absolute bottom-1 left-[13px] top-7 w-px bg-line" />}
      <span
        className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ${tones[tone]}`}
      >
        <Ico size={14} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={`text-sm font-semibold ${tone === 'muted' ? 'text-muted' : 'text-ink'}`}>
          {title}
        </p>
        {meta && <p className="mt-0.5 text-2xs text-muted">{meta}</p>}
        {note && (
          <p className="mt-1.5 rounded-card border border-line bg-page px-3 py-2 text-2xs leading-relaxed text-slate">
            {note}
          </p>
        )}
      </div>
    </li>
  );
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs text-muted">{label}</p>
      <p className="truncate text-sm font-medium text-ink">{value || '-'}</p>
    </div>
  );
}

function RequestDetail({ request, onClose }) {
  if (!request) return null;

  const decisions = Array.isArray(request.decisions) ? request.decisions : [];
  const status = REQUEST_STATUS[request.status] || REQUEST_STATUS.pending;
  const plus = request.points > 0;

  /* ใบที่ไม่อนุมัติจบที่การตัดสินใจเลย ไม่มีก้าวต่อท้าย
     ก้าวสุดท้ายต้องไม่ลากเส้นต่อ ไม่งั้นจะมีเส้นห้อยลงไปในที่ว่าง */
  const hasTail = ['pending', 'approved', 'cancelled'].includes(request.status);

  /*
    หัวกล่องใช้สีตามสถานะ เปิดมาปุ๊บรู้ผลทันทีจากสีก่อนอ่านตัวหนังสือ
    เดิมหัวกล่องกับก้อนคะแนนเป็นกล่องเทาสองก้อนซ้อนกัน ดูหนักและไม่บอกอะไรเพิ่ม
  */
  const heads = {
    pending: 'from-[#FFF4D6] to-[#FFFBF0]',
    approved: 'from-[#E3F6EE] to-[#F4FCF8]',
    rejected: 'from-[#FDE8E8] to-[#FEF6F6]',
    cancelled: 'from-[#F1F3F6] to-[#F8F9FB]',
  };

  return (
    <Modal open={!!request} onClose={onClose} size="md">
      <div
        className={`bg-gradient-to-b px-6 pb-5 pt-6 ${heads[request.status] || heads.pending}`}
      >
        <div className="flex items-center gap-3 pr-10">
          <h2 className="text-sm font-semibold text-slate">รายละเอียดคำขอปรับคะแนน</h2>
          <Badge className={status.className}>{status.label}</Badge>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className={`text-4xl font-bold leading-none ${plus ? 'text-success' : 'text-danger'}`}>
            {signedPoints(request.points)}
          </span>
          <span className="text-sm font-medium text-slate">
            {request.point_kind === 'special' ? 'คะแนนพิเศษ' : 'คะแนน'}
          </span>
        </div>
        <p className="mt-2 text-lg font-bold leading-snug text-ink">{request.title}</p>
      </div>

      <div className="border-y border-line bg-white px-6 py-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="พนักงาน" value={request.target_name} />
          <Fact label="รหัสพนักงาน" value={request.target_code} />
          <Fact label="แผนก" value={request.target_department} />
          {request.point_kind === 'special' && (
            <Fact
              label="คะแนนหมดอายุ"
              value={request.expire_at ? thaiDate(request.expire_at) : 'ไม่กำหนด'}
            />
          )}
        </div>
      </div>

      <div className="px-6 py-5">
        <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-muted">
          ลำดับเหตุการณ์
        </p>

        {/* เรียงตามเวลาจากบนลงล่าง ยื่น → อนุมัติทีละฝั่ง → ผลสุดท้าย
            ใบที่ปิดไปแล้วก็ยังเปิดดูได้ หน้าต่างนี้คือที่ตรวจสอบย้อนหลัง */}
        <ol>
          <Step
            tone="primary"
            icon={Icon.Export}
            title="ยื่นคำขอ"
            meta={`${request.requested_by_name} (${request.requested_by_department || '-'}) · ${dateTime(request.created_at)}`}
            note={request.reason}
          />

          {decisions.map((d, i) => (
            <Step
              key={i}
              tone={d.decision === 'approve' ? 'success' : 'danger'}
              icon={d.decision === 'approve' ? Icon.Check : Icon.Close}
              title={`${d.decision === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ'} · ฝั่ง ${d.group}`}
              meta={`${d.name} (${d.position}) · ${dateTime(d.at)}`}
              note={d.note}
              last={!hasTail && i === decisions.length - 1}
            />
          ))}

          {request.status === 'pending' && (
            <Step
              tone="muted"
              icon={Icon.Clock}
              title={`รออนุมัติจากฝั่ง ${
                request.approved_ga ? 'HR' : request.approved_hr ? 'GA' : 'GA และ HR'
              }`}
              last
            />
          )}

          {request.status === 'approved' && (
            <Step
              tone="success"
              icon={Icon.CheckCircle}
              title="ปรับคะแนนเรียบร้อย"
              meta={dateTime(request.decided_at)}
              last
            />
          )}

          {request.status === 'cancelled' && (
            <Step tone="muted" icon={Icon.Close} title="ผู้ยื่นถอนคำขอ" last />
          )}
        </ol>
      </div>

      <div className="border-t border-line px-6 py-4">
        <button onClick={onClose} className="btn-ghost w-full">
          ปิด
        </button>
      </div>
    </Modal>
  );
}

function RejectDialog({ request, busy, onCancel, onConfirm }) {
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote('');
  }, [request?.id]);

  return (
    <Modal open={!!request} onClose={onCancel} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(note);
        }}
        className="p-6"
      >
        <h2 className="text-lg font-bold text-ink">ไม่อนุมัติคำขอนี้</h2>

        <label className="label mt-4" htmlFor="rejectNote">
          เหตุผลที่ไม่อนุมัติ *
        </label>
        <textarea
          id="rejectNote"
          className="field min-h-[72px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required
        />

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">
            ย้อนกลับ
          </button>
          <button type="submit" disabled={busy} className="btn-danger flex-1">
            ยืนยันไม่อนุมัติ
          </button>
        </div>
      </form>
    </Modal>
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
