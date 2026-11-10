import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { Avatar, ProgressBar } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { num, thaiDate } from '../../lib/format';

const MENU = [
  { to: '/points', label: 'คะแนนของฉัน', icon: Icon.Wallet },
  { to: '/favorites', label: 'รายการโปรด', icon: Icon.Heart },
  { to: '/my-rewards', label: 'ของรางวัลของฉัน', icon: Icon.Gift },
  { to: '/notifications', label: 'การแจ้งเตือน', icon: Icon.Bell },
  { to: '/faq', label: 'คำถามที่พบบ่อย', icon: Icon.Alert },
  { to: '/policy/terms', label: 'ข้อกำหนดและเงื่อนไข', icon: Icon.Ticket },
];

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    api.tiers().then(setProgress).catch(() => setProgress({ tierTarget: null, nextTier: null }));
  }, []);

  if (!user) return null;
  const target = progress?.tierTarget;
  const next = progress?.nextTier;

  return (
    <MobileShell title="โปรไฟล์" back="/">
      <div className="space-y-3 px-4 py-4">
        <section className="card divide-y divide-line">
          <div className="flex gap-3 p-4">
            <Avatar name={user.display_name} src={user.avatar_url} size={64} />
            <div className="min-w-0 text-sm text-slate">
              <p className="truncate">ชื่อ : {user.display_name}</p>
              <p className="mt-1">รหัสพนักงาน : {user.employee_code}</p>
              <p className="mt-1">แผนก : {user.department}</p>
            </div>
          </div>
          <div className="p-4 text-sm text-slate">
            <p>วันเกิด : {user.birth_date ? thaiDate(user.birth_date, { full: true }) : '-'}</p>
            <p className="mt-1">ติดต่อ : {user.phone || '-'}</p>
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate">สมาชิกระดับ : {user.tier}</p>
            <Link to="/membership" className="text-sm text-primary">
              ดูสิทธิประโยชน์ ›
            </Link>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#4A5555] text-white">
              <Icon.Star size={20} />
            </span>
            <div className="flex-1">
              {target ? (
                <>
                  <p className="mb-1.5 text-sm text-slate">
                    อีก {num(Math.max(target - user.points, 0))} คะแนนเพื่อเลื่อนสู่ระดับ {next}
                  </p>
                  <ProgressBar value={user.points} max={target} />
                </>
              ) : (
                <p className="text-sm text-slate">คุณอยู่ในระดับสูงสุดแล้ว</p>
              )}
            </div>
          </div>
        </section>

        <nav className="card divide-y divide-line overflow-hidden">
          {MENU.map((item) => (
            <Link key={item.to} to={item.to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-primary-wash">
              <span className="text-primary">
                <item.icon size={20} />
              </span>
              <span className="flex-1 text-[15px] text-slate">{item.label}</span>
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
          <Icon.Logout size={18} /> ออกจากระบบ
        </button>
      </div>
    </MobileShell>
  );
}
