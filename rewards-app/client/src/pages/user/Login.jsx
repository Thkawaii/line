import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Icon } from '../../components/icons';
import { Notice } from '../../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

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
      className="flex min-h-dvh items-center justify-center bg-page bg-cover bg-center p-5"
      style={{ backgroundImage: 'url(/auth-bg.jpg)' }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white/80 p-6 shadow-pop backdrop-blur-sm">
        <div className="flex justify-center">
          <span className="h-20 w-20 rounded-full bg-[#D9D9D9]" aria-hidden="true" />
        </div>

        <h1 className="mt-4 text-center text-2xl font-bold leading-tight text-ink">
          ยินดีต้อนรับสู่
          <br />
          ระบบสะสมคะแนนพนักงาน
        </h1>
        <p className="mt-2 text-center text-[15px] font-semibold text-slate">กรุณาเข้าสู่ระบบ</p>

        <div className="mt-4 flex justify-center">
          <div className="inline-flex rounded-pill bg-line/80 p-1">
            {[
              { value: 'user', label: 'ผู้ใช้' },
              { value: 'admin', label: 'แอดมิน' },
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
              {role === 'admin' ? 'ชื่อผู้ใช้ / อีเมล' : 'รหัสพนักงาน'}
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
                placeholder={role === 'admin' ? 'กรอกชื่อผู้ใช้หรืออีเมลของคุณ' : 'กรอกรหัสพนักงาน'}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="password">
              รหัสผ่าน
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
                placeholder="กรอกรหัสผ่านของคุณ"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              >
                <Icon.Eye size={18} off={!showPassword} />
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={busy} className="btn-primary mx-auto block px-10">
              {busy ? 'กำลังเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}
            </button>
          </div>
        </form>

        <p className="mt-5 rounded-[10px] bg-primary-wash px-3 py-2.5 text-center text-2xs leading-relaxed text-primary-dark">
          บัญชีทดลอง — พนักงาน: รหัส <b>4308</b> · แอดมิน: <b>admin</b>
          <br />
          รหัสผ่านทั้งคู่คือ <b>password123</b>
        </p>
      </div>
    </div>
  );
}
