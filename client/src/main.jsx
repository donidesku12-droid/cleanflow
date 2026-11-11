import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import { AuthProvider, ToastProvider, useAuth } from './lib/context.jsx';
import { PageLoader } from './components/ui.jsx';
import AppLayout from './components/AppLayout.jsx';

const Landing = lazy(() => import('./pages/public/Landing.jsx'));
const PricingPage = lazy(() => import('./pages/public/PricingPage.jsx'));
const AuthPages = lazy(() => import('./pages/public/Auth.jsx'));
const Legal = lazy(() => import('./pages/public/Legal.jsx'));
const BookingPage = lazy(() => import('./pages/public/BookingPage.jsx'));
const ChatPage = lazy(() => import('./pages/public/ChatPage.jsx'));
const NotFound = lazy(() => import('./pages/public/NotFound.jsx'));

const Dashboard = lazy(() => import('./pages/app/Dashboard.jsx'));
const Bookings = lazy(() => import('./pages/app/Bookings.jsx'));
const Customers = lazy(() => import('./pages/app/Customers.jsx'));
const CustomerDetail = lazy(() => import('./pages/app/CustomerDetail.jsx'));
const Employees = lazy(() => import('./pages/app/Employees.jsx'));
const EmployeeDetail = lazy(() => import('./pages/app/EmployeeDetail.jsx'));
const Services = lazy(() => import('./pages/app/Services.jsx'));
const Analytics = lazy(() => import('./pages/app/Analytics.jsx'));
const Assistant = lazy(() => import('./pages/app/Assistant.jsx'));
const Notifications = lazy(() => import('./pages/app/Notifications.jsx'));
const Settings = lazy(() => import('./pages/app/Settings.jsx'));

function RequireAuth({ children, roles }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { loading, user } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

const admin = ['owner', 'manager'];

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/legal/:doc" element={<Legal />} />
        <Route path="/login" element={<GuestOnly><AuthPages mode="login" /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><AuthPages mode="signup" /></GuestOnly>} />
        <Route path="/forgot-password" element={<AuthPages mode="forgot" />} />
        <Route path="/reset-password" element={<AuthPages mode="reset" />} />
        <Route path="/accept-invite" element={<AuthPages mode="invite" />} />
        <Route path="/book/:slug" element={<BookingPage />} />
        <Route path="/chat/:slug" element={<ChatPage />} />

        <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="customers" element={<RequireAuth roles={admin}><Customers /></RequireAuth>} />
          <Route path="customers/:id" element={<RequireAuth roles={admin}><CustomerDetail /></RequireAuth>} />
          <Route path="employees" element={<RequireAuth roles={admin}><Employees /></RequireAuth>} />
          <Route path="employees/:id" element={<EmployeeDetail />} />
          <Route path="services" element={<RequireAuth roles={admin}><Services /></RequireAuth>} />
          <Route path="analytics" element={<RequireAuth roles={admin}><Analytics /></RequireAuth>} />
          <Route path="assistant" element={<RequireAuth roles={admin}><Assistant /></RequireAuth>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
