import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { BookOpenCheck, LogIn } from 'lucide-react';
import API from '../api';
import './AdminPortal.css';

export default function Login({ onLoginSuccess }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const res = await API.post('token/', { username, password });
            localStorage.setItem('access_token', res.data.access);
            localStorage.setItem('refresh_token', res.data.refresh);
            onLoginSuccess(res.data.access);
            const user = jwtDecode(res.data.access);
            navigate(user.role === 'ADMIN' ? '/admin' : '/');
        } catch (loginError) {
            setError(loginError.response?.data?.detail || 'Sign-in failed. Check your username and password.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="admin-login-page">
            <aside className="admin-login-aside">
                <div className="admin-login-logo"><BookOpenCheck size={24} /> UNIPUB</div>
                <div className="admin-login-note">UNIVERSITY<br />REPOSITORY</div>
                <div className="admin-login-lines" aria-hidden="true" />
            </aside>
            <form className="admin-login-form" onSubmit={handleSubmit}>
                <span className="admin-breadcrumb">UNIPUB / SECURE ACCESS</span>
                <h1>Sign in to UniPub</h1>
                <p>Use your account to access the repository. Students, lecturers, reviewers, and administrators all sign in here.</p>
                {error && <div className="admin-alert" role="alert">{error}</div>}
                <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
                <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                <button className="admin-primary" disabled={busy}>
                    {busy ? 'Signing in...' : <><LogIn size={17} /> Sign in</>}
                </button>
            </form>
        </section>
    );
}
