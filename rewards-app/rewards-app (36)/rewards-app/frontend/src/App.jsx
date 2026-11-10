import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Spinner } from './components/ui';

import Login from './pages/user/Login';
import Terms from './pages/user/Terms';
import Home from './pages/user/Home';
import Events from './pages/user/Events';
import Rewards from './pages/user/Rewards';
import QrPage from './pages/user/QrPage';
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

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** ต้องล็อกอินก่อน และพนักงานต้องกดยอมรับ PDPA ก่อนเข้าหน้าอื่น */
function RequireAuth({ children, admin = false }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  if (!admin && user.role === 'admin') return <Navigate to="/admin" replace />;
  if (!admin && !user.terms_accepted_at) return <Navigate to="/terms" replace />;

  return children;
}

export default function App() {
  const { user, ready } = useAuth();

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route
          path="/login"
          element={
            !ready ? (
              <Spinner />
            ) : user ? (
              <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />
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
        <Route path="/qr" element={<RequireAuth><QrPage /></RequireAuth>} />
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
        <Route path="/admin" element={<RequireAuth admin><Dashboard /></RequireAuth>} />
        <Route path="/admin/employees" element={<RequireAuth admin><Employees /></RequireAuth>} />
        <Route path="/admin/rewards" element={<RequireAuth admin><AdminRewards /></RequireAuth>} />
        <Route path="/admin/events" element={<RequireAuth admin><AdminEvents /></RequireAuth>} />
        <Route path="/admin/points" element={<RequireAuth admin><AdminPoints /></RequireAuth>} />
        <Route path="/admin/notifications" element={<RequireAuth admin><AdminNotifications /></RequireAuth>} />
        <Route path="/admin/content/:key" element={<RequireAuth admin><AdminContent /></RequireAuth>} />
        <Route path="/admin/settings/:key" element={<RequireAuth admin><AdminSettings /></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
