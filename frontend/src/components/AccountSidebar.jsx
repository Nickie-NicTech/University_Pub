import React, { useEffect, useState } from 'react';
import { ImagePlus, LoaderCircle, Save, UserRound } from 'lucide-react';
import API from '../api';

const emptyProfile = {
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    role: '',
    department: '',
    skillset: '',
    profile_picture: '',
    uploaded_materials: 0,
    approved_materials: 0,
    total_downloads: 0,
    pending_deletion_requests: 0,
};

export default function AccountSidebar({ username, onActivityChange }) {
    const [collapsed, setCollapsed] = useState(true);
    const [profile, setProfile] = useState(emptyProfile);
    const [picture, setPicture] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        API.get('users/me/')
            .then(({ data }) => {
                const nextProfile = { ...emptyProfile, ...data };
                setProfile(nextProfile);
                onActivityChange?.(nextProfile);
            })
            .catch((error) => setMessage(error.response?.data?.detail || 'Unable to load profile.'))
            .finally(() => setLoading(false));
    }, [onActivityChange]);

    useEffect(() => {
        if (!picture) {
            setPreviewUrl('');
            return undefined;
        }
        const objectUrl = URL.createObjectURL(picture);
        setPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [picture]);

    const updateField = (event) => {
        setProfile((current) => ({ ...current, [event.target.name]: event.target.value }));
    };

    const saveProfile = async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        const data = new FormData();
        ['first_name', 'last_name', 'email', 'department', 'skillset'].forEach((field) => data.append(field, profile[field] || ''));
        if (picture) data.append('profile_picture', picture);
        try {
            const response = await API.patch('users/me/', data);
            const nextProfile = { ...emptyProfile, ...response.data };
            setProfile(nextProfile);
            onActivityChange?.(nextProfile);
            setPicture(null);
            setMessage('Profile saved.');
        } catch (error) {
            const details = error.response?.data;
            setMessage(details ? Object.values(details).flat().join(' ') : 'Unable to save profile.');
        } finally {
            setSaving(false);
        }
    };

    const imageSrc = previewUrl || profile.profile_picture;

    return (
        <aside style={{ ...sidebarStyle, ...(!collapsed && expandedSidebarStyle), width: collapsed ? '60px' : 'min(304px, calc(100vw - 24px))' }} aria-label="Account profile">
            {!collapsed && <div style={sidebarHeaderStyle}><span style={{ fontWeight: 700, color: '#1e293b' }}>My profile</span></div>}

            {collapsed ? (
                <button type="button" title={`Open ${profile.first_name || username || 'user'} profile`} aria-label="Open profile" onClick={() => setCollapsed(false)} style={collapsedAvatarButtonStyle}>
                    {imageSrc ? <img src={imageSrc} alt="" style={avatarImageStyle} /> : <UserRound size={22} />}
                </button>
            ) : (
                <div style={expandedContentStyle}>
                    {loading ? <LoaderCircle size={22} aria-label="Loading profile" style={{ animation: 'spin 1s linear infinite' }} /> : (
                        <>
                            <form onSubmit={saveProfile}>
                                <div style={profilePhotoWrapStyle}>
                                    <button type="button" title="Close profile" aria-label="Close profile" onClick={() => setCollapsed(true)} style={profilePhotoButtonStyle}>
                                        {imageSrc ? <img src={imageSrc} alt="" style={profilePhotoStyle} /> : <span style={profilePhotoPlaceholderStyle}><UserRound size={36} /></span>}
                                    </button>
                                    <label title="Choose a profile picture" style={photoEditStyle}>
                                        <ImagePlus size={15} aria-hidden="true" />
                                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setPicture(event.target.files?.[0] || null)} style={{ display: 'none' }} />
                                    </label>
                                </div>
                                <p style={usernameStyle}>@{profile.username || username}</p>
                                <span style={roleStyle}>{profile.role || 'Member'}</span>

                                <div style={sectionHeadingStyle}>Personal details</div>
                                <label style={labelStyle}>First name<input name="first_name" value={profile.first_name} onChange={updateField} style={inputStyle} /></label>
                                <label style={labelStyle}>Last name<input name="last_name" value={profile.last_name} onChange={updateField} style={inputStyle} /></label>
                                <label style={labelStyle}>Email<input type="email" name="email" value={profile.email} onChange={updateField} style={inputStyle} /></label>
                                <label style={labelStyle}>Department<input name="department" value={profile.department} onChange={updateField} style={inputStyle} /></label>
                                {profile.role === 'LECTURER' && (
                                    <label style={labelStyle}>
                                        Skills and expertise
                                        <textarea name="skillset" value={profile.skillset} onChange={updateField} maxLength={500} placeholder="e.g. software engineering, databases, machine learning" style={{ ...inputStyle, minHeight: '76px', resize: 'vertical' }} />
                                    </label>
                                )}
                                <button type="submit" disabled={saving} style={saveButtonStyle}>
                                    {saving ? <LoaderCircle size={15} /> : <Save size={15} />}
                                    Save profile
                                </button>
                            </form>

                            {message && <p role="status" style={messageStyle}>{message}</p>}
                        </>
                    )}
                </div>
            )}
        </aside>
    );
}

const sidebarStyle = { position: 'absolute', inset: '0 auto 0 0', height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', border: 0, boxShadow: 'none', transition: 'width 180ms ease', overflow: 'hidden', boxSizing: 'border-box', zIndex: 15, pointerEvents: 'none' };
const expandedSidebarStyle = { background: '#fff', borderRight: '1px solid #dbe3ec', boxShadow: '4px 0 18px rgba(15, 23, 42, 0.12)', pointerEvents: 'auto' };
const sidebarHeaderStyle = { minHeight: '54px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e2e8f0', boxSizing: 'border-box' };
const collapsedAvatarButtonStyle = { alignSelf: 'flex-start', margin: '14px 0 0 9px', display: 'grid', placeItems: 'center', width: '42px', height: '42px', border: '1px solid #dbe3ec', borderRadius: '50%', overflow: 'hidden', background: '#eff6ff', color: '#0369a1', cursor: 'pointer', pointerEvents: 'auto' };
const avatarImageStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const expandedContentStyle = { flex: 1, overflowY: 'auto', padding: '16px', minWidth: 0 };
const profilePhotoWrapStyle = { position: 'relative', width: '76px', height: '76px', margin: '0 auto 8px' };
const profilePhotoButtonStyle = { display: 'block', width: '76px', height: '76px', padding: 0, border: 0, borderRadius: '50%', background: 'transparent', cursor: 'pointer' };
const profilePhotoStyle = { width: '76px', height: '76px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #dbeafe' };
const profilePhotoPlaceholderStyle = { width: '76px', height: '76px', display: 'grid', placeItems: 'center', borderRadius: '50%', color: '#0369a1', background: '#e0f2fe', border: '2px solid #dbeafe', boxSizing: 'border-box' };
const photoEditStyle = { position: 'absolute', right: '-2px', bottom: '0', width: '28px', height: '28px', display: 'grid', placeItems: 'center', borderRadius: '50%', border: '2px solid #fff', background: '#0369a1', color: '#fff', cursor: 'pointer' };
const usernameStyle = { margin: '0 0 4px', textAlign: 'center', color: '#334155', fontWeight: 700 };
const roleStyle = { display: 'block', width: 'fit-content', margin: '0 auto 18px', padding: '3px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#475569', fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize' };
const sectionHeadingStyle = { paddingTop: '14px', marginBottom: '9px', borderTop: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' };
const labelStyle = { display: 'block', marginBottom: '9px', color: '#475569', fontSize: '0.75rem', fontWeight: 600 };
const inputStyle = { width: '100%', display: 'block', marginTop: '4px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#1e293b', background: '#fff', boxSizing: 'border-box', fontSize: '0.82rem' };
const saveButtonStyle = { width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '7px', margin: '4px 0 14px', padding: '9px', border: 0, borderRadius: '4px', background: '#0369a1', color: '#fff', fontWeight: 600, cursor: 'pointer' };
const messageStyle = { color: '#0369a1', fontSize: '0.78rem' };
