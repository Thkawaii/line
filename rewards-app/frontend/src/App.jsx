import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { isBackOffice } from './lib/org';
import { Spinner } from './components/ui';
import TierLevelUpWatcher from './components/TierLevelUp';
import AnnouncementGate from './components/AnnouncementGate';
import FeedbackGate from './components/FeedbackGate';

import Login from './pages/user/Login';
import Terms from './pages/user/Terms';
import Home from './pages/user/Home';
import Events from './pages/user/Events';
import Rewards from './pages/user/Rewards';
import Profile from './pages/user/Profile';
import { PointsPage, PointsHistoryPage } from './pages/user/Points';
import { FavoritesPage, MyRewardsPage } from './pages/user/MyStuff';
import { FaqPage, NotificationsPage, PolicyPage } from './pages/user/Info';

import Dashboard from './pages/admin/Dashboard';
import Employees from './pages/admin/Employees';
import AdminRewards from './pages/admin/Rewards';
import AdminEvents from './pages/admin/Events';
import { AdminNotifications, AdminPoints } from './pages/admin/PointsAndContent';
import AdminContent from './pages/admin/Content';
import AdminSettings from './pages/admin/Settings';
import Membership from './pages/user/Membership';
import AdminNews from './pages/admin/News';
import AdminFeedback from './pages/admin/Feedback';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * ต้องล็อกอินก่อน และพนักงานต้องกดยอมรับ PDPA ก่อนเข้าหน้าอื่น
 *
 * admin = true  เฉพาะผู้ดูแลระบบตัวจริง ใช้กับกลุ่ม "ตั้งค่าระบบ"
 * staff = true  ผู้ดูแลระบบ ฝ่ายธุรการ และพนักงานแผนกหลังบ้าน (GA, ER, HR, HRM, HRD)
 */
function RequireAuth({ children, admin = false, staff = false }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  const backOffice = admin || staff;
  const office = isBackOffice(user);

  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  /*
    ไม่ใช่ผู้ดูแลระบบตัวจริง แต่เข้าหลังบ้านได้ ให้ไปหน้าแรกของหลังบ้านแทน
    ไม่ใช่เด้งออกไปฝั่งพนักงาน ซึ่งจะงงว่าทำไมหลุดออกมา

    เช็กว่าอยู่ที่ /admin อยู่แล้วหรือยัง เพราะถ้าส่งกลับไปหน้าเดิมที่เพิ่งถูกปฏิเสธ
    จะวนเด้งไม่จบแล้วผู้ใช้เห็นหน้าขาวเปล่า ๆ โดยไม่มีข้อความบอกอะไรเลย
  */
  if (admin && user.role !== 'admin') {
    const fallback = office ? '/admin' : '/';
    if (location.pathname === fallback) return <Navigate to="/" replace />;
    return <Navigate to={fallback} replace />;
  }
  if (staff && !office) return <Navigate to="/" replace />;

  /*
    พนักงานแผนกหลังบ้านใช้ได้ทั้งสองฝั่ง จึงห้ามเด้งเขาออกจากฝั่งพนักงาน
    เด้งเฉพาะบัญชีที่มีไว้ทำงานหลังบ้านอย่างเดียว (role admin กับ ga)
    ซึ่งไม่มีคะแนนหรือของรางวัลเป็นของตัวเอง เข้าไปก็เห็นหน้าว่าง
  */
  const backOfficeOnly = user.role === 'admin' || user.role === 'ga';
  if (!backOffice && backOfficeOnly) return <Navigate to="/admin" replace />;
  if (!backOffice && !user.terms_accepted_at) return <Navigate to="/terms" replace />;

  return children;
}

export default function App() {
  const { user, ready } = useAuth();

  return (
    <>
      <ScrollToTop />
      <TierLevelUpWatcher />
      {/* ประกาศที่ต้องกดรับทราบ ขึ้นทับทุกหน้าจนกว่าพนักงานจะอ่านครบและกดรับทราบ */}
      <AnnouncementGate />

      {/* แบบประเมินความพึงพอใจ ขึ้นก่อนกิจกรรมจบตามเวลาที่ตั้งไว้ ปิดทิ้งได้
          z-index ต่ำกว่าประกาศ ถ้ามีทั้งคู่พร้อมกันจะอ่านประกาศก่อน */}
      <FeedbackGate />
      <Routes>
        <Route
          path="/login"
          element={
            !ready ? (
              <Spinner />
            ) : user ? (
              <Navigate
                to={user.role === 'admin' || user.role === 'ga' ? '/admin' : '/'}
                replace
              />
            ) : (
              <Login />
            )
          }
        />
        <Route path="/terms" element={user ? <Terms /> : <Navigate to="/login" replace />} />

        {/* ฝั่งพนักงาน */}
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/events" element={<RequireAuth><Events /></RequireAuth>} />
        <Route path="/rewards" element={<RequireAuth><Rewards /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/points" element={<RequireAuth><PointsPage /></RequireAuth>} />
        <Route path="/points/history" element={<RequireAuth><PointsHistoryPage /></RequireAuth>} />
        <Route path="/favorites" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
        <Route path="/my-rewards" element={<RequireAuth><MyRewardsPage /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/faq" element={<RequireAuth><FaqPage /></RequireAuth>} />
        <Route path="/policy/:key" element={<RequireAuth><PolicyPage /></RequireAuth>} />
        <Route path="/membership" element={<RequireAuth><Membership /></RequireAuth>} />

        {/* ฝั่งแอดมิน */}
        <Route path="/admin" element={<RequireAuth staff><Dashboard /></RequireAuth>} />
        <Route path="/admin/employees" element={<RequireAuth staff><Employees /></RequireAuth>} />
        <Route path="/admin/rewards" element={<RequireAuth staff><AdminRewards /></RequireAuth>} />
        {/* ฝ่ายธุรการเข้าดูได้ เพื่อดูรายชื่อและความคืบหน้ารายแผนกของแต่ละกิจกรรม */}
        <Route path="/admin/events" element={<RequireAuth staff><AdminEvents /></RequireAuth>} />
        <Route path="/admin/points" element={<RequireAuth staff><AdminPoints /></RequireAuth>} />
        <Route path="/admin/notifications" element={<RequireAuth staff><AdminNotifications /></RequireAuth>} />
        <Route path="/admin/content/:key" element={<RequireAuth staff><AdminContent /></RequireAuth>} />
        <Route path="/admin/settings/:key" element={<RequireAuth staff><AdminSettings /></RequireAuth>} />
        <Route path="/admin/news" element={<RequireAuth staff><AdminNews /></RequireAuth>} />
        <Route path="/admin/feedback" element={<RequireAuth staff><AdminFeedback /></RequireAuth>} />


        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
