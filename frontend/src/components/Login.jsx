import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';

export default function Login({ onLoginSuccess }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Send standard login request to Django Simple JWT backend
            const res = await API.post('token/', { username, password });

            // Save both tokens securely locally
            localStorage.setItem('access_token', res.data.access);
            localStorage.setItem('refresh_token', res.data.refresh);

            // Notify App.jsx that login succeeded
            onLoginSuccess(res.data.access);

            // Move user back to the repository panel view
            navigate('/');
        } catch (err) {
            alert('Authentication rejected. Verify profile credentials.');
        }
    };

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9'
        }}>
            <form onSubmit={handleSubmit} style={{
                background: '#fff', padding: '32px', borderRadius: '12px', width: '100%', maxWidth: '400px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', boxSizing: 'border-box'
            }}>
                <h2 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '1.5rem', fontWeight: 700 }}>Account Authorization</h2>
                <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '0.875rem' }}>Access the secure UB repository instance node.</p>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px', color: '#475569' }}>Username</label>
                    <input type="text" onChange={e => setUsername(e.target.value)} required style={formInputStyle} />
                </div>
                <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px', color: '#475569' }}>Password</label>
                    <input type="password" onChange={e => setPassword(e.target.value)} required style={formInputStyle} />
                </div>

                <button type="submit" style={{
                    width: '100%', padding: '10px', background: '#1e293b', color: '#fff',
                    border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer'
                }}>Authenticate Profile</button>
            </form>
        </div>
    );
}

// Reusable styling layout for input boundaries
const formInputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.95rem',
    boxSizing: 'border-box'
};
