import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Icon } from './icons';
import { Avatar } from './ui';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/admin', label: 'ภาพรวม', icon: Icon.Grid, end: true },
  { to: '/admin/employees', label: 'จัดการพนักงาน', icon: Icon.Users },
  { to: '/admin/rewards', label: 'จัดการของรางวัล', icon: Icon.Gift },
  { to: '/admin/events', label: 'จัดการกิจกรรม', icon: Icon.Calendar },
  { to: '/admin/points', label: 'จัดการคะแนน', icon: Icon.History },
  {
    label: 'ประกาศและเนื้อหา',
    icon: Icon.Megaphone,
    children: [
      { to: '/admin/notifications', label: 'Notifications' },
      { to: '/admin/content/banner', label: 'Banner' },
      { to: '/admin/content/faq', label: 'FAQ' },
      { to: '/admin/content/terms', label: 'Terms & Policy' },
    ],
  },
  {
    label: 'ตั้งค่าระบบ',
    icon: Icon.Settings,
    children: [
      { to: '/admin/settings/membership', label: 'Membership' },
      { to: '/admin/settings/accounts', label: 'Admin Accounts' },
      { to: '/admin/settings/audit', label: 'Audit Logs' },
      { to: '/admin/settings/system', label: 'System Settings' },
    ],
  },
];

export default function AdminShell({ title, breadcrumb, actions, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroup, setOpenGroup] = useState('ประกาศและเนื้อหา');

  const itemClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-medium transition-colors ${
      isActive ? 'bg-primary text-white' : 'text-slate hover:bg-primary-wash'
    }`;

  return (
    <div className="flex min-h-dvh bg-page">
      <aside
        className={`relative hidden shrink-0 border-r border-line bg-white transition-[width] lg:block ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-line px-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-line text-2xs font-bold text-muted">
            LOGO
          </span>
          {!collapsed && <span className="truncate text-sm font-semibold text-slate">ระบบสะสมคะแนนพนักงาน</span>}
        </div>

        <button
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
          className="absolute -right-3 top-28 z-10 grid h-7 w-7 place-items-center rounded-full border border-line bg-white text-primary shadow-card"
        >
          <span className={collapsed ? 'rotate-180' : ''}>
            <Icon.Back size={16} />
          </span>
        </button>

        <nav className="space-y-1 p-3">
          {NAV.map((item) =>
            item.children ? (
              <div key={item.label}>
                <button
                  onClick={() => setOpenGroup(openGroup === item.label ? null : item.label)}
                  className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-medium text-slate hover:bg-primary-wash"
                >
                  <item.icon size={20} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <span className={openGroup === item.label ? 'rotate-180' : ''}>
                        <Icon.Chevron size={16} />
                      </span>
                    </>
                  )}
                </button>
                {!collapsed && openGroup === item.label && (
                  <ul className="mb-1 ml-5 space-y-0.5 border-l border-line pl-3">
                    {item.children.map((child) => (
                      <li key={child.to}>
                        <NavLink
                          to={child.to}
                          className={({ isActive }) =>
                            `block rounded-[6px] px-2 py-1.5 text-sm ${
                              isActive ? 'font-semibold text-primary' : 'text-muted hover:text-slate'
                            }`
                          }
                        >
                          {child.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
                <item.icon size={20} />
                {!collapsed && item.label}
              </NavLink>
            )
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white px-5">
          <div className="min-w-0 flex-1">
            {breadcrumb && <p className="text-2xs text-muted">{breadcrumb}</p>}
            <h1 className="truncate text-xl font-bold text-ink">{title}</h1>
          </div>
          {actions}
          <Link to="/admin/notifications" className="text-slate" aria-label="การแจ้งเตือน">
            <Icon.Bell size={22} />
          </Link>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="flex items-center gap-2 rounded-pill border border-line px-3 py-1.5 text-sm text-slate hover:bg-primary-wash"
          >
            <Avatar name={user?.display_name} size={28} />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </header>

        <main className="flex-1 p-5">{children}</main>

        {/* จอเล็กไม่มีเมนูข้าง จึงมีแถบนำทางล่างให้แทน */}
        <nav className="sticky bottom-0 border-t border-line bg-white lg:hidden">
          <ul className="no-scrollbar flex overflow-x-auto">
            {NAV.filter((i) => i.to).map((item) => (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex min-w-[88px] flex-col items-center gap-1 px-2 py-2.5 text-2xs ${
                      isActive ? 'text-primary' : 'text-muted'
                    }`
                  }
                >
                  <item.icon size={20} />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
