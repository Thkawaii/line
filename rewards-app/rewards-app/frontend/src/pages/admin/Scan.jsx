import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Icon } from '../../components/icons';
import { ImagePlaceholder, Notice, useToast } from '../../components/ui';
import { dateTime, num } from '../../lib/format';

/**
 * หน้าสแกน QR ของผู้ดูแลระบบ ใช้เครื่องเดียวจบทั้งสองงาน
 *
 * ในงานจริงผู้ดูแลถือมือถือเครื่องเดียวแล้วเจอคนสองแบบปนกัน
 * คนมาเช็คอินกับคนมารับของรางวัล ถ้าต้องสลับหน้าจอเองจะช้าและพลาดง่าย
 * หน้านี้จึงรับ QR อะไรก็ได้ แล้วให้ฝั่งเซิร์ฟเวอร์แยกแยะว่าเป็นอะไร
 *
 *   QR ประจำตัวพนักงาน -> เช็คอินและให้คะแนนทันที
 *   QR ของรางวัล       -> ยืนยันรับของทันที ไม่ต้องกดซ้ำ
 *
 * ทั้งสองอย่างจบในการสแกนครั้งเดียว เพราะผู้ดูแลสแกนตอนคนมายืนอยู่ตรงหน้าแล้ว
 * ถ้าสแกนผิดคนมีปุ่มยกเลิกในกล่องผลให้กดคืนได้
 */
export default function AdminScan() {
  const toast = useToast();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const busyRef = useRef(false);
  const lastRef = useRef({ code: '', at: 0 });

  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState('idle'); // idle | starting | running | denied | unsupported
  const [manual, setManual] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.adminEvents().then(({ events: list }) => {
      const open = list.filter((e) => e.status === 'open');
      setEvents(open);
      // มีกิจกรรมเปิดอยู่อันเดียวก็เลือกให้เลย ผู้ดูแลจะได้ไม่ต้องกดเพิ่ม
      if (open.length === 1) setEventId(String(open[0].id));
    });
  }, []);

  /** ส่งรหัสไปให้เซิร์ฟเวอร์แยกแยะและทำงานให้ */
  const submit = useCallback(
    async (code) => {
      if (busyRef.current) return;
      busyRef.current = true;

      try {
        const res = await api.adminScan({ code, eventId: Number(eventId) || 0 });
        setResult(res);

        if (res.kind === 'checkin' && res.result === 'ok') {
          toast(`เช็คอิน ${res.user.display_name} แล้ว`, 'primary');
        }
        if (res.kind === 'redemption' && res.justReceived) {
          toast(`ส่งมอบ ${res.redemption.reward_name} แล้ว`, 'primary');
        }
      } catch (err) {
        setResult({ kind: 'error', message: err.message });
      } finally {
        // หน่วงสั้น ๆ กันสแกนซ้ำรัว ๆ จากเฟรมถัดไปของกล้อง
        setTimeout(() => {
          busyRef.current = false;
        }, 1200);
      }
    },
    [eventId, toast]
  );

  /* ---------- กล้อง ---------- */

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    // เบราว์เซอร์ยอมให้ใช้กล้องเฉพาะหน้าที่เปิดผ่าน https หรือ localhost
    // เข้าด้วยเลข IP แบบ http กล้องจะถูกปิดตั้งแต่ต้น ต้องบอกให้ชัดว่าแก้ยังไง
    if (!window.isSecureContext) {
      setStatus('insecure');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }

    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus('running');
    } catch {
      setStatus('denied');
    }
  }, []);

  useEffect(() => stop, [stop]);

  // อ่าน QR จากภาพกล้องทีละเฟรม
  useEffect(() => {
    if (status !== 'running' || typeof window.BarcodeDetector === 'undefined') return;

    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    let alive = true;

    const tick = async () => {
      if (!alive) return;

      try {
        const codes = await detector.detect(videoRef.current);
        const value = codes[0]?.rawValue;
        const now = Date.now();

        // รหัสเดิมภายในสามวินาทีถือว่าเป็นการสแกนครั้งเดิม ไม่ยิงซ้ำ
        if (value && (value !== lastRef.current.code || now - lastRef.current.at > 3000)) {
          lastRef.current = { code: value, at: now };
          submit(value);
        }
      } catch {
        /* เฟรมนี้อ่านไม่ได้ ข้ามไปเฟรมถัดไป */
      }

      if (alive) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => {
      alive = false;
    };
  }, [status, submit]);

  // ยกเลิกการยืนยันรับ ใช้ตอนสแกนผิดคน
  async function undoDelivery() {
    const { id, ref_code: ref } = result.redemption;
    await api.adminRevertRedemption(id);
    toast(`ยกเลิกการรับของรางวัล ${ref} แล้ว`);
    setResult(null);
  }

  function submitManual(e) {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    setManual('');
    submit(code);
  }

  // ที่อยู่เดิมแต่เปลี่ยนเป็น https ไว้ให้กดข้ามไปได้เลย ไม่ต้องพิมพ์เอง
  const httpsUrl =
    typeof window !== 'undefined'
      ? `https://${window.location.hostname}:${window.location.port || 4008}${window.location.pathname}`
      : '';

  return (
    <AdminShell title="สแกน QR" breadcrumb="Scan">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ---------- กล้อง ---------- */}
        <section className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-semibold text-ink">กล้องสแกน</h2>
            <p className="mt-0.5 text-sm text-muted">
              ใช้ได้ทั้ง QR ประจำตัวพนักงานและ QR ของรางวัล ระบบแยกให้เอง
            </p>
          </div>

          <div className="relative aspect-[4/3] w-full bg-[#1C2A32]">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

            {status === 'running' && (
              /* กรอบเล็งกลางจอ ช่วยให้ผู้ใช้รู้ว่าต้องวาง QR ตรงไหน */
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="relative h-48 w-48">
                  {['left-0 top-0 border-l-4 border-t-4', 'right-0 top-0 border-r-4 border-t-4',
                    'left-0 bottom-0 border-l-4 border-b-4', 'right-0 bottom-0 border-r-4 border-b-4'].map((pos) => (
                    <span key={pos} className={`absolute h-8 w-8 rounded-[4px] border-white ${pos}`} />
                  ))}
                </div>
              </div>
            )}

            {status !== 'running' && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
                {status === 'idle' && (
                  <div>
                    <Icon.Scan size={40} />
                    <p className="mt-3 text-sm">กดเปิดกล้องเพื่อเริ่มสแกน</p>
                    <button onClick={start} className="btn-primary btn-sm mt-4">
                      เปิดกล้อง
                    </button>
                  </div>
                )}
                {status === 'starting' && <p className="text-sm">กำลังเปิดกล้อง</p>}
                {status === 'denied' && (
                  <div>
                    <p className="text-sm">ยังไม่ได้รับสิทธิ์ใช้กล้อง</p>
                    <button onClick={start} className="btn-primary btn-sm mt-4">
                      ลองขอสิทธิ์อีกครั้ง
                    </button>
                  </div>
                )}
                {status === 'insecure' && (
                  <div className="max-w-sm">
                    <p className="text-sm">
                      เบราว์เซอร์เปิดกล้องให้เฉพาะหน้าที่เข้าผ่าน https
                      ตอนนี้เข้าด้วย http จึงใช้กล้องไม่ได้
                    </p>
                    <a href={httpsUrl} className="btn-primary btn-sm mt-4 inline-flex">
                      เปิดด้วย https
                    </a>
                    <p className="mt-3 text-2xs text-white/70">
                      ครั้งแรกเบราว์เซอร์จะเตือนว่าใบรับรองไม่น่าเชื่อถือ
                      กด Advanced แล้ว Proceed ได้เลย เพราะเป็นเครื่องในวงแลนของเราเอง
                      <br />
                      ฝั่งเซิร์ฟเวอร์ต้องรันด้วย npm run dev:https
                    </p>
                    <p className="mt-2 text-2xs text-white/70">
                      ไม่อยากตั้ง https ก็ใช้ช่องกรอกรหัสพนักงานแทนได้
                    </p>
                  </div>
                )}
                {status === 'unsupported' && (
                  <p className="max-w-sm text-sm">
                    เบราว์เซอร์นี้ใช้กล้องไม่ได้ ใช้ช่องกรอกรหัสพนักงานแทนได้
                  </p>
                )}
              </div>
            )}
          </div>

          {status === 'running' && (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm text-muted">วาง QR ให้อยู่ในกรอบ ระบบจะอ่านเอง</p>
              <button onClick={stop} className="btn-ghost btn-sm">
                ปิดกล้อง
              </button>
            </div>
          )}

          {status === 'running' && typeof window.BarcodeDetector === 'undefined' && (
            <div className="px-4 pb-4">
              <Notice tone="warn">
                เบราว์เซอร์นี้ไม่มีตัวอ่าน QR ในตัว ภาพจากกล้องยังดูได้ แต่ต้องกรอกรหัสเอง
              </Notice>
            </div>
          )}
        </section>

        {/* ---------- ฝั่งควบคุมและผลลัพธ์ ---------- */}
        <div className="space-y-5">
          <section className="card p-4">
            <label className="label" htmlFor="scanEvent">
              กิจกรรมที่กำลังเช็คอิน
            </label>
            <select
              id="scanEvent"
              className="field"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">สแกนรับของรางวัล</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-2xs text-muted">
              เลือกไว้ก่อนเริ่มเช็คอิน สแกน QR พนักงานแล้วระบบจะเช็คอินและให้คะแนนทันที
            </p>
          </section>

          <section className="card p-4">
            <form onSubmit={submitManual}>
              <label className="label" htmlFor="manualCode">
                รหัสพนักงาน
              </label>
              <div className="flex gap-2">
                <input
                  id="manualCode"
                  className="field"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="กรอกเมื่อสแกนไม่ได้"
                />
                <button type="submit" className="btn-primary shrink-0">
                  ตรวจสอบ
                </button>
              </div>
            </form>
            <p className="mt-1.5 text-2xs text-muted">
              ใช้ตอนพนักงานลืมมือถือหรือกล้องอ่านไม่ติด ใส่รหัสอ้างอิงของรางวัลก็ได้
            </p>
          </section>

          <ScanResult result={result} onUndo={undoDelivery} onClear={() => setResult(null)} />
        </div>
      </div>
    </AdminShell>
  );
}

/** กล่องผลลัพธ์ แสดงต่างกันตามสิ่งที่สแกนเจอ */
function ScanResult({ result, onUndo, onClear }) {
  if (!result) {
    return (
      <section className="card grid place-items-center p-8 text-center text-muted">
        <Icon.Qr size={32} />
        <p className="mt-2 text-sm">ผลการสแกนจะแสดงที่นี่</p>
      </section>
    );
  }

  if (result.kind === 'error') {
    return (
      <Panel tone="danger" icon={Icon.Warning} title="สแกนไม่สำเร็จ" onClear={onClear}>
        <p className="text-sm text-slate">{result.message}</p>
      </Panel>
    );
  }

  if (result.kind === 'employee') {
    return (
      <Panel tone="warn" icon={Icon.Warning} title="ยังไม่ได้เลือกกิจกรรม" onClear={onClear}>
        <Person user={result.user} />
        <p className="mt-3 text-sm text-slate">
          เลือกกิจกรรมด้านบนก่อน แล้วสแกนใหม่อีกครั้งเพื่อเช็คอิน
        </p>
      </Panel>
    );
  }

  if (result.kind === 'checkin') {
    const tone = { ok: 'success', already: 'warn', 'not-registered': 'danger' }[result.result];
    const title = {
      ok: 'เช็คอินสำเร็จ',
      already: 'เช็คอินไปแล้ว',
      'not-registered': 'ยังไม่ได้ลงทะเบียน',
    }[result.result];
    const icon = result.result === 'ok' ? Icon.CheckCircle : Icon.Warning;

    return (
      <Panel tone={tone} icon={icon} title={title} onClear={onClear}>
        <Person user={result.user} />

        <p className="mt-3 text-sm text-slate">กิจกรรม : {result.event}</p>

        {result.result === 'ok' && (
          <p className="mt-2 text-lg font-bold text-success">+ {num(result.points)} คะแนน</p>
        )}
        {result.result === 'already' && (
          <p className="mt-2 text-sm text-slate">เช็คอินไปแล้ว ไม่ให้คะแนนซ้ำ</p>
        )}
        {result.result === 'not-registered' && (
          <p className="mt-2 text-sm text-slate">
            พนักงานคนนี้ยังไม่ได้ลงทะเบียนกิจกรรมนี้ ให้ลงทะเบียนก่อนแล้วสแกนใหม่
          </p>
        )}
      </Panel>
    );
  }

  const item = result.redemption;
  const justReceived = result.justReceived;

  return (
    <Panel
      tone={justReceived ? 'success' : 'warn'}
      icon={justReceived ? Icon.CheckCircle : Icon.Warning}
      title={justReceived ? 'ส่งมอบของรางวัลแล้ว' : 'รายการนี้รับของไปแล้วก่อนหน้านี้'}
      onClear={onClear}
    >
      <div className="flex gap-3">
        <ImagePlaceholder src={item.image_url} className="h-16 w-20 shrink-0 rounded-[8px]" />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{item.reward_name}</p>
          <p className="mt-0.5 text-2xs text-muted">รหัสอ้างอิง {item.ref_code}</p>
          <p className="mt-0.5 text-2xs text-muted">ใช้ไป {num(item.points_used)} คะแนน</p>
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <Person user={item} />
        <p className="mt-2 text-2xs text-muted">แลกเมื่อ {dateTime(item.redeemed_at)}</p>
        <p className="mt-0.5 text-2xs text-muted">รับเมื่อ {dateTime(item.received_at)}</p>
      </div>

      {justReceived ? (
        <>
          <p className="mt-3 text-sm text-slate">ส่งของให้พนักงานได้เลย ระบบบันทึกให้แล้ว</p>
          <button onClick={onUndo} className="btn-ghost btn-sm mt-3 w-full">
            สแกนผิดคน ยกเลิกรายการนี้
          </button>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate">
          รายการนี้ถูกยืนยันไปก่อนหน้านี้แล้ว ถ้าพนักงานยังไม่ได้ของให้ตรวจกับผู้ดูแลคนอื่นก่อน
        </p>
      )}
    </Panel>
  );
}

function Person({ user }) {
  return (
    <div>
      <p className="font-semibold text-ink">{user.display_name}</p>
      <p className="mt-0.5 text-sm text-muted">
        รหัส {user.employee_code}
        {user.department ? ` · ${user.department}` : ''}
      </p>
    </div>
  );
}

const TONES = {
  success: { bar: 'bg-success', text: 'text-success', wash: 'bg-success-wash' },
  warn: { bar: 'bg-gold', text: 'text-gold-ink', wash: 'bg-gold-wash' },
  danger: { bar: 'bg-danger', text: 'text-danger', wash: 'bg-danger-wash' },
};

function Panel({ tone, icon: Ico, title, children, onClear }) {
  const theme = TONES[tone] || TONES.success;

  return (
    <section className="card overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-3 ${theme.wash}`}>
        <span className={theme.text}>
          <Ico size={20} />
        </span>
        <h2 className={`flex-1 font-semibold ${theme.text}`}>{title}</h2>
        <button onClick={onClear} className="text-muted hover:text-ink" aria-label="ล้างผล">
          <Icon.Close size={18} />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
