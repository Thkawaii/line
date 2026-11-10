import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Icon } from './icons';
import { initials } from '../lib/format';
import { useT } from '../lib/i18n';

export function Avatar({ name, src, size = 40 }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="shrink-0 rounded-full bg-line object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}

export function Badge({ children, className = '' }) {
  return <span className={`badge ${className}`}>{children}</span>;
}

export function Spinner({ label }) {
  const t = useT();
  const text = label ?? t('common.loading');
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary" />
      {text}
    </div>
  );
}

export function EmptyState({ icon: Ico = Icon.Bell, title, hint, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="text-[#C8CDCD]">
        <Ico size={52} />
      </span>
      <p className="mt-4 text-[17px] text-muted">{title}</p>
      {hint && <p className="mt-1.5 whitespace-pre-line text-sm text-muted/80">{hint}</p>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

export function Notice({ children, tone = 'error' }) {
  if (!children) return null;
  const tones = {
    error: 'bg-danger-wash text-danger',
    info: 'bg-primary-wash text-primary-dark',
    warn: 'bg-gold-wash text-gold-ink',
  };
  return (
    <p role="status" className={`rounded-[10px] px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </p>
  );
}

/* กล่องซ้อนแบบในดีไซน์: พื้นหลังมืด กดนอกกล่องเพื่อปิด */
export function Modal({ open, onClose, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        className="absolute inset-0 cursor-default bg-ink/45"
        aria-label="ปิดหน้าต่าง"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full ${widths[size]} max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-pop`}
      >
        {onClose && (
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate shadow-card hover:bg-line"
          >
            <Icon.Close size={18} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/*
 * กล่องยืนยันก่อนทำรายการที่ย้อนกลับไม่ได้ (เช่นลบพนักงาน)
 * ใช้แทน window.confirm ของเบราว์เซอร์ซึ่งหน้าตาไม่ตรงกับดีไซน์และปรับแต่งไม่ได้
 * tone="danger" (ค่าเริ่มต้น) ใช้กับรายการลบ/ทำลายข้อมูล ส่วน tone="primary" ใช้กับการยืนยันทั่วไป
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const iconWash = tone === 'danger' ? 'bg-danger-wash text-danger' : 'bg-primary-wash text-primary';
  const confirmClass = tone === 'danger' ? 'btn-danger' : 'btn-primary';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      style={{ animation: 'levelup-fade .2s ease-out' }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink/45"
        aria-label={t('common.close')}
        onClick={() => !busy && onCancel?.()}
      />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-pop"
        style={{ animation: 'levelup-pop .3s cubic-bezier(.34,1.56,.64,1)' }}
      >
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${iconWash}`}>
          <Icon.Trash size={26} />
        </span>
        <h2 className="mt-4 text-lg font-bold text-ink">{title}</h2>
        {message && <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>}
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost flex-1">
            {cancelLabel || t('common.cancel')}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={`${confirmClass} flex-1`}>
            {busy ? t('common.processing') : confirmLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* แถบข้อความสั้นที่เด้งขึ้นมาแล้วหายไปเอง */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, tone = 'dark') => {
    setToast({ message, tone, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-6">
          <p
            role="status"
            className={`rounded-pill px-5 py-2.5 text-sm font-medium text-white shadow-pop ${
              toast.tone === 'primary' ? 'bg-primary' : 'bg-[#4A5555]'
            }`}
          >
            {toast.message}
          </p>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext) || (() => {});

/* ชิปกรองแนวนอน เลื่อนได้บนมือถือ */
export function ChipBar({ options, value, onChange, className = '' }) {
  return (
    <div className={`no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`chip ${value === opt.value ? 'chip-on' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'ค้นหา' }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        <Icon.Search size={18} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field h-11 py-0 pl-10"
      />
    </div>
  );
}

export function SegmentedToggle({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-pill bg-line p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-pill px-5 py-1.5 text-sm font-semibold transition-colors ${
            value === opt.value ? 'bg-primary text-white shadow-card' : 'text-muted'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ใช้แทนรูปที่ยังไม่มีไฟล์จริง ดีไซน์วางเป็นบล็อกสีเทาไว้
   fit="contain" ใช้เมื่อต้องการเห็นของทั้งชิ้น เช่น หน้ารายละเอียดของรางวัล */
export function ImagePlaceholder({ src, alt = '', className = '', fit = 'cover' }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`${fit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`}
        loading="lazy"
      />
    );
  }
  return <div className={`bg-[#D9D9D9] ${className}`} aria-hidden="true" />;
}

export function ProgressBar({ value, max, tone = 'gold', track = 'bg-[#D9D9D9]' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`h-2 w-full overflow-hidden rounded-pill ${track}`}>
      <div
        className={`h-full rounded-pill ${tone === 'gold' ? 'bg-gold' : 'bg-primary'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Pagination({ page, total, limit, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const near = [1, 2, 3, page - 1, page, page + 1, pages - 2, pages - 1, pages]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b)
    .filter((n, i, arr) => arr.indexOf(n) === i);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-slate">
      <span>
        หน้า {page} จาก {pages}
      </span>
      <div className="flex items-center gap-1">
        <button disabled={page === 1} onClick={() => onChange(1)} className="rounded px-2 py-1 disabled:opacity-40">
          «
        </button>
        <button
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          className="rounded px-2 py-1 disabled:opacity-40"
        >
          ‹
        </button>
        {near.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && near[i - 1] !== n - 1 && <span className="px-1 text-muted">…</span>}
            <button
              onClick={() => onChange(n)}
              className={`min-w-8 rounded px-2 py-1 ${
                n === page ? 'bg-primary font-semibold text-white' : 'hover:bg-primary-wash'
              }`}
            >
              {n}
            </button>
          </span>
        ))}
        <button
          disabled={page === pages}
          onClick={() => onChange(page + 1)}
          className="rounded px-2 py-1 disabled:opacity-40"
        >
          ›
        </button>
        <button
          disabled={page === pages}
          onClick={() => onChange(pages)}
          className="rounded px-2 py-1 disabled:opacity-40"
        >
          »
        </button>
      </div>
    </div>
  );
}
