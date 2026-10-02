import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import API from '../api';

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
        <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9'
        }}>
            <form onSubmit={handleSubmit} style={{
                background: '#fff', padding: '32px', borderRadius: '12px', width: '100%', maxWidth: '420px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', boxSizing: 'border-box'
            }}>
                <h2 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '1.5rem', fontWeight: 700 }}>Create Profile</h2>
                <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '0.875rem' }}>Verify your University of Botswana student or staff identity.</p>
                {error && <p role="alert" style={{ margin: '0 0 16px', padding: '10px', borderRadius: '4px', background: '#fff1f0', color: '#9b2c24', fontSize: '0.82rem' }}>{error}</p>}
                
                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Username</label>
                    <input type="text" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)} required style={formInputStyle}/>
                </div>
                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Password</label>
                    <input type="password" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} required style={formInputStyle}/>
                </div>
                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>University status</label>
                    <select value={role} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRole(e.target.value)} style={formInputStyle}>
                        <option value="STUDENT">Student</option>
                        <option value="LECTURER">Lecturer</option>
                    </select>
                </div>
                <div style={{ marginBottom: '24px' }}>
                    <label style={labelStyle}>{role === 'STUDENT' ? 'Student ID' : 'Employee ID'}</label>
                    <input type="text" inputMode="numeric" autoComplete="off" value={universityId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUniversityId(e.target.value.replace(/\D/g, ''))} placeholder={role === 'STUDENT' ? 'e.g., 202600001' : 'e.g., 10000001'} minLength={role === 'STUDENT' ? 9 : 8} maxLength={role === 'STUDENT' ? 9 : 8} pattern={role === 'STUDENT' ? '\\d{9}' : '[12]\\d{7}'} required style={formInputStyle}/>
<<<<<<< HEAD
                    <p style={{ marginTop: '-4px', color: '#64748b', fontSize: '0.75rem' }}>Your details will be fetched from the University directory.</p>
=======
                    <p style={{ marginTop: '-16px', color: '#64748b', fontSize: '0.75rem' }}>Your name, email, and department will be fetched from the University directory.</p>
>>>>>>> 532f38b (add new files and initial commit)
                </div>
                
                <button type="submit" disabled={busy} style={{
                    width: '100%', padding: '10px', background: '#0284c7', color: '#fff',
                    border: 'none', borderRadius: '6px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', marginBottom: '12px', opacity: busy ? 0.7 : 1
                }}>{busy ? 'Verifying identity...' : 'Verify & register'}</button>
                <p style={{ margin: 0, fontSize: '0.825rem', textAlign: 'center', color: '#64748b' }}>
                    Already registered? <Link to="/login" style={{ color: '#0284c7', textDecoration: 'none' }}>Log In</Link>
                </p>
            </form>
        </div>
    );
}

const labelStyle = { display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px', color: '#475569' };
const formInputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.95rem', boxSizing: 'border-box' };
