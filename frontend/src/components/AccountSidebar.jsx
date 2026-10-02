import React, { useEffect, useState } from 'react';
import { BarChart3, BookOpenCheck, ChevronLeft, ChevronRight, Download, ImagePlus, LoaderCircle, Save, UserRound, X } from 'lucide-react';
import API from '../api';

const emptyProfile = {
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    role: '',
    department: '',
    profile_picture: '',
    uploaded_materials: 0,
    approved_materials: 0,
    total_downloads: 0,
    pending_deletion_requests: 0,
};

export default function AccountSidebar({ username }) {
    const [collapsed, setCollapsed] = useState(true);
    const [profile, setProfile] = useState(emptyProfile);
    const [picture, setPicture] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [reviewerRequest, setReviewerRequest] = useState(null);
    const [expertise, setExpertise] = useState('');
    const [reviewReason, setReviewReason] = useState('');
    const [requestMessage, setRequestMessage] = useState('');
    const [requesting, setRequesting] = useState(false);

    useEffect(() => {
        API.get('users/me/')
            .then(({ data }) => setProfile({ ...emptyProfile, ...data }))
            .catch((error) => setMessage(error.response?.data?.detail || 'Unable to load profile.'))
            .finally(() => setLoading(false));
        API.get('users/reviewer-request/')
            .then(({ data }) => setReviewerRequest(data))
            .catch(() => {});
    }, []);

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
        ['first_name', 'last_name', 'email', 'department'].forEach((field) => data.append(field, profile[field] || ''));
        if (picture) data.append('profile_picture', picture);
        try {
            const response = await API.patch('users/me/', data);
            setProfile({ ...emptyProfile, ...response.data });
            setPicture(null);
            setMessage('Profile saved.');
        } catch (error) {
            const details = error.response?.data;
            setMessage(details ? Object.values(details).flat().join(' ') : 'Unable to save profile.');
        } finally {
            setSaving(false);
        }
    };

    const submitReviewerRequest = async (event) => {
        event.preventDefault();
        setRequesting(true);
        setRequestMessage('');
        try {
            const { data } = await API.post('users/reviewer-request/', { expertise, reason: reviewReason });
            setReviewerRequest(data);
            setRequestMessage('Reviewer request submitted.');
            setExpertise('');
            setReviewReason('');
        } catch (error) {
            setRequestMessage(error.response?.data?.detail || 'Unable to submit reviewer request.');
        } finally {
            setRequesting(false);
        }
    };

    const imageSrc = previewUrl || profile.profile_picture;

    return (
        <aside style={{ ...sidebarStyle, width: collapsed ? '64px' : '304px' }} aria-label="Account profile">
            <div style={sidebarHeaderStyle}>
                <button type="button" title={collapsed ? 'Expand profile sidebar' : 'Collapse profile sidebar'} aria-label={collapsed ? 'Expand profile sidebar' : 'Collapse profile sidebar'} onClick={() => setCollapsed((value) => !value)} style={iconButtonStyle}>
                    {collapsed ? <ChevronRight size={19} /> : <ChevronLeft size={19} />}
                </button>
                {!collapsed && <span style={{ fontWeight: 700, color: '#1e293b' }}>My profile</span>}
            </div>

            {collapsed ? (
                <button type="button" title={`Open ${profile.first_name || username || 'user'} profile`} aria-label="Expand profile sidebar" onClick={() => setCollapsed(false)} style={collapsedAvatarButtonStyle}>
                    {imageSrc ? <img src={imageSrc} alt="" style={avatarImageStyle} /> : <UserRound size={22} />}
                </button>
            ) : (
                <div style={expandedContentStyle}>
                    {loading ? <LoaderCircle size={22} aria-label="Loading profile" style={{ animation: 'spin 1s linear infinite' }} /> : (
                        <>
                            <form onSubmit={saveProfile}>
                                <div style={profilePhotoWrapStyle}>
                                    {imageSrc ? <img src={imageSrc} alt="Profile" style={profilePhotoStyle} /> : <div style={profilePhotoPlaceholderStyle}><UserRound size={36} /></div>}
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
                                <button type="submit" disabled={saving} style={saveButtonStyle}>
                                    {saving ? <LoaderCircle size={15} /> : <Save size={15} />}
                                    Save profile
                                </button>
                            </form>

                            <div style={sectionHeadingStyle}>Repository activity</div>
                            <div style={statsGridStyle}>
                                <Stat icon={<BookOpenCheck size={16} />} label="Uploaded" value={profile.uploaded_materials} />
                                <Stat icon={<BarChart3 size={16} />} label="Approved" value={profile.approved_materials} />
                                <Stat icon={<Download size={16} />} label="Downloads" value={profile.total_downloads} />
                                <Stat icon={<X size={16} />} label="Delete requests" value={profile.pending_deletion_requests} />
                            </div>
                            {['STUDENT', 'LECTURER'].includes(profile.role) && (
                                <section aria-label="Reviewer application">
                                    <div style={sectionHeadingStyle}>Reviewer access</div>
                                    {reviewerRequest?.status === 'PENDING' ? (
                                        <p style={reviewRequestStatusStyle}>Request pending review</p>
                                    ) : reviewerRequest?.status === 'APPROVED' ? (
                                        <p style={reviewRequestStatusStyle}>Request approved</p>
                                    ) : (
                                        <form onSubmit={submitReviewerRequest}>
                                            <label style={labelStyle}>Subject expertise<input required maxLength={200} value={expertise} onChange={(event) => setExpertise(event.target.value)} style={inputStyle} placeholder="e.g. Computer Science" /></label>
                                            <label style={labelStyle}>Why would you like to review?<textarea required rows={3} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} style={{ ...inputStyle, resize: 'vertical' }} /></label>
                                            <button type="submit" disabled={requesting} style={saveButtonStyle}>{requesting ? 'Submitting...' : 'Request reviewer access'}</button>
                                        </form>
                                    )}
                                    {requestMessage && <p role="status" style={messageStyle}>{requestMessage}</p>}
                                </section>
                            )}
                            {message && <p role="status" style={messageStyle}>{message}</p>}
                        </>
                    )}
                </div>
            )}
        </aside>
    );
}

function Stat({ icon, label, value }) {
    return <div style={statStyle}><span style={{ color: '#0369a1' }}>{icon}</span><span style={statValueStyle}>{value}</span><span style={statLabelStyle}>{label}</span></div>;
}

const sidebarStyle = { flex: '0 0 auto', height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', borderRight: '1px solid #dbe3ec', transition: 'width 180ms ease', overflow: 'hidden', boxSizing: 'border-box', zIndex: 4 };
const sidebarHeaderStyle = { minHeight: '54px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e2e8f0', boxSizing: 'border-box' };
const iconButtonStyle = { display: 'grid', placeItems: 'center', width: '36px', height: '36px', flex: '0 0 auto', border: '1px solid #dbe3ec', borderRadius: '5px', color: '#334155', background: '#fff', cursor: 'pointer' };
const collapsedAvatarButtonStyle = { alignSelf: 'center', marginTop: '14px', display: 'grid', placeItems: 'center', width: '42px', height: '42px', border: '1px solid #dbe3ec', borderRadius: '50%', overflow: 'hidden', background: '#eff6ff', color: '#0369a1', cursor: 'pointer' };
const avatarImageStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const expandedContentStyle = { flex: 1, overflowY: 'auto', padding: '16px', minWidth: 0 };
const profilePhotoWrapStyle = { position: 'relative', width: '76px', height: '76px', margin: '0 auto 8px' };
const profilePhotoStyle = { width: '76px', height: '76px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #dbeafe' };
const profilePhotoPlaceholderStyle = { width: '76px', height: '76px', display: 'grid', placeItems: 'center', borderRadius: '50%', color: '#0369a1', background: '#e0f2fe', border: '2px solid #dbeafe', boxSizing: 'border-box' };
const photoEditStyle = { position: 'absolute', right: '-2px', bottom: '0', width: '28px', height: '28px', display: 'grid', placeItems: 'center', borderRadius: '50%', border: '2px solid #fff', background: '#0369a1', color: '#fff', cursor: 'pointer' };
const usernameStyle = { margin: '0 0 4px', textAlign: 'center', color: '#334155', fontWeight: 700 };
const roleStyle = { display: 'block', width: 'fit-content', margin: '0 auto 18px', padding: '3px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#475569', fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize' };
const sectionHeadingStyle = { paddingTop: '14px', marginBottom: '9px', borderTop: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' };
const labelStyle = { display: 'block', marginBottom: '9px', color: '#475569', fontSize: '0.75rem', fontWeight: 600 };
const inputStyle = { width: '100%', display: 'block', marginTop: '4px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#1e293b', background: '#fff', boxSizing: 'border-box', fontSize: '0.82rem' };
const saveButtonStyle = { width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '7px', margin: '4px 0 14px', padding: '9px', border: 0, borderRadius: '4px', background: '#0369a1', color: '#fff', fontWeight: 600, cursor: 'pointer' };
const statsGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' };
const statStyle = { minWidth: 0, display: 'grid', gridTemplateColumns: '20px 1fr', alignItems: 'center', columnGap: '5px', padding: '9px 7px', border: '1px solid #e2e8f0', borderRadius: '5px', background: '#f8fafc' };
const statValueStyle = { color: '#1e293b', fontWeight: 700, fontSize: '0.9rem' };
const statLabelStyle = { gridColumn: '1 / -1', overflow: 'hidden', color: '#64748b', fontSize: '0.67rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const messageStyle = { color: '#0369a1', fontSize: '0.78rem' };
const reviewRequestStatusStyle = { padding: '9px', borderRadius: '4px', background: '#f0fdf4', color: '#166534', fontSize: '0.78rem', fontWeight: 600 };
