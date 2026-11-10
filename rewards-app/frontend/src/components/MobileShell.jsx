import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './icons';
import { useT } from '../lib/i18n';

const TABS = [
  { to: '/', key: 'nav.home', icon: Icon.Home },
  { to: '/events', key: 'nav.events', icon: Icon.Calendar },
  { to: '/rewards', key: 'nav.rewards', icon: Icon.Gift },
  { to: '/profile', key: 'nav.profile', icon: Icon.User },
];

/**
 * ครอบทุกหน้าฝั่งพนักงาน บนจอใหญ่จะจำกัดความกว้างไว้เท่ามือถือและจัดกลางหน้า
 * title  : ข้อความกลางหัวข้อ ถ้าไม่ส่งจะไม่แสดงแถบหัวข้อ
 * back   : แสดงปุ่มย้อนกลับ ส่งเป็น string เพื่อระบุปลายทาง
 */
export default function MobileShell({
  title,
  back = false,
  bell = true,
  bare = false,
  unread = 0,
  children,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();

  return (
    <div className="mx-auto flex min-h-dvh max-w-mobile flex-col bg-page shadow-[0_0_60px_-30px_rgba(25,59,68,.4)]">
      {title && (
        <header
          className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-white px-3 py-3"
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
        >
          {back ? (
            <button
              onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
              className="flex items-center gap-0.5 text-slate"
              aria-label={t('common.back')}
            >
              <Icon.Back size={20} />
              <span className="text-[15px]">{t('common.back')}</span>
            </button>
          ) : (
            <span className="w-14" />
          )}

          <h1 className="flex-1 truncate text-center text-[19px] font-bold text-primary">{title}</h1>

          {bell ? (
            <Link to="/notifications" className="relative w-14 text-right text-slate" aria-label={t('common.notifications')}>
              <Icon.Bell size={22} className="ml-auto" />
              {unread > 0 && (
                <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-white" />
              )}
            </Link>
          ) : (
            <span className="w-14" />
          )}
        </header>
      )}

      <main className={`flex-1 ${bare ? '' : 'pb-28'}`}>{children}</main>

      {!bare && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-mobile border-t border-line bg-white"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <ul className="flex items-end">
            {TABS.map(({ to, key, icon: Ico }) => {
              const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

              return (
                <li key={key} className="flex-1">
                  <Link
                    to={to}
                    className={`flex flex-col items-center gap-1 pb-2 pt-2.5 text-2xs font-medium ${
                      active ? 'text-primary' : 'text-muted'
                    }`}
                  >
                    <Ico size={22} />
                    {t(key)}
                    <span className={`h-0.5 w-7 rounded-pill ${active ? 'bg-primary' : 'bg-transparent'}`} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
