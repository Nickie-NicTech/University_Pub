import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { Bell, BookOpen, Library, LogIn, LogOut, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import Login from './components/Login';
import SignUp from './components/signUp';
import Publications from './components/Publications';
import LecturerReviewPanel from './components/LecturerReviewPanel';
import AccountSidebar from './components/AccountSidebar';
import AdminPortal from './components/AdminPortal';
import API from './api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('access_token'));
  const decodedUser = token ? jwtDecode(token) : null;
  const user = ['APPROVER', 'REVIEWER'].includes(decodedUser?.role)
    ? { ...decodedUser, role: 'LECTURER' }
    : decodedUser;
  const [broadcasts, setBroadcasts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState('');

  useEffect(() => {
    if (!token) return;
    API.get('broadcasts/').then(({ data }) => setBroadcasts(data)).catch(() => setBroadcasts([]));
    API.get('users/notifications/')
      .then(({ data }) => setNotifications(Array.isArray(data) ? data : []))
      .catch((error) => {
        console.error('Unable to load notifications:', error);
        setNotificationError('Unable to load notifications.');
      });
  }, [token]);

  const markNotificationRead = async (notification) => {
    if (notification.read_at) return;
    try {
      const { data } = await API.patch(`users/notifications/${notification.id}/read/`);
      setNotifications((current) => current.map((item) => item.id === data.id ? data : item));
    } catch (error) {
      console.error('Unable to mark notification as read:', error);
      setNotificationError('Unable to mark this notification as read.');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    setToken(null);
  };

  return (
    <Router>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        width: '100%',
        backgroundColor: '#f1f5f9',
        color: '#334155',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden'
      }}>
        {/* Application Navbar Banner */}
        <header style={{
          background: '#1e293b',
          color: '#f8fafc',
          padding: '0 24px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <h1 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Library size={21} aria-hidden="true" />
              UNIPUB
            </h1>
            <nav>
              <Link to="/" style={{ color: '#cbd5e1', textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                <BookOpen size={16} aria-hidden="true" />
                Repository
              </Link>
              {user?.role === 'ADMIN' && (
                <Link to="/admin" style={{ marginLeft: '18px', color: '#cbd5e1', textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                  <ShieldCheck size={16} aria-hidden="true" />
                  Admin portal
                </Link>
              )}
              {user?.role === 'LECTURER' && (
                <Link to="/lecturer/reviews" style={{ marginLeft: '18px', color: '#cbd5e1', textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                  <ShieldCheck size={16} aria-hidden="true" />
                  Review desk
                </Link>
              )}
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {user ? (
              <>
                <div style={{ position: 'relative' }}>
                  <button type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label={`Notifications${notifications.filter((item) => !item.read_at).length ? `, ${notifications.filter((item) => !item.read_at).length} unread` : ''}`} style={{ position: 'relative', border: 0, background: 'transparent', color: '#f8fafc', cursor: 'pointer', padding: '6px' }}>
                    <Bell size={19} aria-hidden="true" />
                    {notifications.some((item) => !item.read_at) && <span style={{ position: 'absolute', top: 2, right: 1, width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />}
                  </button>
                  {notificationsOpen && (
                    <section aria-label="Notifications" style={{ position: 'absolute', top: '42px', right: 0, zIndex: 30, width: 'min(360px, 85vw)', maxHeight: '420px', overflowY: 'auto', background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 12px 24px rgba(15,23,42,.2)', padding: '12px' }}>
                      <h2 style={{ margin: '2px 4px 10px', fontSize: '1rem' }}>Notifications</h2>
                      {notificationError && <p role="alert" style={{ margin: '8px 4px', color: '#b91c1c', fontSize: '.82rem' }}>{notificationError}</p>}
                      {notifications.length === 0 ? <p style={{ margin: '8px 4px', color: '#64748b', fontSize: '.85rem' }}>You have no notifications.</p> : notifications.map((notification) => (
                        <button key={notification.id} type="button" onClick={() => markNotificationRead(notification)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderTop: '1px solid #e2e8f0', background: notification.read_at ? '#fff' : '#f0f9ff', padding: '10px 6px', cursor: notification.read_at ? 'default' : 'pointer', color: 'inherit' }}>
                          <strong style={{ display: 'block', fontSize: '.85rem' }}>{notification.title}</strong>
                          <span style={{ display: 'block', marginTop: '3px', fontSize: '.8rem', lineHeight: 1.4 }}>{notification.message}</span>
                          <time style={{ display: 'block', marginTop: '4px', color: '#64748b', fontSize: '.72rem' }}>{new Date(notification.created_at).toLocaleString()}</time>
                        </button>
                      ))}
                    </section>
                  )}
                </div>
                <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                  <UserRound size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                  Active: <strong style={{ color: '#38bdf8' }}>{user.username || 'User'} ({user.role || 'MEMBER'})</strong>
                </span>
                <button onClick={handleLogout} style={{
                  background: '#475569', color: '#f8fafc', border: 'none',
                  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: '7px'
                }}><LogOut size={15} aria-hidden="true" />Logout</button>
              </>
            ) : (
              <div style={{ display: 'flex', gap: '12px' }}>
                <Link to="/login" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500, alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <LogIn size={15} aria-hidden="true" />
                  Sign In
                </Link>
                <Link to="/signup" style={{
                  background: '#0284c7', color: '#fff', textDecoration: 'none',
                  padding: '6px 16px', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: '7px'
                }}><UserPlus size={15} aria-hidden="true" />Sign Up</Link>
              </div>
            )}
          </div>
        </header>

        {/* Viewport Workspace */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', display: 'flex' }}>
          {token && user?.role !== 'ADMIN' && <AccountSidebar username={user?.username} />}
          <main style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
            <Routes>
              <Route path="/" element={<Publications user={user} />} />
              <Route path="/lecturer/reviews" element={user?.role === 'LECTURER' ? <LecturerReviewPanel user={user} /> : <Navigate to="/" replace />} />
              <Route path="/admin" element={user?.role === 'ADMIN' ? <AdminPortal onLogout={handleLogout} /> : <Navigate to={token ? '/' : '/login'} replace />} />
              <Route path="/login" element={!token ? <Login onLoginSuccess={(tok) => setToken(tok)} /> : <Navigate to={user?.role === 'ADMIN' ? '/admin' : '/'} replace />} />
              <Route path="/signup" element={!token ? <SignUp /> : <Navigate to="/" />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
        {broadcasts.length > 0 && user?.role !== 'ADMIN' && (
          <div role="status" style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '9px 18px', borderTop: '1px solid #d5e2dd', background: '#e8f1ec', color: '#1f4d49', fontSize: '0.78rem' }}>
            <strong style={{ flex: '0 0 auto' }}>{broadcasts[0].title}</strong>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{broadcasts[0].message}</span>
          </div>
        )}
      </div>
    </Router>
  );
}
