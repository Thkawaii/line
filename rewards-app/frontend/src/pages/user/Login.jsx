import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Icon } from '../../components/icons';
import { Notice } from '../../components/ui';
import { useT } from '../../lib/i18n';
import LanguagePicker from '../../components/LanguagePicker';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const t = useT();

  const [role, setRole] = useState('user');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login({ identifier, password, role });
      if (user.role === 'admin') navigate('/admin', { replace: true });
      else navigate(user.terms_accepted_at ? '/' : '/terms', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div
      className="auth-bg flex min-h-dvh items-center justify-center p-5"
    >
      {/* ไม่ใส่สีพื้นการ์ดเลย ปล่อยให้เห็นลายคลื่นด้านหลังตรง ๆ ตามดีไซน์
          ใช้ขอบขาวจาง ๆ กับเงาเป็นตัวบอกขอบเขตการ์ดแทน */}
      <div className="w-full max-w-sm rounded-2xl border border-white/50 p-6 shadow-pop">
        <div className="mb-2 flex justify-end">
          <LanguagePicker />
        </div>
        <div className="flex justify-center">
          {/* ตัวไฟล์เป็นวงกลมพร้อมพื้นหลังโปร่งใสอยู่แล้ว จึงไม่ต้องครอบวงกลมซ้ำ
              ใช้ drop-shadow แทน box-shadow ไม่งั้นเงาจะเป็นสี่เหลี่ยมรอบมุมที่โปร่งใส */}
          <img
            src="/k-point-logo.png"
            alt="K-POINT"
            width={144}
            height={144}
            className="h-36 w-36 object-contain drop-shadow-lg"
          />
        </div>

        <h1 className="mt-4 text-center text-2xl font-bold leading-tight text-ink">
          {t('login.welcome')}
          <br />
          K-POINT
        </h1>
        <p className="mt-2 text-center text-[15px] font-semibold text-slate">{t('login.pleaseLogin')}</p>

        <div className="mt-4 flex justify-center">
          <div className="inline-flex rounded-pill bg-line/80 p-1">
            {[
              { value: 'user', label: t('login.roleUser') },
              { value: 'admin', label: t('login.roleAdmin') },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`rounded-pill px-5 py-1.5 text-sm font-semibold transition-colors ${
                  role === opt.value ? 'bg-primary text-white' : 'text-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && <Notice>{error}</Notice>}

          <div>
            <label className="label" htmlFor="identifier">
              {t(role === 'admin' ? 'login.identifier' : 'login.employeeCode')}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <Icon.User size={18} />
              </span>
              <input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                className="field pl-10"
                placeholder={t(role === 'admin' ? 'login.identifierPlaceholder' : 'login.employeeCodePlaceholder')}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="password">
              {t('login.password')}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <Icon.Lock size={18} />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="field px-10"
                placeholder={t('login.passwordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={t(showPassword ? 'login.hidePassword' : 'login.showPassword')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              >
                <Icon.Eye size={18} off={!showPassword} />
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={busy} className="btn-primary mx-auto block px-10">
              {busy ? t('login.submitting') : t('login.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
