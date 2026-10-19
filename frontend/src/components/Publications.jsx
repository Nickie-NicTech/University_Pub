import React, { useState, useEffect, useCallback } from 'react';
import { Flame, UserRoundPlus, Search, X, Check, Pencil, Trash2, Download, Eye, Plus, LoaderCircle } from 'lucide-react';
import API from '../api';

export default function Publications({ user }) {
    const [publications, setPublications] = useState([]);
    const [publicationsLoading, setPublicationsLoading] = useState(true);
    const [publicationsError, setPublicationsError] = useState('');
    const [downloadingPublicationId, setDownloadingPublicationId] = useState(null);
    const [pendingAction, setPendingAction] = useState('');
    const [actionFeedback, setActionFeedback] = useState(null);
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [showSubmissionForm, setShowSubmissionForm] = useState(false);
    
    // Core Form Hooks
    const [title, setTitle] = useState('');
    const [abstract, setAbstract] = useState('');
    const [pubType, setPubType] = useState('JOURNAL');
    const [subject, setSubject] = useState('');
    const [file, setFile] = useState(null);
    const [selectedAuthors, setSelectedAuthors] = useState([]);
    const [showAuthorModal, setShowAuthorModal] = useState(false);
    const [authorMode, setAuthorMode] = useState('search');
    const [authorSearch, setAuthorSearch] = useState('');
    const [authorResults, setAuthorResults] = useState([]);
    const [authorSearchLoading, setAuthorSearchLoading] = useState(false);
    const [authorSearchError, setAuthorSearchError] = useState('');
    const [authorFeedback, setAuthorFeedback] = useState(null);
    const [authorSaving, setAuthorSaving] = useState(false);
    const [authorDraft, setAuthorDraft] = useState({
        first_name: '', last_name: '', physical_address: '', occupation: '', department: '', institution: '',
    });
    const [activeAuthor, setActiveAuthor] = useState(null);
    const [authorWorks, setAuthorWorks] = useState([]);
    const [authorLoading, setAuthorLoading] = useState(false);
    const [authorWorksError, setAuthorWorksError] = useState('');
    const [publicationSaving, setPublicationSaving] = useState(false);
    const [supervisors, setSupervisors] = useState([]);
    const [supervisorLoading, setSupervisorLoading] = useState(true);
    const [supervisorError, setSupervisorError] = useState('');
    const [supervisorId, setSupervisorId] = useState('');
    const [coSupervisorId, setCoSupervisorId] = useState('');

    // Restrictions configuration boundary parameters
    const canWrite = user && ['STUDENT', 'LECTURER'].includes(user.role);
    const latestHighlights = publications.slice(0, 3); // Grab top 3 items for the feed banner

    const fetchPublications = useCallback(async () => {
        const res = await API.get(`publications/?search=${encodeURIComponent(search)}`);
        return Array.isArray(res.data) ? res.data : [];
    }, [search]);

    const refreshPublications = async () => {
        setPublicationsLoading(true);
        setPublicationsError('');
        try {
            setPublications(await fetchPublications());
        } catch (err) {
            console.error('Unable to refresh publications:', err);
            setPublicationsError(getErrorMessage(err, 'Unable to load publications. Please try again.'));
        } finally {
            setPublicationsLoading(false);
        }
    };

    const clearForm = () => {
        setEditingId(null);
        setTitle('');
        setAbstract('');
        setPubType('JOURNAL');
        setSubject('');
        setFile(null);
        setSelectedAuthors([]);
        setSupervisorId('');
        setCoSupervisorId('');
    };

    useEffect(() => {
        let isCurrentRequest = true;
        fetchPublications()
            .then((data) => {
                if (isCurrentRequest) setPublications(data);
            })
            .catch((err) => {
                if (!isCurrentRequest) return;
                console.error('Unable to load publications:', err);
                setPublicationsError(getErrorMessage(err, 'Unable to load publications. Please try again.'));
            })
            .finally(() => {
                if (isCurrentRequest) setPublicationsLoading(false);
            });
        return () => { isCurrentRequest = false; };
    }, [fetchPublications]);

    useEffect(() => {
        if (!canWrite) return;
        let isCurrentRequest = true;
        API.get('users/supervisors/')
            .then(({ data }) => {
                if (!isCurrentRequest) return;
                setSupervisors(Array.isArray(data) ? data : []);
            })
            .catch((err) => {
                if (!isCurrentRequest) return;
                console.error('Unable to load lecturer supervisors:', err);
                setSupervisorError(getErrorMessage(err, 'Unable to load the lecturer list.'));
            })
            .finally(() => {
                if (isCurrentRequest) setSupervisorLoading(false);
            });
        return () => { isCurrentRequest = false; };
    }, [canWrite]);

    useEffect(() => {
        if (!showAuthorModal) return;
        let isCurrentSearch = true;
        API.get(`authors/?search=${encodeURIComponent(authorSearch)}`)
            .then(({ data }) => {
                if (isCurrentSearch) setAuthorResults(Array.isArray(data) ? data : []);
            })
            .catch((err) => {
                if (!isCurrentSearch) return;
                console.error('Unable to search authors:', err);
                setAuthorSearchError(getErrorMessage(err, 'Unable to search authors. Please try again.'));
            })
            .finally(() => {
                if (isCurrentSearch) setAuthorSearchLoading(false);
            });
        return () => { isCurrentSearch = false; };
    }, [showAuthorModal, authorSearch]);

    const toggleAuthor = (author) => {
        setSelectedAuthors((current) => current.some((item) => item.id === author.id)
            ? current.filter((item) => item.id !== author.id)
            : [...current, author]);
    };

    const showAuthorDetails = async (author) => {
        setActiveAuthor(author);
        setAuthorWorks([]);
        setAuthorWorksError('');
        setAuthorLoading(true);
        try {
            const searchTerms = [...new Set(
                [author.first_name, author.last_name]
                    .map((name) => name?.trim())
                    .filter(Boolean)
            )];
            if (searchTerms.length === 0 && author.name) {
                searchTerms.push(...new Set(author.name.trim().split(/\s+/).filter(Boolean)));
            }
            const responses = await Promise.all(searchTerms.map((term) =>
                API.get(`publications/?search=${encodeURIComponent(term)}`)
            ));
            const works = responses.flatMap(({ data }) => Array.isArray(data) ? data : []);
            const authorPublications = new Map();
            works.forEach((work) => {
                if ((work.authors_details || []).some((item) => item.id === author.id)) {
                    authorPublications.set(work.id, work);
                }
            });
            setAuthorWorks([...authorPublications.values()]);
        } catch (err) {
            console.error('Unable to load author publications:', err);
            setAuthorWorksError('Unable to load this author’s publications. Please try again.');
        } finally {
            setAuthorLoading(false);
        }
    };

    const handleCreateAuthor = async (event) => {
        event.preventDefault();
        setAuthorSaving(true);
        setAuthorFeedback(null);
        const firstName = authorDraft.first_name.trim();
        const lastName = authorDraft.last_name.trim();
        if (!firstName || !lastName) {
            setAuthorFeedback({ type: 'error', message: 'Enter both a first name and a last name.' });
            setAuthorSaving(false);
            return;
        }
        try {
            const { data: matchingAuthors } = await API.get(`authors/?search=${encodeURIComponent(firstName)}`);
            const existingAuthor = (Array.isArray(matchingAuthors) ? matchingAuthors : []).find((author) =>
                author.first_name?.trim().toLocaleLowerCase() === firstName.toLocaleLowerCase()
                && author.last_name?.trim().toLocaleLowerCase() === lastName.toLocaleLowerCase()
            ) || authorResults.find((author) =>
                author.first_name?.trim().toLocaleLowerCase() === firstName.toLocaleLowerCase()
                && author.last_name?.trim().toLocaleLowerCase() === lastName.toLocaleLowerCase()
            );
            if (existingAuthor) {
                setSelectedAuthors((current) => current.some((item) => item.id === existingAuthor.id)
                    ? current
                    : [...current, existingAuthor]);
                setAuthorResults((current) => current.some((item) => item.id === existingAuthor.id) ? current : [existingAuthor, ...current]);
                setAuthorFeedback({ type: 'success', message: `${existingAuthor.name} already exists and has been selected.` });
                setAuthorMode('search');
                return;
            }
            const { data } = await API.post('authors/', { ...authorDraft, first_name: firstName, last_name: lastName });
            setSelectedAuthors((current) => current.some((item) => item.id === data.id) ? current : [...current, data]);
            setAuthorResults((current) => current.some((item) => item.id === data.id) ? current : [data, ...current]);
            setAuthorDraft({ first_name: '', last_name: '', physical_address: '', occupation: '', department: '', institution: '' });
            setAuthorMode('search');
            setAuthorFeedback({ type: 'success', message: `${data.name} was added and selected for this publication.` });
        } catch (err) {
            console.error('Unable to add author:', err);
            setAuthorFeedback({ type: 'error', message: getErrorMessage(err, 'Unable to add this author. Please try again.') });
        } finally {
            setAuthorSaving(false);
        }
    };

    const handleDeletionRequest = async (publication) => {
        const reason = window.prompt(`Request deletion of "${publication.title}". Add a reason (optional):`);
        if (reason === null) return;
        setPendingAction(`delete-${publication.id}`);
        setActionFeedback(null);
        try {
            await API.post(`publications/${publication.id}/request-deletion/`, { reason });
            setActionFeedback({ type: 'success', message: `Deletion request for "${publication.title}" was submitted for review.` });
            await refreshPublications();
        } catch (err) {
            console.error('Unable to submit deletion request:', err);
            setActionFeedback({ type: 'error', message: getErrorMessage(err, 'Could not submit the deletion request.') });
        } finally {
            setPendingAction('');
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setPublicationSaving(true);
        setActionFeedback(null);
        const formData = new FormData();
        formData.append('title', title);
        formData.append('abstract', abstract);
        formData.append('pub_type', pubType);
        formData.append('subject_area', subject);
        formData.append('supervisor', supervisorId);
        formData.append('co_supervisor', coSupervisorId);
        selectedAuthors.forEach((author) => formData.append('authors', author.id));
        if (file) formData.append('file_attachment', file);

        try {
            let response;
            if (editingId) {
                response = await API.put(`publications/${editingId}/`, formData);
            } else {
                response = await API.post('publications/', formData);
            }
            setActionFeedback({
                type: 'success',
                message: `${editingId ? 'Publication changes saved successfully and resubmitted for review.' : 'Publication submitted successfully and is pending review.'}${response.data.notification_warning ? ` ${response.data.notification_warning}` : ''}`,
            });
            clearForm();
            setShowSubmissionForm(false);
            await refreshPublications();
        } catch (err) {
            console.error('Unable to save publication:', err);
            setActionFeedback({ type: 'error', message: getErrorMessage(err, 'Publication could not be saved. Please try again.') });
        } finally {
            setPublicationSaving(false);
        }
    };

    const downloadPublication = async (publication) => {
        setDownloadingPublicationId(publication.id);
        try {
            const { data } = await API.get(`publications/${publication.id}/download/`, { responseType: 'blob' });
            const downloadUrl = URL.createObjectURL(data);
            const link = document.createElement('a');
            const filename = (publication.title || 'publication').replace(/[<>:"/\\|?*]/g, '_');
            link.href = downloadUrl;
            link.download = `${filename}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
            setActionFeedback({ type: 'success', message: `Download started for "${publication.title}".` });
        } catch (err) {
            console.error('Unable to download publication:', err);
            setActionFeedback({ type: 'error', message: getErrorMessage(err, 'Unable to download this publication.') });
        } finally {
            setDownloadingPublicationId(null);
        }
    };

    const viewPublication = async (publication) => {
        const viewer = window.open('', '_blank');
        if (!viewer) {
            setActionFeedback({ type: 'error', message: 'Please allow pop-ups to view this publication.' });
            return;
        }
        try {
            const { data } = await API.get(`publications/${publication.id}/view/`, { responseType: 'blob' });
            const viewUrl = URL.createObjectURL(data);
            viewer.location.href = viewUrl;
            window.setTimeout(() => URL.revokeObjectURL(viewUrl), 60000);
            setActionFeedback({ type: 'success', message: `Opened "${publication.title}" in a new tab.` });
        } catch (err) {
            viewer.close();
            console.error('Unable to view publication:', err);
            setActionFeedback({ type: 'error', message: getErrorMessage(err, 'Unable to view this publication.') });
        }
    };

    const publicationActions = (publication, dark = false) => {
        if (!publication.file_attachment) return null;
        const buttonStyle = {
            ...iconButtonStyle,
            color: dark ? '#f8fafc' : '#0369a1',
            background: dark ? 'rgba(255, 255, 255, 0.12)' : '#fff',
            borderColor: dark ? 'rgba(255, 255, 255, 0.35)' : '#cbd5e1',
        };
        return (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button type="button" onClick={() => viewPublication(publication)} title={`View ${publication.title}`} aria-label={`View ${publication.title}`} style={buttonStyle}>
                    <Eye size={16} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => downloadPublication(publication)} disabled={downloadingPublicationId === publication.id} title={`Download ${publication.title}`} aria-label={`Download ${publication.title}`} style={{ ...buttonStyle, cursor: downloadingPublicationId === publication.id ? 'wait' : 'pointer' }}>
                    {downloadingPublicationId === publication.id ? <LoaderCircle size={16} className="publication-spinner" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                </button>
            </div>
        );
    };

    return (
        <>
        <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
            {/* Left Explorer Main Timeline Pane */}
            <div style={{ flex: 1, minWidth: 0, padding: '24px clamp(16px, 4vw, 48px)', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
                <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
                    
                    {/* 🌟 New Highlights Stream Banner */}
                    <div style={{ marginBottom: '28px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <Flame size={16} color="#f97316"/> Latest Repository Highlights
                            </h4>
                            {canWrite && (
                                <button type="button" onClick={() => setShowSubmissionForm(true)} style={submissionButtonStyle}>
                                    <Plus size={17} aria-hidden="true" /> Submit research
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                            {latestHighlights.map(high => (
                                <div key={`high-${high.id}`} style={{ background: 'linear-gradient(135deg, #1e293b, #334155)', color: '#f8fafc', padding: '16px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '0.7rem', background: '#38bdf8', color: '#1e293b', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{high.pub_type}</span>
                                        {publicationActions(high, true)}
                                    </div>
                                    <h4 style={{ margin: '8px 0 4px 0', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{high.title}</h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Field: {high.subject_area}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Live Query Engine Module */}
                    <div style={{ marginBottom: '24px' }}>
                        <input 
                            type="text" 
                            placeholder="🔍 Guest Search Gateway: Query by title, abstract description, field, or classification area..." 
                            value={search} 
                            onChange={e => {
                                setSearch(e.target.value);
                                setPublicationsLoading(true);
                                setPublicationsError('');
                            }}
                            style={{
                                width: '100%', padding: '14px 18px', borderRadius: '8px', 
                                border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '1rem',
                                color: '#1e293b', boxSizing: 'border-box', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                        />
                    </div>
                    <p role="status" aria-live="polite" style={{ margin: '-12px 0 16px', color: '#64748b', fontSize: '0.85rem' }}>
                        {publicationsLoading
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}><LoaderCircle size={15} className="publication-spinner" aria-hidden="true" /> Loading publications…</span>
                            : publicationsError
                                ? publicationsError
                                : `Showing ${publications.length} of ${publications.length} results${search.trim() ? ` for “${search.trim()}”` : ''}.`}
                    </p>
                    {actionFeedback && (
                        <p role={actionFeedback.type === 'error' ? 'alert' : 'status'} style={feedbackStyle(actionFeedback.type)}>
                            {actionFeedback.message}
                        </p>
                    )}

                    {/* Timeline Loop */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {!publicationsLoading && !publicationsError && publications.length === 0 && (
                            <p style={{ margin: 0, padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', textAlign: 'center' }}>
                                {search.trim() ? 'No publications match your search. Try different keywords.' : 'No publications are available yet.'}
                            </p>
                        )}
                        {publications.map(pub => (
                            <div key={pub.id} style={{
                                backgroundColor: '#fff', padding: '20px', borderRadius: '8px',
                                border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px' }}>
                                    <h3 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '1.15rem' }}>{pub.title}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 8px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#475569' }}>{pub.pub_type}</span>
                                        {pub.file_attachment && (
                                            <button type="button" onClick={() => viewPublication(pub)} title={`View ${pub.title}`} aria-label={`View ${pub.title}`} style={iconButtonStyle}>
                                                <Eye size={15} aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0 0 12px 0' }}><strong>Research Domain:</strong> {pub.subject_area}</p>
                                {pub.authors_details?.length > 0 && (
                                    <div style={{ margin: '0 0 12px', color: '#64748b', fontSize: '0.875rem' }}>
                                        <strong>Authors: </strong>
                                        {pub.authors_details.map((author, index) => (
                                            <React.Fragment key={author.id}>
                                                {index > 0 && '; '}
                                                <button type="button" onClick={() => showAuthorDetails(author)} style={{ border: 0, padding: 0, background: 'none', color: '#0284c7', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
                                                    {author.name || `${author.first_name || ''} ${author.last_name || ''}`.trim()}
                                                </button>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                )}
                                <p style={{ fontSize: '0.925rem', lineHeight: '1.5', color: '#334155', marginBottom: '16px' }}>{pub.abstract}</p>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.825rem', fontWeight: 600, padding: '4px 8px', borderRadius: '9999px', backgroundColor: pub.is_approved ? '#dcfce7' : pub.review_status === 'REVISION_REQUESTED' ? '#ffedd5' : '#ffedd5', color: pub.is_approved ? '#15803d' : pub.review_status === 'REVISION_REQUESTED' ? '#9a3412' : '#c2410c' }}>
                                            ● {({
                                                PENDING_INVITATIONS: 'Waiting for reviewer responses',
                                                PENDING: 'Pending review',
                                                REVIEWER_DECLINED: 'Reviewers declined — choose again',
                                                REVISION_REQUESTED: 'Revisions requested',
                                                APPROVED: 'Approved',
                                            })[pub.review_status] || 'Pending review'}
                                        </span>
                                        {pub.file_attachment && (
                                            <button type="button" onClick={() => downloadPublication(pub)} disabled={downloadingPublicationId === pub.id} style={{ padding: 0, border: 0, background: 'none', color: '#0284c7', textDecoration: 'none', fontWeight: 500, fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: downloadingPublicationId === pub.id ? 'wait' : 'pointer' }} title={`Download manuscript (${pub.download_count || 0} downloads)`}>
                                                {downloadingPublicationId === pub.id ? <LoaderCircle size={15} className="publication-spinner" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />} {downloadingPublicationId === pub.id ? 'Downloading…' : 'Download PDF'} <span style={{ color: '#64748b' }}>({pub.download_count || 0})</span>
                                            </button>
                                        )}
                                    </div>

                                    {pub.is_owner && (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {!pub.is_approved && pub.review_status !== 'APPROVED' && (
                                                <>
                                                    <button title="Edit publication" aria-label="Edit publication" onClick={() => {
                                                        setEditingId(pub.id);
                                                        setTitle(pub.title);
                                                        setAbstract(pub.abstract);
                                                        setPubType(pub.pub_type);
                                                        setSubject(pub.subject_area);
                                                        setSelectedAuthors(pub.authors_details || []);
                                                        setSupervisorId(pub.supervisor_id ? String(pub.supervisor_id) : '');
                                                        setCoSupervisorId(pub.co_supervisor_id ? String(pub.co_supervisor_id) : '');
                                                        setShowSubmissionForm(true);
                                                    }} style={iconButtonStyle}><Pencil size={17} aria-hidden="true" /></button>
                                                    <button type="button" title="Request publication deletion" aria-label="Request publication deletion" disabled={pendingAction === `delete-${pub.id}`} onClick={() => handleDeletionRequest(pub)} style={{ ...iconButtonStyle, color: '#b91c1c', cursor: pendingAction === `delete-${pub.id}` ? 'wait' : 'pointer' }}>{pendingAction === `delete-${pub.id}` ? <LoaderCircle size={17} className="publication-spinner" aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}</button>
                                                </>
                                            )}
                                        {pub.review_invitations?.length > 0 && (
                                            <div style={{ marginTop: '10px', color: '#475569', fontSize: '0.82rem' }}>
                                                <strong>Reviewers:</strong>
                                                {pub.review_invitations.map((invitation) => (
                                                    <div key={invitation.id} style={{ marginTop: '4px' }}>
                                                        {invitation.reviewer_name} ({invitation.role === 'CO_SUPERVISOR' ? 'co-supervisor' : 'supervisor'}: {invitation.status.toLowerCase().replace('_', ' ')}{invitation.status === 'ACCEPTED' ? `, ${invitation.decision.toLowerCase().replace('_', ' ')}` : ''})
                                                        {invitation.feedback && <div style={{ margin: '3px 0 5px 8px', whiteSpace: 'pre-wrap' }}>Feedback: {invitation.feedback}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        </div>
                                    )}
                                </div>
                                {pub.is_owner && pub.review_feedback && (
                                    <div role="note" style={{ marginTop: '12px', padding: '11px 13px', borderLeft: '3px solid #c2410c', background: '#fff7ed', color: '#7c2d12', fontSize: '0.84rem', lineHeight: 1.5 }}>
                                        <strong>Supervisor feedback:</strong> {pub.review_feedback}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {canWrite && showSubmissionForm && (
                <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSubmissionForm(false); }} style={submissionBackdropStyle}>
                    <section role="dialog" aria-modal="true" aria-labelledby="submission-title" style={submissionPanelStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                            <div>
                                <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{editingId ? 'Update repository record' : 'Contribute to the repository'}</span>
                                <h3 id="submission-title" style={{ margin: '4px 0 0', color: '#1e293b' }}>{editingId ? 'Edit publication' : 'Submit research output'}</h3>
                            </div>
                            <button type="button" title="Close form" aria-label="Close publication form" onClick={() => setShowSubmissionForm(false)} style={iconButtonStyle}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSave} style={{ display: 'flex', minHeight: 0, flexDirection: 'column', gap: '16px', overflowY: 'auto', overscrollBehavior: 'contain', padding: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'end', gap: '8px' }}>
                            <div style={{ flex: 1 }}><label htmlFor="publication-title" style={labelStyle}>Publication Title (required)</label><input id="publication-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required style={formInputStyle}/></div>
                            <button type="button" title="Add or select publication authors" aria-label="Add or select publication authors" onClick={() => { setAuthorSearchLoading(true); setAuthorSearchError(''); setAuthorFeedback(null); setShowAuthorModal(true); }} style={{ ...iconButtonStyle, height: '40px', minWidth: '42px', color: '#0369a1' }}>
                                <UserRoundPlus size={18} aria-hidden="true" />
                                <span style={{ fontSize: '0.75rem' }}>{selectedAuthors.length || ''}</span>
                            </button>
                        </div>
                        {selectedAuthors.length > 0 && <p style={{ margin: '-8px 0 0', color: '#475569', fontSize: '0.8rem' }}>Authors: {selectedAuthors.map((author) => author.name || `${author.first_name} ${author.last_name}`).join('; ')}</p>}
                        <div>
                            <label htmlFor="publication-reviewer" style={labelStyle}>Lecturer supervisor (required)</label>
                            {supervisorLoading ? (
                                <p role="status" style={{ color: '#64748b', fontSize: '0.85rem' }}><LoaderCircle size={15} className="publication-spinner" aria-hidden="true" /> Loading supervisor…</p>
                            ) : supervisorError ? (
                                <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{supervisorError}</p>
                            ) : supervisors.length > 0 ? (
                                <>
                                <select id="publication-reviewer" value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} required style={formInputStyle}>
                                    <option value="">Select a lecturer supervisor</option>
                                    {supervisors.map((lecturer) => <option key={lecturer.user_id} value={lecturer.user_id}>{lecturer.name} — {lecturer.department}</option>)}
                                </select>
                                <label htmlFor="publication-co-supervisor" style={{ ...labelStyle, marginTop: '10px' }}>Co-supervisor (optional)</label>
                                <select id="publication-co-supervisor" value={coSupervisorId} onChange={(event) => setCoSupervisorId(event.target.value)} style={formInputStyle}>
                                    <option value="">No co-supervisor</option>
                                    {supervisors.filter((lecturer) => String(lecturer.user_id) !== supervisorId).map((lecturer) => <option key={lecturer.user_id} value={lecturer.user_id}>{lecturer.name} — {lecturer.department}</option>)}
                                </select>
                                </>
                            ) : (
                                <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>No active lecturers are available to review this publication.</p>
                            )}
                        </div>
                        <div><label htmlFor="publication-subject" style={labelStyle}>Subject Area (required)</label><input id="publication-subject" type="text" value={subject} onChange={e => setSubject(e.target.value)} required style={formInputStyle}/></div>
                        <div>
                            <label htmlFor="publication-abstract" style={labelStyle}>Abstract Description (required)</label>
                            <textarea id="publication-abstract" value={abstract} onChange={e => setAbstract(e.target.value)} required style={{ ...formInputStyle, height: '100px', resize: 'vertical' }}></textarea>
                        </div>
                        <div>
                            <label htmlFor="publication-type" style={labelStyle}>Publication Type (required)</label>
                            <select id="publication-type" value={pubType} onChange={e => setPubType(e.target.value)} required style={formInputStyle}>
                                <option value="JOURNAL">Journal Article</option>
                                <option value="CONFERENCE">Conference Paper</option>
                                <option value="THESIS">Thesis</option>
                                <option value="DISSERTATION">Dissertation</option>
                            </select>
                        </div>                                              
                        <div>
                            <label htmlFor="publication-file" style={labelStyle}>File Attachment (PDF, optional)</label>
                            <input id="publication-file" type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])} style={formInputStyle}/>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button type="submit" disabled={publicationSaving} style={{ padding: '10px 16px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: publicationSaving ? 'wait' : 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '7px' }}>{publicationSaving && <LoaderCircle size={16} className="publication-spinner" aria-hidden="true" />}{publicationSaving ? 'Saving…' : editingId ? 'Update Publication' : 'Submit Publication'}</button>
                            {editingId && <button type="button" onClick={() => { clearForm(); setShowSubmissionForm(false); }} style={{ padding: '10px 16px', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Cancel Edit</button>}
                        </div>
                        </form>
                    </section>
                </div>
            )}
        {activeAuthor && (
            <div onClick={() => setActiveAuthor(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                <div role="dialog" aria-modal="true" aria-label="Author details" onClick={(event) => event.stopPropagation()} style={{ background: '#fff', borderRadius: '10px', padding: '24px', width: 'min(560px, 100%)', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 25px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                        <h3 style={{ margin: 0, color: '#1e293b' }}>{activeAuthor.name || `${activeAuthor.first_name || ''} ${activeAuthor.last_name || ''}`.trim()}</h3>
                        <button type="button" onClick={() => setActiveAuthor(null)} aria-label="Close author details" style={{ border: 0, background: 'none', cursor: 'pointer', color: '#475569' }}><X size={20}/></button>
                    </div>
                    <div style={{ margin: '16px 0', color: '#475569', lineHeight: 1.7 }}>
                        {['occupation', 'department', 'institution', 'physical_address'].map((field) => activeAuthor[field] && <div key={field}><strong>{field.replace('_', ' ')}:</strong> {activeAuthor[field]}</div>)}
                    </div>
                    <h4 style={{ margin: '16px 0 8px', color: '#1e293b' }}>Other publications</h4>
                    {authorLoading ? <p role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}><LoaderCircle size={15} className="publication-spinner" aria-hidden="true" /> Loading publications…</p> : authorWorksError ? (
                        <p role="alert" style={{ color: '#b91c1c' }}>{authorWorksError}</p>
                    ) : authorWorks.length ? (
                        <ul style={{ paddingLeft: '20px', margin: 0, color: '#334155' }}>{authorWorks.map((work) => <li key={work.id} style={{ marginBottom: '8px' }}>{work.title}</li>)}</ul>
                    ) : <p style={{ color: '#64748b' }}>No other publications found.</p>}
                </div>
            </div>
        )}
        {showAuthorModal && (
            <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAuthorModal(false); }} style={modalBackdropStyle}>
                <section role="dialog" aria-modal="true" aria-labelledby="author-modal-title" style={authorModalStyle}>
                    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <h2 id="author-modal-title" style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>Publication authors</h2>
                            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.82rem' }}>{selectedAuthors.length} selected for this record</p>
                        </div>
                        <button type="button" title="Close author dialog" aria-label="Close author dialog" onClick={() => setShowAuthorModal(false)} style={iconButtonStyle}><X size={18} /></button>
                    </header>
                    <div role="tablist" aria-label="Author options" style={modalTabsStyle}>
                        <button type="button" role="tab" aria-selected={authorMode === 'search'} onClick={() => setAuthorMode('search')} style={modalTabStyle(authorMode === 'search')}><Search size={15} /> Search authors</button>
                        <button type="button" role="tab" aria-selected={authorMode === 'new'} onClick={() => setAuthorMode('new')} style={modalTabStyle(authorMode === 'new')}><UserRoundPlus size={15} /> Add author</button>
                    </div>
                    {authorFeedback && (
                        <p role={authorFeedback.type === 'error' ? 'alert' : 'status'} style={feedbackStyle(authorFeedback.type)}>
                            {authorFeedback.message}
                        </p>
                    )}
                    {authorMode === 'search' ? (
                        <div>
                            <input type="search" value={authorSearch} onChange={(event) => { setAuthorSearchLoading(true); setAuthorSearchError(''); setAuthorSearch(event.target.value); }} placeholder="Name, occupation, address or institution" aria-label="Search existing authors" style={formInputStyle} />
                            <div style={authorListStyle}>
                                {authorSearchLoading ? (
                                    <p role="status" style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '12px' }}><LoaderCircle size={15} className="publication-spinner" aria-hidden="true" /> Searching authors…</p>
                                ) : authorSearchError ? (
                                    <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem', textAlign: 'center', padding: '12px' }}>{authorSearchError}</p>
                                ) : authorResults.map((author) => {
                                    const isSelected = selectedAuthors.some((item) => item.id === author.id);
                                    return <button key={author.id} type="button" onClick={() => toggleAuthor(author)} style={{ ...authorResultStyle, borderColor: isSelected ? '#0284c7' : '#e2e8f0', background: isSelected ? '#f0f9ff' : '#fff' }}>
                                        <span style={{ minWidth: 0 }}><strong style={{ display: 'block', color: '#1e293b' }}>{author.name}</strong><span style={{ display: 'block', color: '#64748b', fontSize: '0.78rem' }}>{[author.occupation, author.department, author.institution].filter(Boolean).join(' · ')}</span><span style={{ display: 'block', color: '#94a3b8', fontSize: '0.75rem' }}>{author.physical_address}</span></span>
                                        {isSelected && <Check size={17} color="#0284c7" aria-label="Selected" />}
                                    </button>;
                                })}
                                {!authorSearchLoading && !authorSearchError && authorResults.length === 0 && <p style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '12px' }}>No matching authors.</p>}
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleCreateAuthor} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div><label htmlFor="author-first-name" style={labelStyle}>First name (required)</label><input id="author-first-name" required value={authorDraft.first_name} onChange={(event) => setAuthorDraft({ ...authorDraft, first_name: event.target.value })} style={formInputStyle} /></div>
                            <div><label htmlFor="author-last-name" style={labelStyle}>Last name (required)</label><input id="author-last-name" required value={authorDraft.last_name} onChange={(event) => setAuthorDraft({ ...authorDraft, last_name: event.target.value })} style={formInputStyle} /></div>
                            <div><label htmlFor="author-occupation" style={labelStyle}>Occupation (optional)</label><input id="author-occupation" value={authorDraft.occupation} onChange={(event) => setAuthorDraft({ ...authorDraft, occupation: event.target.value })} style={formInputStyle} /></div>
                            <div><label htmlFor="author-department" style={labelStyle}>Department (optional)</label><input id="author-department" value={authorDraft.department} onChange={(event) => setAuthorDraft({ ...authorDraft, department: event.target.value })} style={formInputStyle} /></div>
                            <div style={{ gridColumn: '1 / -1' }}><label htmlFor="author-address" style={labelStyle}>Physical address (optional)</label><input id="author-address" value={authorDraft.physical_address} onChange={(event) => setAuthorDraft({ ...authorDraft, physical_address: event.target.value })} style={formInputStyle} /></div>
                            <div style={{ gridColumn: '1 / -1' }}><label htmlFor="author-institution" style={labelStyle}>Institution (optional)</label><input id="author-institution" value={authorDraft.institution} onChange={(event) => setAuthorDraft({ ...authorDraft, institution: event.target.value })} style={formInputStyle} /></div>
                            <button type="submit" disabled={authorSaving} style={{ gridColumn: '1 / -1', justifySelf: 'end', padding: '8px 14px', border: 0, borderRadius: '5px', background: '#0369a1', color: '#fff', fontWeight: 600, cursor: authorSaving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>{authorSaving && <LoaderCircle size={15} className="publication-spinner" aria-hidden="true" />}{authorSaving ? 'Adding author…' : 'Add to publication'}</button>
                        </form>
                    )}
                    <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{selectedAuthors.map((author) => author.name).join(', ') || 'No authors selected'}</span>
                        <button type="button" onClick={() => setShowAuthorModal(false)} style={{ padding: '8px 14px', border: 0, borderRadius: '5px', background: '#1e293b', color: '#fff', cursor: 'pointer' }}>Done</button>
                    </footer>
                </section>
            </div>
        )}
        </div>
        </>
    );
}
 const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '0.875rem', color: '#475569', fontWeight: 600 };
 const feedbackStyle = (type) => ({
     margin: '0 0 14px',
     padding: '10px 12px',
     border: `1px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'}`,
     borderRadius: '6px',
     background: type === 'error' ? '#fef2f2' : '#f0fdf4',
     color: type === 'error' ? '#991b1b' : '#166534',
     fontSize: '0.875rem',
 });
 const getErrorMessage = (error, fallback) => {
     const data = error?.response?.data;
     if (typeof data === 'string' && data.trim()) return data;
     if (data && typeof data === 'object' && !(data instanceof Blob)) {
         const formatValue = (value) => Array.isArray(value)
             ? value.map(formatValue).join(', ')
             : value && typeof value === 'object'
                 ? Object.entries(value).map(([key, nested]) => `${key}: ${formatValue(nested)}`).join('; ')
                 : String(value);
         const message = Object.entries(data)
             .map(([field, value]) => field === 'detail' ? formatValue(value) : `${field}: ${formatValue(value)}`)
             .filter(Boolean)
             .join('\n');
         if (message) return message;
     }
     return error?.message || fallback;
 };
 const formInputStyle = { width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '0.9rem', color: '#1e293b', boxSizing: 'border-box' };
const iconButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '7px', border: '1px solid #cbd5e1', borderRadius: '5px', background: '#fff', color: '#475569', cursor: 'pointer' };
const submissionButtonStyle = { display: 'inline-flex', flex: '0 0 auto', alignItems: 'center', gap: '7px', padding: '9px 13px', border: 0, borderRadius: '6px', background: '#0369a1', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', boxShadow: '0 2px 5px rgba(3, 105, 161, 0.2)' };
const submissionBackdropStyle = { position: 'fixed', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', overflowY: 'auto', padding: '16px', boxSizing: 'border-box', background: 'rgba(15, 23, 42, 0.48)' };
const submissionPanelStyle = { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: '18px', width: 'min(100%, 720px)', maxHeight: 'calc(100dvh - 32px)', minHeight: 0, padding: 'clamp(16px, 4vw, 24px)', border: '1px solid #dbe3ec', borderRadius: '12px', background: '#fff', boxShadow: '0 24px 70px rgba(15, 23, 42, 0.3)', boxSizing: 'border-box' };
const modalBackdropStyle = { position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 23, 42, 0.48)', display: 'grid', placeItems: 'center', padding: '16px' };
const authorModalStyle = { width: 'min(100%, 560px)', maxHeight: 'min(620px, 88vh)', overflowY: 'auto', background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)', boxSizing: 'border-box' };
const modalTabsStyle = { display: 'flex', gap: '4px', padding: '4px', marginBottom: '14px', borderRadius: '6px', background: '#f1f5f9' };
const modalTabStyle = (active) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flex: 1, padding: '8px', border: 0, borderRadius: '4px', background: active ? '#fff' : 'transparent', color: active ? '#0369a1' : '#475569', fontWeight: 600, cursor: 'pointer' });
const authorListStyle = { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '270px', overflowY: 'auto', marginTop: '10px' };
const authorResultStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%', padding: '10px', border: '1px solid', borderRadius: '5px', textAlign: 'left', cursor: 'pointer' };