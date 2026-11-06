import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flame, UserRoundPlus, Search, X, Check, Pencil, Trash2, Download, Eye, Plus, LoaderCircle, SlidersHorizontal, History, BookOpenCheck, BarChart3, MessageSquareText, CircleX, Clock3 } from 'lucide-react';
import API from '../api';

export default function Publications({ user, profileActivity }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [publications, setPublications] = useState([]);
    const [highlights, setHighlights] = useState([]);
    const [publicationsLoading, setPublicationsLoading] = useState(true);
    const [publicationsError, setPublicationsError] = useState('');
    const [highlightsLoading, setHighlightsLoading] = useState(true);
    const [highlightsError, setHighlightsError] = useState('');
    const [downloadingPublicationId, setDownloadingPublicationId] = useState(null);
    const [pendingAction, setPendingAction] = useState('');
    const [actionFeedback, setActionFeedback] = useState(null);
    const [search, setSearch] = useState('');
    const [showAllFilters, setShowAllFilters] = useState(false);
    const [searchFields, setSearchFields] = useState(['title', 'abstract', 'author', 'subject_area']);
    const [publicationTypes, setPublicationTypes] = useState([]);
    const [authorFilter, setAuthorFilter] = useState('');
    const [subjectFilter, setSubjectFilter] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editingPublication, setEditingPublication] = useState(null);
    const [showSubmissionForm, setShowSubmissionForm] = useState(false);
    
    // Core Form Hooks
    const [title, setTitle] = useState('');
    const [abstract, setAbstract] = useState('');
    const abstractWordCount = countWords(abstract);
    const isAbstractWordCountValid = abstractWordCount >= 150 && abstractWordCount <= 250;
    const [pubType, setPubType] = useState('JOURNAL');
    const [subject, setSubject] = useState('');
    const [subjectAreas, setSubjectAreas] = useState([]);
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
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const [datePreset, setDatePreset] = useState('');
    const [activityStatusFilter, setActivityStatusFilter] = useState('');
    const [expandedHistoryId, setExpandedHistoryId] = useState(null);
    const [publicationHistory, setPublicationHistory] = useState({});
    const [historyLoadingId, setHistoryLoadingId] = useState(null);
    const [historyError, setHistoryError] = useState('');

    // Restrictions configuration boundary parameters
    const canWrite = user && ['STUDENT', 'LECTURER'].includes(user.role);
    const latestHighlights = highlights.slice(0, 3);
    const activityStatusLabels = {
        APPROVED: 'approved',
        PENDING: 'pending review',
        REVISION_REQUESTED: 'feedback',
        REVIEWER_DECLINED: 'rejected',
    };
    const hasSearchFilters = Boolean(
        search.trim()
        || authorFilter.trim()
        || subjectFilter.trim()
        || publicationTypes.length > 0
        || searchFields.length !== 4
        || dateFrom
        || dateTo
        || monthFilter
        || activityStatusFilter
    );
    const visiblePublications = activityStatusFilter
        ? publications.filter((publication) => activityStatusFilter === 'APPROVED'
            ? publication.is_approved || publication.review_status === 'APPROVED'
            : publication.review_status === activityStatusFilter)
        : publications;
    const fetchPublications = useCallback(async () => {
        const params = new URLSearchParams();
        if (search.trim()) {
        params.set('search', search.trim());
        searchFields.forEach((field) => params.append('search_in', field));
        if (searchFields.length === 0) params.append('search_in', 'none');
        }
        publicationTypes.forEach((type) => params.append('pub_type', type));
        if (authorFilter.trim()) params.set('author', authorFilter.trim());
        if (subjectFilter.trim()) params.set('subject_area', subjectFilter.trim());
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        if (monthFilter) params.set('month', monthFilter);
        const query = params.toString();
        const res = await API.get(`publications/${query ? `?${query}` : ''}`);
        return Array.isArray(res.data) ? res.data : [];
        }, [search, searchFields, publicationTypes, authorFilter, subjectFilter, dateFrom, dateTo, monthFilter]);


    const toggleValue = (value, setValues) => {
        setValues((current) => current.includes(value)
            ? current.filter((item) => item !== value)
            : [...current, value]);
    };

    const applyDatePreset = (preset) => {
        const currentYear = new Date().getFullYear();
        setDatePreset(preset);
        if (preset === 'this_year') {
            setDateFrom(`${currentYear}-01-01`);
            setDateTo(`${currentYear}-12-31`);
        } else if (preset === 'last_three_years') {
            setDateFrom(`${currentYear - 2}-01-01`);
            setDateTo(`${currentYear}-12-31`);
        } else {
            setDateFrom('');
            setDateTo('');
        }
        setPublicationsLoading(true);
        setPublicationsError('');
    };

    const filterByActivity = (status) => {
        setActivityStatusFilter(status === 'ALL' ? '' : status);
        setSearch('');
        setSearchFields(['title', 'abstract', 'author', 'subject_area']);
        setPublicationTypes([]);
        setAuthorFilter('');
        setSubjectFilter('');
        setDateFrom('');
        setDateTo('');
        setMonthFilter('');
        setDatePreset('');
        setPublicationsLoading(true);
        setPublicationsError('');
        document.getElementById('publication-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const togglePublicationHistory = async (publicationId) => {
        if (expandedHistoryId === publicationId) {
            setExpandedHistoryId(null);
            return;
        }

        setExpandedHistoryId(publicationId);
        setHistoryError('');
        if (Object.hasOwn(publicationHistory, publicationId)) return;

        setHistoryLoadingId(publicationId);
        try {
            const { data } = await API.get(`publications/${publicationId}/history/`);
            setPublicationHistory((current) => ({
                ...current,
                [publicationId]: Array.isArray(data) ? data : [],
            }));
        } catch (err) {
            console.error('Unable to load publication history:', err);
            setHistoryError(getErrorMessage(err, 'Unable to load publication history.'));
        } finally {
            setHistoryLoadingId(null);
        }
    };

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
        setEditingPublication(null);
        setTitle('');
        setAbstract('');
        setPubType('JOURNAL');
        setSubject('');
        setFile(null);
        setSelectedAuthors([]);
    };

    const startEditing = (publication) => {
        setEditingId(publication.id);
        setEditingPublication(publication);
        setTitle(publication.title);
        setAbstract(publication.abstract);
        setPubType(publication.pub_type);
        setSubject(publication.subject_area);
        setSelectedAuthors(publication.authors_details || []);
        setShowSubmissionForm(true);
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
        let isCurrentRequest = true;
        API.get('publications/?highlights=true')
            .then(({ data }) => {
                if (isCurrentRequest) setHighlights(Array.isArray(data) ? data : []);
            })
            .catch((err) => {
                if (!isCurrentRequest) return;
                console.error('Unable to load repository highlights:', err);
                setHighlightsError(getErrorMessage(err, 'Unable to load repository highlights.'));
            })
            .finally(() => {
                if (isCurrentRequest) setHighlightsLoading(false);
            });
        return () => { isCurrentRequest = false; };
    }, []);

    useEffect(() => {
        const publicationId = searchParams.get('publication');
        if (!publicationId || publicationsLoading) return;

        const publication = publications.find((item) => String(item.id) === publicationId);
        if (!publication) {
            setActionFeedback({ type: 'error', message: 'The publication linked from this notification is not available in your repository.' });
        } else {
            document.getElementById(`publication-${publication.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('publication');
        nextParams.delete('action');
        setSearchParams(nextParams, { replace: true });
    }, [publications, publicationsLoading, searchParams, setSearchParams]);

    const rankedSupervisors = supervisors.slice(0, 1);
    const reviewInvitations = editingPublication?.review_invitations || [];
    const noReviewersResponded = reviewInvitations.length > 0
        && reviewInvitations.every((invitation) => invitation.status === 'INVITED');
    const canChangeSupervisor = reviewInvitations.some(
        (invitation) => invitation.role === 'SUPERVISOR'
            && (invitation.status === 'DECLINED' || (invitation.status === 'INVITED' && noReviewersResponded))
    );
    const canChangeCoSupervisor = reviewInvitations.some(
        (invitation) => invitation.role === 'CO_SUPERVISOR'
            && (invitation.status === 'DECLINED' || (invitation.status === 'INVITED' && noReviewersResponded))
    );
    const supervisorInvitation = editingPublication?.review_invitations?.find(
        (invitation) => invitation.role === 'SUPERVISOR'
    );
    const coSupervisorInvitation = editingPublication?.review_invitations?.find(
        (invitation) => invitation.role === 'CO_SUPERVISOR'
    );

    useEffect(() => {
        if (!canWrite) return;

        API.get('subject-areas/')
            .then(({ data }) => {
                setSubjectAreas(Array.isArray(data) ? data : []);
            })
            .catch((err) => {
                console.error('Unable to load subject areas:', err);
                setSubjectAreas([]);
            });
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
        setActionFeedback(null);

        const wordCount = countWords(abstract);
        if (wordCount < 150 || wordCount > 250) {
            setActionFeedback({
                type: 'error',
                message: `The abstract must be between 150 and 250 words (currently ${wordCount} word${wordCount === 1 ? '' : 's'}).`,
            });
            return;
        }

        setPublicationSaving(true);
        const formData = new FormData();
        formData.append('title', title);
        formData.append('abstract', abstract);
        formData.append('pub_type', pubType);
        formData.append('subject_area', subject);
        selectedAuthors.forEach((author) => formData.append('authors', author.id));
        if (file) formData.append('file_attachment', file);

        try {
            let response;
            if (editingId) {
                response = await API.put(`publications/${editingId}/`, formData);
            } else {
                response = await API.post('publications/', formData);
            }
           const reviewerAssignment = response.data.supervisor_name
                ? ` Assigned to: ${response.data.supervisor_name}.`
                : '';

            setActionFeedback({
                type: 'success',
                message: `${editingId ? 'Publication changes saved successfully and resubmitted for review.' : 'Publication submitted successfully and is pending review.'}${reviewerAssignment}${response.data.notification_warning ? ` ${response.data.notification_warning}` : ''}`,
            });
            if (editingId) {
                setPublicationHistory((current) => {
                    const next = { ...current };
                    delete next[editingId];
                    return next;
                });
            }
            clearForm();
            setShowSubmissionForm(false);
            await refreshPublications();
        } catch (err) {
            console.error('Unable to save publication:', {
                status: err.response?.status,
                response: err.response?.data,
                error: err.message,
            });
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

    const publicationActions = (publication) => {
        if (!publication.file_attachment) return null;
        return (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button type="button" onClick={() => viewPublication(publication)} title={`View ${publication.title}`} aria-label={`View ${publication.title}`} style={highlightIconButtonStyle}>
                    <Eye size={16} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => downloadPublication(publication)} disabled={downloadingPublicationId === publication.id} title={`Download ${publication.title}`} aria-label={`Download ${publication.title}`} style={{ ...highlightIconButtonStyle, cursor: downloadingPublicationId === publication.id ? 'wait' : 'pointer' }}>
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
                    
                    <form onSubmit={(event) => event.preventDefault()} style={{ display: 'grid', gap: '14px', marginBottom: '24px', padding: '16px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                            <h2 style={{ margin: 0, color: '#1e293b', fontSize: '1.1rem' }}>Repository publications</h2>
                            {canWrite && (
                                <button type="button" onClick={() => setShowSubmissionForm(true)} style={submissionButtonStyle}>
                                    <Plus size={17} aria-hidden="true" /> Submit research
                                </button>
                            )}
                        </div>
                        {user && profileActivity && (
                            <section aria-label="Your repository activity" style={{ display: 'grid', gap: '8px' }}>
                                <h3 style={{ margin: 0, color: '#64748b', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Your repository activity</h3>
                                <div style={{ display: 'flex', gap: '9px', overflowX: 'auto', paddingBottom: '2px' }}>
                                    {[
                                        { label: 'Uploaded', value: profileActivity.uploaded_materials, icon: <BookOpenCheck size={17} />, filter: 'ALL' },
                                        { label: 'Approved', value: profileActivity.approved_materials, icon: <BarChart3 size={17} />, filter: 'APPROVED' },
                                        { label: 'Pending review', value: profileActivity.pending_review_materials, icon: <Clock3 size={17} />, filter: 'PENDING' },
                                        { label: 'Feedback', value: profileActivity.feedback_materials, icon: <MessageSquareText size={17} />, filter: 'REVISION_REQUESTED' },
                                        { label: 'Rejected', value: profileActivity.rejected_materials, icon: <CircleX size={17} />, filter: 'REVIEWER_DECLINED' },
                                        { label: 'Downloads', value: profileActivity.total_downloads, icon: <Download size={17} /> },
                                        { label: 'Delete requests', value: profileActivity.pending_deletion_requests, icon: <X size={17} /> },
                                    ].map(({ label, value, icon, filter }) => {
                                        const content = <>
                                            <span style={{ display: 'grid', placeItems: 'center', color: '#0369a1' }}>{icon}</span>
                                            <span style={{ display: 'grid', gap: '2px' }}>
                                                <strong style={{ color: '#1e293b', fontSize: '.92rem', lineHeight: 1.1 }}>{value ?? 0}</strong>
                                                <span style={{ color: '#64748b', fontSize: '.7rem', whiteSpace: 'nowrap' }}>{label}</span>
                                            </span>
                                        </>;
                                        const selected = filter === 'ALL'
                                            ? !activityStatusFilter
                                            : filter === activityStatusFilter;
                                        const tileStyle = {
                                            minWidth: '140px',
                                            flex: '1 0 0',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '9px',
                                            padding: '10px 12px',
                                            border: `1px solid ${filter && selected ? '#0284c7' : '#e2e8f0'}`,
                                            borderRadius: '6px',
                                            background: filter && selected ? '#eff6ff' : '#f8fafc',
                                            boxSizing: 'border-box',
                                            textAlign: 'left',
                                            font: 'inherit',
                                        };
                                        return filter ? (
                                            <button
                                                key={label}
                                                type="button"
                                                onClick={() => filterByActivity(filter)}
                                                aria-pressed={selected}
                                                title={`Show ${label.toLowerCase()} publications`}
                                                style={{ ...tileStyle, cursor: 'pointer' }}
                                            >
                                                {content}
                                            </button>
                                        ) : (
                                            <div key={label} style={tileStyle}>{content}</div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}
                        <label htmlFor="publication-search" style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#334155', fontSize: '.88rem', fontWeight: 700 }}>
                            <Search size={16} aria-hidden="true" /> Search the repository
                        </label>
                        <input
                            id="publication-search"
                            type="search"
                            placeholder="Enter title, abstract, author, or subject keywords"
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPublicationsLoading(true);
                                setPublicationsError('');
                            }}
                            style={{ width: '100%', padding: '12px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '1rem', color: '#1e293b', boxSizing: 'border-box' }}
                        />
                        <button
                            type="button"
                            aria-expanded={showAllFilters}
                            aria-controls="repository-search-filters"
                            onClick={() => setShowAllFilters((expanded) => !expanded)}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, justifySelf: 'start', padding: '8px 11px', border: '1px solid #cbd5e1', borderRadius: 5, background: '#f8fafc', color: '#334155', cursor: 'pointer', font: 'inherit', fontSize: '.82rem', fontWeight: 600 }}
                        >
                            <SlidersHorizontal size={15} aria-hidden="true" />
                            {showAllFilters ? 'Hide filters' : 'Show all filters'}
                        </button>
                        {showAllFilters && <div id="repository-search-filters" style={{ display: 'grid', gap: 14 }}>
                        <fieldset style={{ display: 'grid', gap: '9px', margin: 0, padding: 0, border: 0 }}>
                            <legend style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, color: '#334155', fontSize: '.83rem', fontWeight: 700 }}>
                                <SlidersHorizontal size={15} aria-hidden="true" /> Search within
                            </legend>
                            <div style={filterOptionsStyle}>
                                {[
                                    ['title', 'Title'],
                                    ['abstract', 'Abstract'],
                                    ['author', 'Authors'],
                                    ['subject_area', 'Subject area'],
                                ].map(([field, label]) => (
                                    <label key={field} style={filterLabelStyle}>
                                        <input
                                            type="checkbox"
                                            checked={searchFields.includes(field)}
                                            onChange={() => {
                                                toggleValue(field, setSearchFields);
                                                setPublicationsLoading(true);
                                                setPublicationsError('');
                                            }}
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                            <span style={{ color: '#64748b', fontSize: '.77rem' }}>Choose where the search phrase should match. These can be combined.</span>
                        </fieldset>
                        <fieldset style={{ display: 'grid', gap: '9px', margin: 0, padding: 0, border: 0 }}>
                            <legend style={{ marginBottom: 8, color: '#334155', fontSize: '.83rem', fontWeight: 700 }}>Publication type</legend>
                            <div style={filterOptionsStyle}>
                                {[
                                    ['JOURNAL', 'Journal article'],
                                    ['CONFERENCE', 'Conference paper'],
                                    ['THESIS', 'Thesis'],
                                    ['DISSERTATION', 'Dissertation'],
                                ].map(([value, label]) => (
                                    <label key={value} style={filterLabelStyle}>
                                        <input
                                            type="checkbox"
                                            checked={publicationTypes.includes(value)}
                                            onChange={() => {
                                                toggleValue(value, setPublicationTypes);
                                                setPublicationsLoading(true);
                                                setPublicationsError('');
                                            }}
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                            <label htmlFor="author-filter" style={filterInputLabelStyle}>
                                Filter by author
                                <input
                                    id="author-filter"
                                    type="search"
                                    value={authorFilter}
                                    placeholder="Author first or last name"
                                    onChange={(event) => {
                                        setAuthorFilter(event.target.value);
                                        setPublicationsLoading(true);
                                        setPublicationsError('');
                                    }}
                                    style={filterInputStyle}
                                />
                            </label>
                            <label htmlFor="subject-filter" style={filterInputLabelStyle}>
                                Filter by subject area
                                <input
                                    id="subject-filter"
                                    type="search"
                                    value={subjectFilter}
                                    placeholder="e.g. Computer Science"
                                    onChange={(event) => {
                                        setSubjectFilter(event.target.value);
                                        setPublicationsLoading(true);
                                        setPublicationsError('');
                                    }}
                                    style={filterInputStyle}
                                />
                            </label>
                        <label htmlFor="date-from-filter" style={filterInputLabelStyle}>
                            Published from
                            <input
                                id="date-from-filter"
                                type="date"
                                value={dateFrom}
                                onChange={(event) => {
                                    setDateFrom(event.target.value);
                                    setDatePreset('');
                                    setPublicationsLoading(true);
                                    setPublicationsError('');
                                }}
                                style={filterInputStyle}
                            />
                        </label>
                        <label htmlFor="date-to-filter" style={filterInputLabelStyle}>
                            Published to
                            <input
                                id="date-to-filter"
                                type="date"
                                value={dateTo}
                                onChange={(event) => {
                                    setDateTo(event.target.value);
                                    setDatePreset('');
                                    setPublicationsLoading(true);
                                    setPublicationsError('');
                                }}
                                style={filterInputStyle}
                            />
                        </label>
                        <label htmlFor="month-filter" style={filterInputLabelStyle}>
                            Month
                            <select
                                id="month-filter"
                                value={monthFilter}
                                onChange={(event) => {
                                    setMonthFilter(event.target.value);
                                    setPublicationsLoading(true);
                                    setPublicationsError('');
                                }}
                                style={filterInputStyle}
                            >
                                <option value="">All months</option>
                                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, index) => (
                                    <option key={month} value={index + 1}>{month}</option>
                                ))}
                            </select>
                        </label>
                        <label htmlFor="date-preset-filter" style={filterInputLabelStyle}>
                            Quick range
                            <select
                                id="date-preset-filter"
                                value={datePreset}
                                onChange={(event) => applyDatePreset(event.target.value)}
                                style={filterInputStyle}
                            >
                                <option value="">Custom / all dates</option>
                                <option value="this_year">This year</option>
                                <option value="last_three_years">Last 3 years</option>
                            </select>
                        </label>
                        </div>
                        {(search || authorFilter || subjectFilter || dateFrom || dateTo || monthFilter || publicationTypes.length > 0 || searchFields.length !== 4) && (
                            <button type="button" onClick={() => {
                                setSearch('');
                                setSearchFields(['title', 'abstract', 'author', 'subject_area']);
                                setPublicationTypes([]);
                                setAuthorFilter('');
                                setSubjectFilter('');
                                setDateFrom('');
                                setDateTo('');
                                setMonthFilter('');
                                setDatePreset('');
                                setPublicationsLoading(true);
                                setPublicationsError('');
                            }} style={{ justifySelf: 'start', padding: 0, border: 0, background: 'transparent', color: '#0369a1', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontSize: '.82rem' }}>
                                Clear all search filters
                            </button>
                        )}
                        </div>}
                    </form>
                    <section aria-label="Latest repository highlights" style={{ marginBottom: '28px' }}>
                        <h2 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <Flame size={16} color="#f97316" aria-hidden="true" /> Latest Repository Highlights
                        </h2>
                        {highlightsError && <p role="alert" style={{ color: '#b91c1c', fontSize: '.85rem' }}>{highlightsError}</p>}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                            {latestHighlights.map((highlight) => (
                                <article key={`highlight-${highlight.id}`} style={{ background: 'linear-gradient(135deg, #1e293b, #334155)', color: '#f8fafc', padding: '16px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '0.7rem', background: '#38bdf8', color: '#1e293b', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{highlight.pub_type}</span>
                                        {publicationActions(highlight)}
                                    </div>
                                    <h3 style={{ margin: '8px 0 4px', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{highlight.title}</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Field: {highlight.subject_area}</p>
                                </article>
                            ))}
                            {highlightsLoading && (
                                <p role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, margin: 0, color: '#64748b', fontSize: '.85rem' }}>
                                    <LoaderCircle size={15} className="publication-spinner" aria-hidden="true" /> Loading highlights…
                                </p>
                            )}
                            {!highlightsLoading && !highlightsError && latestHighlights.length === 0 && (
                                <p style={{ margin: 0, color: '#64748b', fontSize: '.85rem' }}>No publications are available to highlight.</p>
                            )}
                        </div>
                    </section>
                    <p role="status" aria-live="polite" style={{ margin: '-12px 0 16px', color: '#64748b', fontSize: '0.85rem' }}>
                        {publicationsLoading
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}><LoaderCircle size={15} className="publication-spinner" aria-hidden="true" /> Loading publications…</span>
                            : publicationsError
                                ? publicationsError
                                : activityStatusFilter
                                    ? `Showing ${visiblePublications.length} ${activityStatusLabels[activityStatusFilter]} publication${visiblePublications.length === 1 ? '' : 's'}.`
                                    : user && !hasSearchFilters
                                    ? `Showing your ${publications.length} personal publication${publications.length === 1 ? '' : 's'}. Search or apply a filter to browse the repository.`
                                        : `Showing ${visiblePublications.length} result${visiblePublications.length === 1 ? '' : 's'}${search.trim() ? ` for “${search.trim()}”` : ''}.`}
                    </p>
    
            {actionFeedback && (
                        <p role={actionFeedback.type === 'error' ? 'alert' : 'status'} style={feedbackStyle(actionFeedback.type)}>
                            {actionFeedback.message}
                        </p>
                    )}
                    {/* Timeline Loop */}
                    <div id="publication-results" style={{ display: 'flex', flexDirection: 'column', gap: '16px', scrollMarginTop: '16px' }}>
                        {!publicationsLoading && !publicationsError && visiblePublications.length === 0 && (
                            <p style={{ margin: 0, padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', textAlign: 'center' }}>
                                {activityStatusFilter
                                    ? `There are no ${activityStatusLabels[activityStatusFilter]} publications in your repository.`
                                    : hasSearchFilters
                                    ? 'No publications match these search filters. Try changing or clearing your filters.'
                                    : user
                                        ? 'Your personal repository is empty. Search or apply a filter to browse available repository publications.'
                                        : 'No publications are available yet.'}
                            </p>
                        )}
                        {visiblePublications.map(pub => (
                            <article id={`publication-${pub.id}`} key={pub.id} style={{
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
                                                REVIEWER_DECLINED: 'Predefined reviewer declined — contact administrator',
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        {pub.updated_at && (
                                            <time
                                                dateTime={pub.updated_at}
                                                title={`Last updated: ${new Date(pub.updated_at).toLocaleString()}`}
                                                style={{ fontSize: '0.78rem', color: '#94a3b8' }}
                                            >
                                                Updated {pub.updated_at && formatRelativeDate(pub.updated_at)}
                                            </time>
                                        )}
                                    {pub.is_owner && (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    type="button"
                                                    title="View publication change history"
                                                    aria-label={`View change history for ${pub.title}`}
                                                    aria-expanded={expandedHistoryId === pub.id}
                                                    onClick={() => togglePublicationHistory(pub.id)}
                                                    style={iconButtonStyle}
                                                >
                                                    <History size={17} aria-hidden="true" />
                                                </button>
                                                {!pub.is_approved && pub.review_status !== 'APPROVED' && (
                                                    <>
                                                        <button title="Edit publication" aria-label="Edit publication" onClick={() => startEditing(pub)} style={iconButtonStyle}><Pencil size={17} aria-hidden="true" /></button>
                                                        <button type="button" title="Request publication deletion" aria-label="Request publication deletion" disabled={pendingAction === `delete-${pub.id}`} onClick={() => handleDeletionRequest(pub)} style={{ ...iconButtonStyle, color: '#b91c1c', cursor: pendingAction === `delete-${pub.id}` ? 'wait' : 'pointer' }}>{pendingAction === `delete-${pub.id}` ? <LoaderCircle size={17} className="publication-spinner" aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}</button>
                                                    </>
                                                )}
                                            </div>
                                        {pub.review_invitations?.length > 0 && (
                                            <div style={{ marginTop: '10px', color: '#475569', fontSize: '0.82rem' }}>
                                                <strong>Reviewers:</strong>
                                                {pub.review_invitations.map((invitation) => (
                                                    <div key={invitation.id} style={{ marginTop: '4px' }}>
                                                        {invitation.reviewer_name} ({invitation.role === 'CO_SUPERVISOR' ? 'co-supervisor' : 'supervisor'}: {invitation.status.toLowerCase().replace('_', ' ')}{invitation.status === 'ACCEPTED' ? `, ${invitation.decision.toLowerCase().replace('_', ' ')}` : ''})
                                                       
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        </div>
                                    )}
                                    </div> 
                                </div>
                                {pub.is_owner && expandedHistoryId === pub.id && (
                                    <section aria-label={`Change history for ${pub.title}`} style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 10px', color: '#334155', fontSize: '.9rem' }}>Change history</h4>
                                        {historyLoadingId === pub.id ? (
                                            <p role="status" style={{ margin: 0, color: '#64748b', fontSize: '.84rem' }}>Loading history…</p>
                                        ) : historyError ? (
                                            <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '.84rem' }}>{historyError}</p>
                                        ) : publicationHistory[pub.id]?.length ? (
                                            <ol style={{ display: 'grid', gap: '8px', margin: 0, paddingLeft: '22px' }}>
                                                {publicationHistory[pub.id].map((version) => (
                                                    <li key={version.id} style={{ color: '#475569', fontSize: '.84rem' }}>
                                                        <details>
                                                            <summary style={{ cursor: 'pointer', color: '#334155', fontWeight: 600 }}>
                                                                Version {version.version_number} · archived {new Date(version.created_at).toLocaleString()} by {version.changed_by}
                                                            </summary>
                                                            <div style={{ marginTop: '8px', padding: '10px 12px', background: '#f8fafc', borderRadius: '5px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                                                                <p style={{ margin: '0 0 5px' }}><strong>Title:</strong> {version.snapshot.title}</p>
                                                                <p style={{ margin: '0 0 5px' }}><strong>Type:</strong> {version.snapshot.pub_type} · <strong>Subject:</strong> {version.snapshot.subject_area}</p>
                                                                <p style={{ margin: '0 0 5px' }}><strong>Authors:</strong> {version.snapshot.authors.map((author) => author.name).join('; ') || 'None listed'}</p>
                                                                <p style={{ margin: '0 0 5px' }}><strong>Reviewers:</strong> {version.snapshot.reviewers.map((reviewer) => `${reviewer.name} (${reviewer.role})`).join('; ') || 'None assigned'}</p>
                                                                <p style={{ margin: '0 0 5px', whiteSpace: 'pre-wrap' }}><strong>Abstract:</strong> {version.snapshot.abstract}</p>
                                                                {version.snapshot.file_attachment_url && (
                                                                    <a href={version.snapshot.file_attachment_url} target="_blank" rel="noreferrer" style={{ color: '#0369a1' }}>View previous manuscript</a>
                                                                )}
                                                            </div>
                                                        </details>
                                                    </li>
                                                ))}
                                            </ol>
                                        ) : (
                                            <p style={{ margin: 0, color: '#64748b', fontSize: '.84rem' }}>No previous versions have been recorded yet. Future edits will appear here.</p>
                                        )}
                                    </section>
                                )}
                                {pub.is_owner && pub.review_feedback && (
                                    <div role="note" style={{ marginTop: '12px', padding: '11px 13px', borderLeft: '3px solid #c2410c', background: '#fff7ed', color: '#7c2d12', fontSize: '0.84rem', lineHeight: 1.5 }}>
                                        <strong>Supervisor feedback:</strong> {pub.review_feedback}
                                    </div>
                                )}
                            </article>
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
                        {actionFeedback && (
                            <p role={actionFeedback.type === 'error' ? 'alert' : 'status'} style={feedbackStyle(actionFeedback.type)}>
                                {actionFeedback.message}
                            </p>
                        )}
             
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
                            <label htmlFor="publication-subject" style={labelStyle}>
                                Subject Area (required)
                            </label>

                            <select
                                id="publication-subject"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                required
                                style={formInputStyle}
                            >
                                <option value="">Select a subject area</option>

                                {subjectAreas.map((area) => (
                                    <option key={area.value} value={area.value}>
                                        {area.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <p
                                role="status"
                                style={{
                                    margin: 0,
                                    padding: '10px 12px',
                                    border: '1px solid #bae6fd',
                                    borderRadius: 6,
                                    background: '#f0f9ff',
                                    color: '#075985',
                                    fontSize: '.85rem',
                                }}
                            >
                                {editingId
                                    ? 'Your publication reviewer is predefined by the university and cannot be changed manually.'
                                    : 'Your publication will automatically be assigned to the lecturer predefined in your university record when you submit it.'}
                            </p>
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                                <label htmlFor="publication-abstract" style={{ ...labelStyle, marginBottom: 0 }}>Abstract Description (required)</label>
                                <span
                                    style={{
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: abstractWordCount === 0
                                            ? '#64748b'
                                            : isAbstractWordCountValid
                                                ? '#15803d'
                                                : '#b91c1c',
                                    }}
                                    aria-live="polite"
                                >
                                    {abstractWordCount} / 150–250 words
                                </span>
                            </div>
                            <textarea
                                id="publication-abstract"
                                value={abstract}
                                onChange={e => setAbstract(e.target.value)}
                                required
                                aria-describedby="abstract-helper-text"
                                placeholder="Enter publication abstract (must be between 150 and 250 words)..."
                                style={{
                                    ...formInputStyle,
                                    height: '110px',
                                    resize: 'vertical',
                                    borderColor: abstract.trim().length === 0
                                        ? '#cbd5e1'
                                        : isAbstractWordCountValid
                                            ? '#86efac'
                                            : '#fca5a5',
                                }}
                            ></textarea>
                            <div id="abstract-helper-text" style={{ marginTop: '4px', fontSize: '0.8rem' }}>
                                {abstractWordCount === 0 ? (
                                    <span style={{ color: '#64748b' }}>The abstract must be between 150 and 250 words.</span>
                                ) : abstractWordCount < 150 ? (
                                    <span style={{ color: '#b45309' }}>
                                        {150 - abstractWordCount} more word{150 - abstractWordCount === 1 ? '' : 's'} needed (minimum 150 words).
                                    </span>
                                ) : abstractWordCount <= 250 ? (
                                    <span style={{ color: '#15803d', fontWeight: 500 }}>
                                        ✓ Word count is valid ({abstractWordCount} words).
                                    </span>
                                ) : (
                                    <span style={{ color: '#b91c1c', fontWeight: 500 }}>
                                        Exceeds maximum limit by {abstractWordCount - 250} word{abstractWordCount - 250 === 1 ? '' : 's'} (maximum 250 words).
                                    </span>
                                )}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="publication-type" style={labelStyle}>Publication Type (required)</label>
                            <select id="publication-type" value={pubType} onChange={e => setPubType(e.target.value)} required style={formInputStyle}>
                                {user.role === 'STUDENT' ? (<><option value="THESIS">Thesis</option> <option value="DISSERTATION">Dissertation</option></>) :  (<><option value="JOURNAL">Journal</option> <option value="CONFERENCE">Conference Paper</option></>) }

                            </select>
                        </div>                                              
                        <div>
                            <label htmlFor="publication-file" style={labelStyle}>Manuscript (PDF, {editingId ? 'optional' : 'required'})</label>
                            <input id="publication-file" type="file" accept=".pdf,application/pdf" required={!editingId} onChange={e => setFile(e.target.files[0])} style={formInputStyle}/>
                            {editingId && editingPublication?.file_attachment && !file && (
                                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '.8rem' }}>The current manuscript will be kept unless you choose a replacement PDF.</p>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                type="submit"
                                disabled={publicationSaving || !isAbstractWordCountValid || (!editingId && !subject.trim())}
                                title={!isAbstractWordCountValid ? `Abstract must be between 150 and 250 words (currently ${abstractWordCount} words)` : ''}
                                style={{
                                    padding: '10px 16px',
                                    backgroundColor: (!isAbstractWordCountValid && !publicationSaving) ? '#94a3b8' : '#0284c7',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: publicationSaving ? 'wait' : !isAbstractWordCountValid ? 'not-allowed' : 'pointer',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '7px',
                                }}
                            >
                                {publicationSaving && <LoaderCircle size={16} className="publication-spinner" aria-hidden="true" />}
                                {publicationSaving ? 'Saving…' : editingId ? 'Update Publication' : 'Submit Publication'}
                            </button>
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
 const countWords = (text) => {
     if (!text || !text.trim()) return 0;
     return text.trim().split(/\s+/).filter(Boolean).length;
 };

 const formatRelativeDate = (dateString) => {
     const now = new Date();
     const date = new Date(dateString);
     const seconds = Math.floor((now - date) / 1000);
     if (seconds < 60) return 'just now';
     const minutes = Math.floor(seconds / 60);
     if (minutes < 60) return `${minutes}m ago`;
     const hours = Math.floor(minutes / 60);
     if (hours < 24) return `${hours}h ago`;
     const days = Math.floor(hours / 24);
     if (days < 30) return `${days}d ago`;
     const months = Math.floor(days / 30);
     if (months < 12) return `${months}mo ago`;
     return `${Math.floor(months / 12)}y ago`;
 };

 const formInputStyle = { width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '0.9rem', color: '#1e293b', boxSizing: 'border-box' };
 const filterInputStyle = { width: '100%', marginTop: '5px', padding: '9px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '.86rem', color: '#1e293b', boxSizing: 'border-box' };
 const filterInputLabelStyle = { display: 'block', color: '#475569', fontSize: '.8rem', fontWeight: 600 };
 const filterOptionsStyle = { display: 'flex', flexWrap: 'wrap', gap: '8px 16px' };
 const filterLabelStyle = { display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#334155', fontSize: '.83rem', cursor: 'pointer' };
 const highlightIconButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '7px', border: '1px solid rgba(255, 255, 255, 0.35)', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.12)', color: '#f8fafc', cursor: 'pointer' };
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