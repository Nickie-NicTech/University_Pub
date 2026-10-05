import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { BookOpenCheck, UserPlus } from 'lucide-react';
import API from '../api';
import './AdminPortal.css';

export default function SignUp() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('STUDENT');
    const [universityId, setUniversityId] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const { data } = await API.post('users/register/', { username, password, role, university_id: universityId });
            alert(`Registration completed for ${data.first_name} ${data.last_name}. Please sign in.`);
            navigate('/login');
        } catch (err: unknown) {
            const details = axios.isAxiosError(err) ? err.response?.data : null;
            setError(details ? Object.entries(details).map(([field, messages]) => `${field.replaceAll('_', ' ')}: ${Array.isArray(messages) ? messages.join(' ') : messages}`).join(' ') : 'Registration could not be completed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="admin-login-page admin-signup-page">
            <aside className="admin-login-aside">
                <div className="admin-login-logo"><BookOpenCheck size={24} /> UNIPUB</div>
                <div className="admin-login-note">YOUR RESEARCH<br />STARTS HERE</div>
                <div className="admin-login-lines" aria-hidden="true" />
            </aside>
            <form className="admin-login-form admin-signup-form" onSubmit={handleSubmit}>
                <span className="admin-breadcrumb">UNIPUB / CREATE ACCOUNT</span>
                <h1>Create your profile</h1>
                <p>Verify your University of Botswana student or staff identity to join the repository.</p>
                {error && <div className="admin-alert" role="alert">{error}</div>}
                <label>Username<input type="text" autoComplete="username" value={username} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setUsername(event.target.value)} required /></label>
                <label>Password<input type="password" autoComplete="new-password" value={password} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)} required /></label>
                <label>University status
                    <select value={role} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setRole(event.target.value)}>
                        <option value="STUDENT">Student</option>
                        <option value="LECTURER">Lecturer</option>
                    </select>
                </label>
                <label>{role === 'STUDENT' ? 'Student ID' : 'Employee ID'}
                    <input type="text" inputMode="numeric" autoComplete="off" value={universityId} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setUniversityId(event.target.value.replace(/\D/g, ''))} placeholder={role === 'STUDENT' ? 'e.g., 202600001' : 'e.g., 10000001'} minLength={role === 'STUDENT' ? 9 : 8} maxLength={role === 'STUDENT' ? 9 : 8} pattern={role === 'STUDENT' ? '\\d{9}' : '[12]\\d{7}'} required />
                    <small className="admin-signup-hint">Your name, email, and department will be fetched from the University directory.</small>
                </label>
                <button className="admin-primary" type="submit" disabled={busy}>
                    {busy ? 'Verifying identity...' : <><UserPlus size={17} /> Verify &amp; register</>}
                </button>
                <p className="admin-signup-login">Already registered? <Link to="/login">Log in</Link></p>
            </form>
        </section>
    );
}
