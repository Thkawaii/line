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

// แถบล่างบนมือถือ เลือกเฉพาะที่ใช้บ่อยที่สุด ชื่อสั้นให้พอดีช่อง
const MOBILE_TABS = [
  { to: '/admin', short: 'ภาพรวม', icon: Icon.Grid, end: true },
  { to: '/admin/employees', short: 'พนักงาน', icon: Icon.Users },
  { to: '/admin/events', short: 'กิจกรรม', icon: Icon.Calendar },
  { to: '/admin/rewards', short: 'ของรางวัล', icon: Icon.Gift },
];

export default function AdminShell({ title, breadcrumb, actions, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroup, setOpenGroup] = useState('ประกาศและเนื้อหา');
  const [drawer, setDrawer] = useState(false);

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
          {/* โลโก้เป็นคำแนวนอน ใช้ max-w-full ให้ย่อตามได้เวลาเมนูถูกย่อ */}
          <img
            src="/kobelco-logo.png"
            alt="KOBELCO"
            width={89}
            height={24}
            className="h-6 w-auto max-w-full rounded-[3px] object-contain"
          />
          {!collapsed && <span className="truncate text-sm font-semibold text-slate">ระบบสะสมคะแนน</span>}
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
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            {breadcrumb && <p className="text-2xs text-muted">{breadcrumb}</p>}
            <h1 className="truncate text-lg font-bold text-ink sm:text-xl">{title}</h1>
          </div>

          {/* ปุ่มประจำหน้าบนจอเล็กย้ายลงบรรทัดถัดไป จะได้ไม่เบียดกับชื่อหน้า */}
          {actions && <div className="order-last flex w-full gap-2 sm:order-none sm:w-auto">{actions}</div>}
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

        <main className="flex-1 p-4 sm:p-5">{children}</main>

        {/* จอเล็กไม่มีเมนูข้าง จึงมีแถบนำทางล่างให้แทน
            วางแค่สี่อันที่ใช้บ่อย ที่เหลืออยู่ในปุ่มเมนู เพราะแถบที่เลื่อนได้ทำให้คนหาของไม่เจอ */}
        <nav className="sticky bottom-0 z-20 border-t border-line bg-white lg:hidden">
          <ul className="flex">
            {MOBILE_TABS.map((item) => (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 px-1 py-2 text-2xs ${
                      isActive ? 'text-primary' : 'text-muted'
                    }`
                  }
                >
                  <item.icon size={22} />
                  {item.short}
                </NavLink>
              </li>
            ))}

            <li className="flex-1">
              <button
                onClick={() => setDrawer(true)}
                className={`flex w-full flex-col items-center gap-1 px-1 py-2 text-2xs ${
                  drawer ? 'text-primary' : 'text-muted'
                }`}
              >
                <Icon.Menu size={22} />
                เมนู
              </button>
            </li>
          </ul>
        </nav>
      </div>

      {/* เมนูเต็มบนมือถือ มีทุกหน้ารวมถึงกลุ่มที่ซ้อนอยู่ */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-ink/40"
            onClick={() => setDrawer(false)}
            aria-label="ปิดเมนู"
          />

          <nav className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white pb-6 shadow-pop">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-4 py-3">
              <h2 className="font-semibold text-ink">เมนูทั้งหมด</h2>
              <button onClick={() => setDrawer(false)} className="text-muted" aria-label="ปิด">
                <Icon.Close size={20} />
              </button>
            </div>

            <ul className="p-3">
              {NAV.map((item) =>
                item.children ? (
                  <li key={item.label} className="mt-2">
                    <p className="flex items-center gap-2 px-3 py-2 text-2xs font-semibold text-muted">
                      <item.icon size={16} /> {item.label}
                    </p>
                    <ul>
                      {item.children.map((child) => (
                        <li key={child.to}>
                          <NavLink
                            to={child.to}
                            onClick={() => setDrawer(false)}
                            className={({ isActive }) =>
                              `block rounded-[8px] py-2.5 pl-10 pr-3 text-[15px] ${
                                isActive ? 'bg-primary text-white' : 'text-slate'
                              }`
                            }
                          >
                            {child.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => setDrawer(false)}
                      className={itemClass}
                    >
                      <item.icon size={20} />
                      {item.label}
                    </NavLink>
                  </li>
                )
              )}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
