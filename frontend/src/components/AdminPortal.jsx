import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Bell, BookOpenCheck, Check, Database, LayoutDashboard, LogOut, Pencil, Plus, Search, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import API from '../api';
import './AdminPortal.css';

const sections = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'requests', label: 'Reviewer requests', icon: ShieldCheck },
    { id: 'broadcasts', label: 'Broadcasts', icon: Bell },
    { id: 'directory', label: 'University directory', icon: Database },
];

export default function AdminPortal({ onLogout }) {
    const [section, setSection] = useState('overview');
    const [analytics, setAnalytics] = useState(null);
    const [users, setUsers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [broadcasts, setBroadcasts] = useState([]);
    const [directory, setDirectory] = useState([]);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const refresh = async () => {
        try {
            const [metrics, people, applications, messages, directoryRecords] = await Promise.all([
                API.get('admin/analytics/'), API.get('admin/users/'),
                API.get('admin/reviewer-requests/'), API.get('admin/broadcasts/'),
                API.get('admin/university-directory/'),
            ]);
            setError('');
            setAnalytics(metrics.data);
            setUsers(people.data);
            setRequests(applications.data);
            setBroadcasts(messages.data);
            setDirectory(directoryRecords.data);
        } catch (requestError) {
            setError(requestError.response?.data?.detail || 'Unable to load administrator data.');
        }
    };

    useEffect(() => {
        void refresh();
    }, []);

    const logout = () => {
        onLogout();
        navigate('/');
    };

    return (
        <div className="admin-shell">
            <aside className="admin-rail">
                <div className="admin-brand"><span className="admin-brand-mark"><BookOpenCheck size={20} /></span><span>UNIPUB<span className="admin-brand-sub">CONTROL ROOM</span></span></div>
                <div className="admin-nav-label">WORKSPACE</div>
                <nav aria-label="Administration">
                    {sections.map(({ id, label, icon: Icon }) => (
                        <button key={id} className={`admin-nav-item ${section === id ? 'is-active' : ''}`} onClick={() => setSection(id)}>
                            <Icon size={17} /><span>{label}</span>
                            {id === 'requests' && analytics?.pending_reviewer_requests > 0 && <b className="admin-nav-count">{analytics.pending_reviewer_requests}</b>}
                        </button>
                    ))}
                </nav>
                <div className="admin-rail-bottom"><span><span className="admin-live-dot" />Admin session</span><button title="Sign out" aria-label="Sign out" onClick={logout}><LogOut size={17} /></button></div>
            </aside>
            <main className="admin-main">
                <header className="admin-topbar"><div><span className="admin-breadcrumb">UNIPUB / ADMINISTRATION</span><h1>{sections.find((item) => item.id === section)?.label}</h1></div><button className="admin-icon-button" onClick={refresh} title="Refresh dashboard" aria-label="Refresh dashboard"><Activity size={18} /></button></header>
                <div className="admin-content">
                    {error && <div className="admin-alert" role="alert">{error}</div>}
                    {section === 'overview' && <Overview analytics={analytics} requests={requests} onReview={() => setSection('requests')} />}
                    {section === 'users' && <UserManagement users={users} onRefresh={refresh} />}
                    {section === 'requests' && <ReviewerRequests requests={requests} onRefresh={refresh} />}
                    {section === 'broadcasts' && <Broadcasts messages={broadcasts} onRefresh={refresh} />}
                    {section === 'directory' && <UniversityDirectory entries={directory} onRefresh={refresh} />}
                </div>
            </main>
        </div>
    );
}

function Overview({ analytics, requests, onReview }) {
    const metrics = [
        ['Registered users', analytics?.users ?? '—', Users, 'Accounts on the platform'],
        ['Active reviewers', analytics?.reviewers ?? '—', ShieldCheck, 'Approved reviewer roles'],
        ['Publications', analytics?.publications ?? '—', BookOpenCheck, `${analytics?.approved_publications ?? 0} approved`],
        ['Downloads', analytics?.downloads ?? '—', Activity, 'Across all publications'],
    ];
    return <>
        <div className="admin-section-intro"><div><h2>Platform pulse</h2><p>Current repository activity and access overview.</p></div><span className="admin-updated">LIVE DATA</span></div>
        <div className="admin-metrics">{metrics.map(([label, value, Icon, note]) => <article className="admin-metric" key={label}><div className="admin-metric-top"><span>{label}</span><Icon size={18} /></div><strong>{value}</strong><small>{note}</small></article>)}</div>
        <section className="admin-panel admin-request-summary"><div><span className="admin-panel-kicker">ACCESS QUEUE</span><h2>Reviewer applications</h2><p>{analytics?.pending_reviewer_requests ?? 0} awaiting a decision</p></div><button className="admin-secondary" onClick={onReview}>Review requests <span aria-hidden="true">→</span></button></section>
        <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">LATEST ACTIVITY</span><h2>Recent requests</h2></div><span className="admin-count-label">{requests.filter((item) => item.status === 'PENDING').length} PENDING</span></div><div className="admin-recent-list">{requests.filter((item) => item.status === 'PENDING').slice(0, 4).map((request) => <div className="admin-recent-row" key={request.id}><div className="admin-avatar">{request.username?.slice(0, 1).toUpperCase()}</div><div><strong>{request.username}</strong><span>{request.expertise} · {request.department || 'No department'}</span></div><span className="admin-status pending">Pending</span></div>)}{!requests.some((item) => item.status === 'PENDING') && <p className="admin-empty">No reviewer applications are waiting.</p>}</div></section>
    </>;
}

function UserManagement({ users, onRefresh }) {
    const [query, setQuery] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [error, setError] = useState('');
    const filtered = users.filter((user) => `${user.username} ${user.email} ${user.department}`.toLowerCase().includes(query.toLowerCase()));

    const updateUser = async (id, changes) => {
        setError('');
        try { await API.patch(`admin/users/${id}/`, changes); await onRefresh(); return true; }
        catch (requestError) { setError(requestError.response?.data?.detail || 'Unable to update account.'); return false; }
    };
    const deleteUser = async (user) => {
        if (!window.confirm(`Remove ${user.username}'s account? This cannot be undone.`)) return;
        try { await API.delete(`admin/users/${user.id}/`); await onRefresh(); }
        catch (requestError) { setError(requestError.response?.data?.detail || 'Unable to remove account.'); }
    };

    return <>
        <div className="admin-section-intro"><div><h2>Account directory</h2><p>Assign roles, update account details, or disable access.</p></div><button className="admin-primary compact" onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> Add user</button></div>
        {error && <div className="admin-alert" role="alert">{error}</div>}
        {showCreate && <CreateUser onCreated={async () => { setShowCreate(false); await onRefresh(); }} onError={setError} />}
        <div className="admin-table-tools"><span>{filtered.length} accounts</span><label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts" /></label></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Account</th><th>Department</th><th>Role</th><th>Access</th><th aria-label="Actions" /></tr></thead><tbody>{filtered.map((user) => <UserRow key={user.id} user={user} onSave={updateUser} onDelete={deleteUser} />)}{filtered.length === 0 && <tr><td colSpan="5" className="admin-empty">No matching accounts.</td></tr>}</tbody></table></div>
    </>;
}

function UserRow({ user, onSave, onDelete }) {
    const [role, setRole] = useState(user.role);
    const [editing, setEditing] = useState(false);
    const [details, setDetails] = useState({ first_name: user.first_name || '', last_name: user.last_name || '', email: user.email || '', department: user.department || '' });
    const saveDetails = async (event) => {
        event.preventDefault();
        if (await onSave(user.id, details)) setEditing(false);
    };
    return <>
        <tr><td><strong>{user.first_name || user.last_name ? `${user.first_name} ${user.last_name}`.trim() : user.username}</strong><span className="admin-table-sub">@{user.username}{user.email ? ` · ${user.email}` : ''}</span></td><td>{user.department || '—'}</td><td><select className="admin-select" value={role === 'APPROVER' ? 'REVIEWER' : role} onChange={(event) => { setRole(event.target.value); onSave(user.id, { role: event.target.value }); }}><option value="STUDENT">Student</option><option value="LECTURER">Lecturer</option><option value="REVIEWER">Reviewer</option></select></td><td><button className={`admin-access ${user.is_active ? 'enabled' : 'disabled'}`} onClick={() => onSave(user.id, { is_active: !user.is_active })}>{user.is_active ? 'Active' : 'Disabled'}</button></td><td><div className="admin-row-actions"><button className="admin-danger-icon" title={`Edit ${user.username}`} aria-label={`Edit ${user.username}`} onClick={() => setEditing((value) => !value)}><Pencil size={15} /></button><button className="admin-danger-icon" title={`Remove ${user.username}`} aria-label={`Remove ${user.username}`} onClick={() => onDelete(user)}><Trash2 size={16} /></button></div></td></tr>
        {editing && <tr className="admin-edit-row"><td colSpan="5"><form onSubmit={saveDetails}><div className="admin-form-grid">{[['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['department', 'Department']].map(([field, label]) => <label key={field}>{label}<input type={field === 'email' ? 'email' : 'text'} value={details[field]} onChange={(event) => setDetails((current) => ({ ...current, [field]: event.target.value }))} /></label>)}</div><div className="admin-application-actions"><button type="button" className="admin-secondary" onClick={() => setEditing(false)}>Cancel</button><button className="admin-primary compact">Save profile details</button></div></form></td></tr>}
    </>;
}

function CreateUser({ onCreated, onError }) {
    const [form, setForm] = useState({ username: '', password: '', first_name: '', last_name: '', email: '', role: 'STUDENT', department: '' });
    const [busy, setBusy] = useState(false);
    const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    const submit = async (event) => {
        event.preventDefault(); setBusy(true); onError('');
        try { await API.post('admin/users/', form); await onCreated(); }
        catch (requestError) { onError(requestError.response?.data ? Object.values(requestError.response.data).flat().join(' ') : 'Unable to create account.'); }
        finally { setBusy(false); }
    };
    return <form className="admin-panel admin-create-form" onSubmit={submit}><div className="admin-panel-heading"><div><span className="admin-panel-kicker">NEW ACCOUNT</span><h2>Create user</h2></div><button type="button" className="admin-danger-icon" title="Close" aria-label="Close" onClick={() => onCreated()}><X size={17} /></button></div><div className="admin-form-grid">{[['username', 'Username'], ['password', 'Temporary password'], ['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['department', 'Department']].map(([name, label]) => <label key={name}>{label}<input name={name} type={name === 'password' ? 'password' : name === 'email' ? 'email' : 'text'} value={form[name]} onChange={change} required={['username', 'password'].includes(name)} minLength={name === 'password' ? 8 : undefined} /></label>)}<label>Role<select name="role" value={form.role} onChange={change}><option value="STUDENT">Student</option><option value="LECTURER">Lecturer</option><option value="REVIEWER">Reviewer</option></select></label></div><button className="admin-primary compact" disabled={busy}><Plus size={16} /> Create account</button></form>;
}

function ReviewerRequests({ requests, onRefresh }) {
    const [filter, setFilter] = useState('PENDING');
    const [error, setError] = useState('');
    const visible = requests.filter((item) => filter === 'ALL' || item.status === filter);
    const decide = async (id, status) => {
        setError('');
        try { await API.patch(`admin/reviewer-requests/${id}/`, { status }); await onRefresh(); }
        catch (requestError) { setError(requestError.response?.data?.detail || 'Unable to update application.'); }
    };
    return <>
        <div className="admin-section-intro"><div><h2>Reviewer applications</h2><p>Evaluate subject expertise and approve qualified users.</p></div><div className="admin-segmented">{['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((value) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{value === 'ALL' ? 'All' : `${value[0]}${value.slice(1).toLowerCase()}`}</button>)}</div></div>
        {error && <div className="admin-alert" role="alert">{error}</div>}
        <div className="admin-application-list">{visible.map((application) => <article className="admin-application" key={application.id}><div className="admin-application-head"><div className="admin-avatar large">{application.username?.slice(0, 1).toUpperCase()}</div><div><strong>{application.username}</strong><span>{application.department || 'Department not provided'} · {new Date(application.created_at).toLocaleDateString()}</span></div><span className={`admin-status ${application.status.toLowerCase()}`}>{application.status.toLowerCase()}</span></div><div className="admin-application-body"><span className="admin-panel-kicker">SUBJECT EXPERTISE</span><p className="expertise-text">{application.expertise}</p><span className="admin-panel-kicker">APPLICATION STATEMENT</span><p>{application.reason}</p></div>{application.status === 'PENDING' && <div className="admin-application-actions"><button className="admin-secondary" onClick={() => decide(application.id, 'REJECTED')}><X size={15} /> Decline</button><button className="admin-primary compact" onClick={() => decide(application.id, 'APPROVED')}><Check size={15} /> Approve reviewer</button></div>}</article>)}{visible.length === 0 && <div className="admin-panel admin-empty">No {filter === 'ALL' ? '' : filter.toLowerCase()} applications.</div>}</div>
    </>;
}

function Broadcasts({ messages, onRefresh }) {
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const resetForm = () => {
        setTitle('');
        setMessage('');
        setEditingId(null);
    };

    const submit = async (event) => {
        event.preventDefault(); setBusy(true); setError('');
        try {
            if (editingId) await API.patch(`admin/broadcasts/${editingId}/`, { title, message });
            else await API.post('admin/broadcasts/', { title, message });
            resetForm();
            await onRefresh();
        }
        catch (requestError) { setError(requestError.response?.data ? Object.values(requestError.response.data).flat().join(' ') : 'Unable to publish broadcast.'); }
        finally { setBusy(false); }
    };

    const editMessage = (item) => {
        setEditingId(item.id);
        setTitle(item.title);
        setMessage(item.message);
        setError('');
    };

    const toggleActive = async (item) => {
        setError('');
        try { await API.patch(`admin/broadcasts/${item.id}/`, { is_active: !item.is_active }); await onRefresh(); }
        catch (requestError) { setError(requestError.response?.data?.detail || 'Unable to update broadcast status.'); }
    };

    const deleteMessage = async (item) => {
        if (!window.confirm(`Permanently delete “${item.title}”? Retract it instead to keep it in the admin history.`)) return;
        setError('');
        try { await API.delete(`admin/broadcasts/${item.id}/`); await onRefresh(); }
        catch (requestError) { setError(requestError.response?.data?.detail || 'Unable to delete broadcast.'); }
    };

    return <>
        <div className="admin-section-intro"><div><h2>Broadcast messages</h2><p>Publish an announcement visible to every signed-in user.</p></div></div>
        {error && <div className="admin-alert" role="alert">{error}</div>}
        <form className="admin-panel admin-broadcast-form" onSubmit={submit}><span className="admin-panel-kicker">{editingId ? 'EDIT ANNOUNCEMENT' : 'NEW ANNOUNCEMENT'}</span><label>Headline<input maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="e.g. Planned repository maintenance" /></label><label>Message<textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} required placeholder="Write your announcement for all users..." /></label><div className="admin-broadcast-form-actions"><button className="admin-primary compact" disabled={busy}>{editingId ? <Pencil size={16} /> : <Bell size={16} />} {busy ? 'Saving...' : editingId ? 'Save changes' : 'Publish to all users'}</button>{editingId && <button type="button" className="admin-secondary" onClick={resetForm}>Cancel edit</button>}</div></form>
        <section className="admin-broadcast-list"><h2>Broadcast history</h2>{messages.map((item) => <article className={`admin-broadcast-item ${item.is_active ? '' : 'is-retracted'}`} key={item.id}><div className="admin-broadcast-item-head"><span className="admin-broadcast-date">{new Date(item.created_at).toLocaleString()}</span><span className={`admin-status ${item.is_active ? 'approved' : 'rejected'}`}>{item.is_active ? 'Active for all users' : 'Retracted'}</span></div><h3>{item.title}</h3><p>{item.message}</p><div className="admin-broadcast-actions"><button type="button" className="admin-secondary" onClick={() => editMessage(item)}><Pencil size={14} /> Edit</button><button type="button" className="admin-secondary" onClick={() => toggleActive(item)}>{item.is_active ? <><X size={14} /> Retract</> : <><Check size={14} /> Restore</>}</button><button type="button" className="admin-danger-text" onClick={() => deleteMessage(item)}><Trash2 size={14} /> Delete</button></div></article>)}{messages.length === 0 && <p className="admin-empty">No messages published yet.</p>}</section>
    </>;
}

function UniversityDirectory({ entries, onRefresh }) {
    const [count, setCount] = useState(30);
    const [personType, setPersonType] = useState('ALL');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const filtered = entries.filter((entry) => personType === 'ALL' || entry.person_type === personType);
    const generate = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await API.post('admin/university-directory/', { count: Number(count) });
            await onRefresh();
        } catch (requestError) {
            setError(requestError.response?.data ? Object.values(requestError.response.data).flat().join(' ') : 'Unable to generate directory records.');
        } finally {
            setBusy(false);
        }
    };

    return <>
        <div className="admin-section-intro"><div><h2>University identity directory</h2><p>Temporary simulated UB student and staff records used to verify registration IDs.</p></div></div>
        {error && <div className="admin-alert" role="alert">{error}</div>}
        <form className="admin-panel admin-directory-tools" onSubmit={generate}>
            <div><span className="admin-panel-kicker">SIMULATED API DATA</span><h2>Generate test identities</h2><p>Each record gets a unique ID, full name, UB email, department, and claim status.</p></div>
            <label>Records<input type="number" min="1" max="500" value={count} onChange={(event) => setCount(event.target.value)} required /></label>
            <button className="admin-primary compact" disabled={busy}><Plus size={16} /> {busy ? 'Generating...' : 'Generate records'}</button>
        </form>
        <div className="admin-table-tools"><span>{entries.length} directory records · {entries.filter((entry) => !entry.claimed_username && entry.is_active).length} available</span><label className="admin-search"><Search size={16} /><select value={personType} onChange={(event) => setPersonType(event.target.value)}><option value="ALL">All identities</option><option value="STUDENT">Students</option><option value="LECTURER">Lecturers</option></select></label></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>University ID</th><th>Name</th><th>Type</th><th>Email</th><th>Department</th><th>Registration</th></tr></thead><tbody>{filtered.map((entry) => <tr key={entry.id}><td><strong>{entry.university_id}</strong></td><td>{entry.full_name}</td><td>{entry.person_type === 'STUDENT' ? 'Student' : 'Lecturer'}</td><td>{entry.email}</td><td>{entry.department}</td><td><span className={`admin-status ${entry.claimed_username ? 'approved' : 'pending'}`}>{entry.claimed_username ? `@${entry.claimed_username}` : entry.is_active ? 'Available' : 'Inactive'}</span></td></tr>)}{filtered.length === 0 && <tr><td colSpan="6" className="admin-empty">No directory records yet. Generate identities to test signup.</td></tr>}</tbody></table></div>
    </>;
}