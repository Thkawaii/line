import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { Avatar } from '../../components/ui';
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
    </MobileShell>
  );
}
