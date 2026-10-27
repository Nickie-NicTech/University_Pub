import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Bell, BookOpenCheck, Check, Database, LayoutDashboard, LogOut, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import API from '../api';
import './AdminPortal.css';

const sections = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'subject-mappings', label: 'Subject mappings', icon: BookOpenCheck },
    { id: 'broadcasts', label: 'Broadcasts', icon: Bell },
    { id: 'directory', label: 'University directory', icon: Database },
];

export default function AdminPortal({ onLogout }) {
    const [section, setSection] = useState('overview');
    const [analytics, setAnalytics] = useState(null);
    const [users, setUsers] = useState([]);
    const [mappings, setMappings] = useState([]);
    const [broadcasts, setBroadcasts] = useState([]);
    const [directory, setDirectory] = useState([]);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const refresh = async () => {
        try {
            const [metrics, people, subjectMappings, messages, directoryRecords] = await Promise.all([
                API.get('admin/analytics/'), API.get('admin/users/'),
                API.get('admin/subject-mappings/'),
                API.get('admin/broadcasts/'), API.get('admin/university-directory/'),
            ]);
            setError('');
            setAnalytics(metrics.data);
            setUsers(people.data);
            setMappings(subjectMappings.data);
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
                        </button>
                    ))}
                </nav>
                <div className="admin-rail-bottom"><span><span className="admin-live-dot" />Admin session</span><button title="Sign out" aria-label="Sign out" onClick={logout}><LogOut size={17} /></button></div>
            </aside>
            <main className="admin-main">
                <header className="admin-topbar"><div><span className="admin-breadcrumb">UNIPUB / ADMINISTRATION</span><h1>{sections.find((item) => item.id === section)?.label}</h1></div><button className="admin-icon-button" onClick={refresh} title="Refresh dashboard" aria-label="Refresh dashboard"><Activity size={18} /></button></header>
                <div className="admin-content">
                    {error && <div className="admin-alert" role="alert">{error}</div>}
                    {section === 'overview' && <Overview analytics={analytics} onManageUsers={() => setSection('users')} />}
                    {section === 'users' && <UserManagement users={users} onRefresh={refresh} />}
                    {section === 'subject-mappings' && <SubjectMappings mappings={mappings} users={users} onRefresh={refresh} />}
                    {section === 'broadcasts' && <Broadcasts messages={broadcasts} onRefresh={refresh} />}
                    {section === 'directory' && <UniversityDirectory entries={directory} onRefresh={refresh} />}
                </div>
            </main>
        </div>
    );
}

function Overview({ analytics, onManageUsers }) {
    const metrics = [
        ['Registered users', analytics?.users ?? '—', Users, 'Accounts on the platform'],
        ['Active supervisors', analytics?.supervisors ?? '—', Users, 'Lecturers assigned to supervise users'],
        ['Publications', analytics?.publications ?? '—', BookOpenCheck, `${analytics?.approved_publications ?? 0} approved`],
        ['Downloads', analytics?.downloads ?? '—', Activity, 'Across all publications'],
    ];
    return <>
        <div className="admin-section-intro"><div><h2>Platform pulse</h2><p>Current repository activity and access overview.</p></div><span className="admin-updated">LIVE DATA</span></div>
        <div className="admin-metrics">{metrics.map(([label, value, Icon, note]) => <article className="admin-metric" key={label}><div className="admin-metric-top"><span>{label}</span><Icon size={18} /></div><strong>{value}</strong><small>{note}</small></article>)}</div>
        <section className="admin-panel admin-request-summary"><div><span className="admin-panel-kicker">PUBLICATION REVIEW</span><h2>Lecturers review publications</h2><p>Researchers invite a supervisor and optional co-supervisor when submitting each publication.</p></div><button className="admin-secondary" onClick={onManageUsers}>Manage users <span aria-hidden="true">→</span></button></section>
    </>;
}

function UserManagement({ users, onRefresh }) {
    const [query, setQuery] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [error, setError] = useState('');
    const filtered = users.filter((user) => `${user.username} ${user.email} ${user.department} ${user.skillset}`.toLowerCase().includes(query.toLowerCase()));

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
        <div className="admin-section-intro"><div><h2>Account directory</h2><p>Assign student and lecturer accounts to lecturer supervisors who review their publications.</p></div><button className="admin-primary compact" onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> Add user</button></div>
        {error && <div className="admin-alert" role="alert">{error}</div>}
        {showCreate && <CreateUser onCreated={async () => { setShowCreate(false); await onRefresh(); }} onError={setError} />}
        <div className="admin-table-tools"><span>{filtered.length} accounts</span><label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts" /></label></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Account</th><th>Department and expertise</th><th>Role</th><th>Access</th><th aria-label="Actions" /></tr></thead><tbody>{filtered.map((user) => <UserRow key={user.id} user={user} onSave={updateUser} onDelete={deleteUser} />)}{filtered.length === 0 && <tr><td colSpan="5" className="admin-empty">No matching accounts.</td></tr>}</tbody></table></div>
    </>;
}

function SubjectMappings({ mappings, users, onRefresh }) {
    const [subjectArea, setSubjectArea] = useState('');
    const [reviewerId, setReviewerId] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const lecturers = users.filter((user) => user.role === 'LECTURER' && user.is_active);
    const words = subjectArea.toLowerCase().match(/[a-z0-9]+/g) || [];
    const candidates = [...lecturers].sort((first, second) => {
        const score = (lecturer) => {
            const skillset = (lecturer.skillset || '').toLowerCase();
            const department = (lecturer.department || '').toLowerCase();
            return words.reduce((total, word) => total + (skillset.includes(word) ? 3 : department.includes(word) ? 1 : 0), 0);
        };
        return score(second) - score(first)
            || `${first.last_name} ${first.first_name} ${first.username}`.localeCompare(`${second.last_name} ${second.first_name} ${second.username}`);
    });

    const addMapping = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await API.post('admin/subject-mappings/', {
                subject_area: subjectArea.trim(),
                reviewer: Number(reviewerId),
            });
            setSubjectArea('');
            setReviewerId('');
            await onRefresh();
        } catch (requestError) {
            const details = requestError.response?.data;
            setError(details ? Object.values(details).flat().join(' ') : 'Unable to add subject mapping.');
        } finally {
            setBusy(false);
        }
    };

    const removeMapping = async (mapping) => {
        if (!window.confirm(`Remove ${mapping.reviewer_name} from ${mapping.subject_area}?`)) return;
        setDeletingId(mapping.id);
        setError('');
        try {
            await API.delete(`admin/subject-mappings/${mapping.id}/`);
            await onRefresh();
        } catch (requestError) {
            const details = requestError.response?.data;
            setError(details ? Object.values(details).flat().join(' ') : 'Unable to remove subject mapping.');
        } finally {
            setDeletingId(null);
        }
    };

    const matchingMapping = mappings.some((mapping) =>
        mapping.subject_area.toLowerCase() === subjectArea.trim().toLowerCase()
        && String(mapping.reviewer) === reviewerId
    );

    return <>
        <div className="admin-section-intro"><div><h2>Lecturer expertise</h2><p>Subject mappings are created from lecturer skills and departments when publications are submitted. Add explicit mappings here or remove a mapping to exclude that lecturer from automatic matching for the subject.</p></div></div>
        {error && <div className="admin-alert" role="alert">{error}</div>}
        <form className="admin-panel admin-create-form" onSubmit={addMapping}>
            <div className="admin-panel-heading"><div><span className="admin-panel-kicker">REVIEWER ROUTING</span><h2>Add subject mapping</h2></div></div>
            <p className="admin-mapping-note">Suggestions are ranked by department and skills. Review and select a lecturer; profiles never create mappings automatically.</p>
            <div className="admin-form-grid admin-mapping-form">
                <label>Publication subject area<input value={subjectArea} onChange={(event) => { setSubjectArea(event.target.value); setReviewerId(''); }} maxLength={100} placeholder="e.g. Software Engineering" required /></label>
                <label>Lecturer
                    <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} required>
                        <option value="">Select a lecturer</option>
                        {candidates.map((lecturer) => {
                            const alreadyMapped = mappings.some((mapping) =>
                                mapping.subject_area.toLowerCase() === subjectArea.trim().toLowerCase()
                                && String(mapping.reviewer) === String(lecturer.user_id)
                            );
                            const expertise = [lecturer.department, lecturer.skillset].filter(Boolean).join(' · ');
                            return <option key={lecturer.id} value={lecturer.user_id} disabled={alreadyMapped}>
                                {lecturer.first_name || lecturer.last_name ? `${lecturer.first_name} ${lecturer.last_name}`.trim() : lecturer.username}
                                {expertise ? ` — ${expertise}` : ''}
                                {alreadyMapped ? ' (already mapped)' : ''}
                            </option>;
                        })}
                    </select>
                </label>
            </div>
            <button className="admin-primary compact" disabled={busy || !subjectArea.trim() || !reviewerId || matchingMapping}><Plus size={16} /> Add mapping</button>
        </form>
        <div className="admin-table-tools"><span>{mappings.length} subject mappings</span></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Subject area</th><th>Lecturer</th><th>Department</th><th>Profile skills</th><th aria-label="Actions" /></tr></thead><tbody>
            {mappings.map((mapping) => <tr key={mapping.id}>
                <td><strong>{mapping.subject_area}</strong></td>
                <td><strong>{mapping.reviewer_name}</strong><span className="admin-table-sub">@{mapping.reviewer_username}</span></td>
                <td>{mapping.department || '—'}</td>
                <td>{mapping.skillset || '—'}</td>
                <td><button type="button" className="admin-danger-icon" title={`Remove ${mapping.subject_area} mapping`} aria-label={`Remove ${mapping.subject_area} mapping`} disabled={deletingId === mapping.id} onClick={() => removeMapping(mapping)}><Trash2 size={16} /></button></td>
            </tr>)}
            {mappings.length === 0 && <tr><td colSpan="5" className="admin-empty">No subject mappings configured yet.</td></tr>}
        </tbody></table></div>
    </>;
}

function UserRow({ user, onSave, onDelete }) {
    const [editing, setEditing] = useState(false);
    const [details, setDetails] = useState({ first_name: user.first_name || '', last_name: user.last_name || '', email: user.email || '', department: user.department || '', skillset: user.skillset || '' });
    const saveDetails = async (event) => {
        event.preventDefault();
        if (await onSave(user.id, details)) setEditing(false);
    };
    return <>
        <tr><td><strong>{user.first_name || user.last_name ? `${user.first_name} ${user.last_name}`.trim() : user.username}</strong><span className="admin-table-sub">@{user.username}{user.email ? ` · ${user.email}` : ''}</span></td><td>{user.department || '—'}{user.skillset && <span className="admin-table-sub">{user.skillset}</span>}</td><td>{user.role === 'ADMIN' ? 'Administrator' : user.role === 'LECTURER' ? 'Lecturer' : 'Student'}</td><td><button className={`admin-access ${user.is_active ? 'enabled' : 'disabled'}`} onClick={() => onSave(user.id, { is_active: !user.is_active })}>{user.is_active ? 'Active' : 'Disabled'}</button></td><td><div className="admin-row-actions"><button className="admin-danger-icon" title={`Edit ${user.username}`} aria-label={`Edit ${user.username}`} onClick={() => setEditing((value) => !value)}><Pencil size={15} /></button><button className="admin-danger-icon" title={`Remove ${user.username}`} aria-label={`Remove ${user.username}`} onClick={() => onDelete(user)}><Trash2 size={16} /></button></div></td></tr>
        {editing && <tr className="admin-edit-row"><td colSpan="5"><form onSubmit={saveDetails}><div className="admin-form-grid">{[['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['department', 'Department'], ['skillset', 'Skills and expertise']].map(([field, label]) => <label key={field}>{label}<input type={field === 'email' ? 'email' : 'text'} maxLength={field === 'skillset' ? 500 : undefined} value={details[field]} onChange={(event) => setDetails((current) => ({ ...current, [field]: event.target.value }))} /></label>)}</div><div className="admin-application-actions"><button type="button" className="admin-secondary" onClick={() => setEditing(false)}>Cancel</button><button className="admin-primary compact">Save profile details</button></div></form></td></tr>}
    </>;
}

function CreateUser({ onCreated, onError }) {
    const [form, setForm] = useState({ username: '', password: '', first_name: '', last_name: '', email: '', role: 'STUDENT', department: '', skillset: '' });
    const [busy, setBusy] = useState(false);
    const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    const submit = async (event) => {
        event.preventDefault(); setBusy(true); onError('');
        try {
            await API.post('admin/users/', form);
            await onCreated();
        }
        catch (requestError) { onError(requestError.response?.data ? Object.values(requestError.response.data).flat().join(' ') : 'Unable to create account.'); }
        finally { setBusy(false); }
    };
    return <form className="admin-panel admin-create-form" onSubmit={submit}><div className="admin-panel-heading"><div><span className="admin-panel-kicker">NEW ACCOUNT</span><h2>Create user</h2></div><button type="button" className="admin-danger-icon" title="Close" aria-label="Close" onClick={() => onCreated()}><X size={17} /></button></div><div className="admin-form-grid">{[['username', 'Username'], ['password', 'Temporary password'], ['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['department', 'Department'], ['skillset', 'Skills and expertise']].map(([name, label]) => <label key={name}>{label}<input name={name} type={name === 'password' ? 'password' : name === 'email' ? 'email' : 'text'} value={form[name]} onChange={change} required={['username', 'password'].includes(name)} minLength={name === 'password' ? 8 : undefined} maxLength={name === 'skillset' ? 500 : undefined} /></label>)}<label>Role<select name="role" value={form.role} onChange={change}><option value="STUDENT">Student</option><option value="LECTURER">Lecturer</option></select></label></div><button className="admin-primary compact" disabled={busy}><Plus size={16} /> Create account</button></form>;
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