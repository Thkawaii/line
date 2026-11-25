import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { Avatar, Modal, Notice, useToast } from '../../components/ui';
import TierProgress from '../../components/TierProgress';
import { Icon } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { num, thaiDate } from '../../lib/format';
import { tierCard, tierCircle, tierIcon } from '../../lib/tier';
import { useT } from '../../lib/i18n';

const MENU = [
  { to: '/points', key: 'profile.menuPoints', icon: Icon.Wallet },
  { to: '/favorites', key: 'profile.menuFavorites', icon: Icon.Heart },
  { to: '/my-rewards', key: 'profile.menuMyRewards', icon: Icon.Gift },
  { to: '/notifications', key: 'profile.menuNotifications', icon: Icon.Bell },
  { to: '/faq', key: 'profile.menuFaq', icon: Icon.Alert },
  { to: '/policy/terms', key: 'profile.menuTerms', icon: Icon.Ticket },
];

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [progress, setProgress] = useState(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    api.tiers().then(setProgress).catch(() => setProgress({ tierTarget: null, nextTier: null }));
  }, []);

  if (!user) return null;
  const target = progress?.tierTarget;
  const next = progress?.nextTier;
  const tierColor = progress?.current?.tier_color;
  const TierIcon = tierIcon(tierColor);
  const theme = tierCard(tierColor);

  return (
    <MobileShell title={t('profile.title')} back="/">
      <div className="space-y-3 px-4 py-4">
        <section className="card divide-y divide-line">
          <div className="flex gap-3 p-4">
            <Avatar name={user.display_name} src={user.avatar_url} size={64} />
            <div className="min-w-0 text-sm text-slate">
              <p className="truncate">{t('profile.name')} : {user.display_name}</p>
              <p className="mt-1">{t('profile.employeeCode')} : {user.employee_code}</p>
              <p className="mt-1">{t('profile.department')} : {user.department}</p>
            </div>
          </div>
          <div className="p-4 text-sm text-slate">
            <p>{t('profile.birthday')} : {user.birth_date ? thaiDate(user.birth_date, { full: true }) : '-'}</p>
            <p className="mt-1">{t('profile.contact')} : {user.phone || '-'}</p>
          </div>
        </section>

        <section className={`rounded-card p-4 shadow-card ${theme.surface}`}>
          <div className="flex items-center justify-between">
            <p className={`text-sm font-semibold ${theme.title}`}>
              {t('profile.memberLevel', { tier: user.tier })}
            </p>
            <Link to="/membership" className={`text-sm ${theme.link}`}>
              {t('profile.seeBenefits')} ›
            </Link>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tierCircle(tierColor)}`}>
              <TierIcon size={20} />
            </span>
            <div className="flex-1">
              <TierProgress points={user.points} target={target} nextTier={next} theme={theme} />
            </div>
          </div>
        </section>

        <nav className="card divide-y divide-line overflow-hidden">
          {MENU.map((item) => (
            <Link key={item.to} to={item.to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-primary-wash">
              <span className="text-primary">
                <item.icon size={20} />
              </span>
              <span className="flex-1 text-[15px] text-slate">{t(item.key)}</span>
              <span className="text-muted">
                <Icon.Next size={18} />
              </span>
            </Link>
          ))}

          {/* เปลี่ยนรหัสผ่านเองได้ ไม่ต้องรอผู้ดูแลตั้งให้
              อยู่ในเมนูเดียวกับรายการอื่นเพื่อให้หาเจอที่เดิมที่คนเคยหา */}
          <button
            onClick={() => setPasswordOpen(true)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-primary-wash"
          >
            <span className="text-primary">
              <Icon.Lock size={20} />
            </span>
            <span className="flex-1 text-[15px] text-slate">{t('profile.changePassword')}</span>
            <span className="text-muted">
              <Icon.Next size={18} />
            </span>
          </button>
        </nav>

        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="btn-ghost w-full text-danger"
        >
          <Icon.Logout size={18} /> {t('profile.logout')}
        </button>
      </div>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </MobileShell>
  );
}

/*
หน้าต่างเปลี่ยนรหัสผ่านของตัวเอง

ถามรหัสเดิมด้วยเสมอ แม้จะล็อกอินอยู่แล้ว เพราะเครื่องที่เปิดทิ้งไว้
คือเครื่องที่ใครก็เดินมาเปลี่ยนรหัสล็อกเจ้าตัวออกได้

ให้พิมพ์รหัสใหม่สองครั้ง เพราะช่องรหัสผ่านมองไม่เห็นสิ่งที่พิมพ์
พิมพ์ผิดครั้งเดียวแล้วกดบันทึก คือล็อกตัวเองออกจากระบบทันที
*/
function ChangePasswordModal({ open, onClose }) {
  const t = useT();
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ current: '', next: '', confirm: '' });
      setError('');
    }
  }, [open]);

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (form.next !== form.confirm) {
      setError(t('profile.passwordMismatch'));
      return;
    }

    setBusy(true);
    try {
      await api.changePassword({ currentPassword: form.current, newPassword: form.next });
      toast(t('profile.passwordChanged'), 'primary');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    ['current', t('profile.currentPassword')],
    ['next', t('profile.newPassword')],
    ['confirm', t('profile.confirmPassword')],
  ];

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <form onSubmit={submit} className="p-6">
        <h2 className="pr-10 text-lg font-bold text-ink">{t('profile.changePassword')}</h2>

        {error && (
          <div className="mt-3">
            <Notice>{error}</Notice>
          </div>
        )}

        {fields.map(([key, label], index) => (
          <div key={key}>
            <label className={`label ${index === 0 ? 'mt-4' : 'mt-3'}`} htmlFor={`pw-${key}`}>
              {label}
            </label>
            <input
              id={`pw-${key}`}
              type="password"
              className="field"
              autoComplete={key === 'current' ? 'current-password' : 'new-password'}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              required
            />
          </div>
        ))}
        <button type="submit" disabled={busy} className="btn-primary mt-5 w-full">
          {t('profile.savePassword')}
        </button>
      </form>
    </Modal>
  );
}
