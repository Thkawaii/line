import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { Icon } from '../../components/icons';
import { Notice, Spinner, useToast } from '../../components/ui';
import { countdown } from '../../lib/format';
import { useT } from '../../lib/i18n';

/* ---------- แท็บ QR ของฉัน ---------- */

function MyQr() {
  const t = useT();
  const [info, setInfo] = useState(null);
  const [image, setImage] = useState('');
  const [left, setLeft] = useState(0);

  const refresh = useCallback(async () => {
    const data = await api.qrToken();
    setInfo(data);
    setLeft(data.expiresIn);
    setImage(await QRCode.toDataURL(data.token, { width: 520, margin: 1 }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // QR มีอายุสั้น หมดเวลาแล้วขอรหัสใหม่อัตโนมัติ
  useEffect(() => {
    if (left <= 0) return;
    const timer = setInterval(() => setLeft((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(timer);
  }, [left]);

  useEffect(() => {
    if (left === 0 && info) refresh();
  }, [left, info, refresh]);

  if (!info) return <Spinner />;

  return (
    <section className="card p-5 text-center">
      <h2 className="text-lg font-bold text-ink">{info.display_name}</h2>
      <p className="mt-1 text-sm text-muted">
        {t('qr.employeeCode')} : {info.employee_code}
        <span className="mx-3 text-line">|</span>
        {t('qr.department')} : {info.department}
      </p>

      <img src={image} alt={t('qr.imageAlt')} className="mx-auto mt-5 w-56 max-w-full" />

      <button onClick={refresh} className="mx-auto mt-5 flex items-center gap-2 text-primary" aria-label={t('qr.refresh')}>
        <Icon.Refresh size={20} />
        <span className="text-lg font-semibold tabular-nums">{countdown(left)}</span>
      </button>

      <p className="mt-4 text-sm text-muted">{t('qr.hint')}</p>
    </section>
  );
}

/* ---------- แท็บสแกน ---------- */

function Scanner() {
  const toast = useToast();
  const t = useT();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | running | denied | unsupported
  const [result, setResult] = useState('');
  const [torchOn, setTorchOn] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setStatus('unsupported');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
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

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  // อ่านโค้ดด้วย BarcodeDetector ที่มากับเบราว์เซอร์ ถ้าไม่มีก็ให้กรอกเองแทน
  useEffect(() => {
    if (status !== 'running' || typeof window.BarcodeDetector === 'undefined') return;

    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    let alive = true;

    const tick = async () => {
      if (!alive || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length) {
          setResult(codes[0].rawValue);
          toast(t('qr.readSuccess'), 'primary');
          alive = false;
          return;
        }
      } catch {
        /* เฟรมนี้อ่านไม่ได้ ข้ามไปเฟรมถัดไป */
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => {
      alive = false;
    };
  }, [status, toast, t]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track?.getCapabilities?.().torch) return toast(t('qr.noTorch'));
    await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
    setTorchOn((v) => !v);
  }

  // เลือกรูปจากอัลบั้มแล้วอ่านโค้ดจากรูปนั้น
  async function readFromFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (typeof window.BarcodeDetector === 'undefined') return toast(t('qr.cannotReadImage'));

    const bitmap = await createImageBitmap(file);
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    const codes = await detector.detect(bitmap);
    if (codes.length) setResult(codes[0].rawValue);
    else toast(t('qr.noCodeInImage'));
  }

  return (
    <section className="card overflow-hidden">
      <div className="relative aspect-square bg-[#202626]">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

        {/* กรอบเล็งกลางจอ */}
        <span className="pointer-events-none absolute inset-10 rounded-[18px] border-2 border-white/80" />

        <button
          onClick={toggleTorch}
          aria-label={t('qr.torch')}
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white"
        >
          <Icon.Alert size={20} />
        </button>

        {status !== 'running' && (
          <div className="absolute inset-0 grid place-items-center bg-[#202626] px-8 text-center text-sm text-white">
            {status === 'denied' ? (
              <div>
                <p>{t('qr.denied')}</p>
                <button onClick={start} className="btn-primary btn-sm mt-4">
                  {t('qr.retryPermission')}
                </button>
              </div>
            ) : status === 'unsupported' ? (
              <p>{t('qr.unsupported')}</p>
            ) : (
              <p>{t('qr.opening')}</p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <p className="text-center text-sm text-muted">{t('qr.frameHint')}</p>

        {status === 'running' && typeof window.BarcodeDetector === 'undefined' && (
          <Notice tone="warn">{t('qr.noDetector')}</Notice>
        )}

        <label className="btn-ghost w-full cursor-pointer">
          <Icon.Import size={18} /> {t('qr.pickFromAlbum')}
          <input type="file" accept="image/*" onChange={readFromFile} className="hidden" />
        </label>

        {result && (
          <div className="rounded-[10px] bg-primary-wash p-3">
            <p className="text-2xs text-muted">{t('qr.result')}</p>
            <p className="mt-1 break-all text-sm font-medium text-ink">{result}</p>
            <button onClick={() => navigator.clipboard?.writeText(result)} className="btn-ghost btn-sm mt-3 w-full">
              <Icon.Copy size={16} /> {t('common.copy')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default function QrPage() {
  const t = useT();
  const [tab, setTab] = useState('mine');

  return (
    <MobileShell title={t(tab === 'mine' ? 'qr.mine' : 'qr.scan')} back="/" bell={false}>
      <div className="px-4 py-5">{tab === 'mine' ? <MyQr /> : <Scanner />}</div>

      {/* แท็บล่างของหน้า QR ตามดีไซน์ */}
      <div className="fixed inset-x-0 bottom-20 z-20 mx-auto max-w-mobile px-4">
        <div className="flex overflow-hidden rounded-card border border-line bg-white shadow-card">
          {[
            { value: 'scan', label: t('qr.scan'), icon: Icon.Scan },
            { value: 'mine', label: t('qr.mine'), icon: Icon.Qr },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setTab(item.value)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-sm font-medium ${
                tab === item.value ? 'text-primary' : 'text-muted'
              }`}
            >
              <item.icon size={22} />
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
