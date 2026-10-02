import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { BookOpen, Library, LogIn, LogOut, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import Login from './components/Login';
import SignUp from './components/signUp';
import Publications from './components/Publications';
import AccountSidebar from './components/AccountSidebar';
import AdminPortal from './components/AdminPortal';
import API from './api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('access_token'));
  const decodedUser = token ? jwtDecode(token) : null;
  const user = decodedUser?.role === 'APPROVER' ? { ...decodedUser, role: 'REVIEWER' } : decodedUser;
  const [broadcasts, setBroadcasts] = useState([]);

  useEffect(() => {
    if (!token) return;
    API.get('broadcasts/').then(({ data }) => setBroadcasts(data)).catch(() => setBroadcasts([]));
  }, [token]);

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
              <Link to="/admin" style={{ marginLeft: '18px', color: '#cbd5e1', textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                <ShieldCheck size={16} aria-hidden="true" />
                Admin portal
              </Link>
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {user ? (
              <>
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
              <Route path="/admin" element={<AdminPortal isAdmin={user?.role === 'ADMIN'} onLoginSuccess={(tok) => setToken(tok)} onLogout={handleLogout} />} />
              <Route path="/login" element={!token ? <Login onLoginSuccess={(tok) => setToken(tok)} /> : <Navigate to="/" />} />
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
