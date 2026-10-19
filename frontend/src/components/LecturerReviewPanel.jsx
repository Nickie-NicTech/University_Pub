import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Download, Eye, FileText, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import API from '../api';

export default function LecturerReviewPanel({ user }) {
    const [publications, setPublications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [pendingAction, setPendingAction] = useState('');
    const [revisionPublicationId, setRevisionPublicationId] = useState(null);
    const [revisionFeedback, setRevisionFeedback] = useState('');
    const [previewUrls, setPreviewUrls] = useState({});
    const [previewLoadingId, setPreviewLoadingId] = useState(null);
    const objectUrls = useRef(new Set());
    const navigate = useNavigate();

    const loadAssignments = useCallback(async (showLoader = true) => {
        if (showLoader) setLoading(true);
        try {
            const { data } = await API.get('publications/');
            if (!Array.isArray(data)) throw new Error('The review assignment response was not a list.');
            setPublications(data.filter((publication) => publication.review_invitation_status));
            setError('');
        } catch (requestError) {
            console.error('Unable to load lecturer review assignments:', requestError);
            setError(requestError.response?.data?.detail || requestError.message || 'Unable to load review assignments.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let isCurrentRequest = true;
        const urls = objectUrls.current;
        API.get('publications/')
            .then(({ data }) => {
                if (!isCurrentRequest) return;
                if (!Array.isArray(data)) throw new Error('The review assignment response was not a list.');
                setPublications(data.filter((publication) => publication.review_invitation_status));
            })
            .catch((requestError) => {
                if (!isCurrentRequest) return;
                console.error('Unable to load lecturer review assignments:', requestError);
                setError(requestError.response?.data?.detail || requestError.message || 'Unable to load review assignments.');
            })
            .finally(() => {
                if (isCurrentRequest) setLoading(false);
            });
        return () => {
            isCurrentRequest = false;
            urls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, []);

    const invitees = publications.filter((publication) => publication.review_invitation_status === 'INVITED');
    const acceptedReviews = publications.filter((publication) => (
        publication.review_invitation_status === 'ACCEPTED'
        && publication.my_review_decision === 'PENDING'
    ));
    const completedReviews = publications.filter((publication) => (
        publication.review_invitation_status === 'DECLINED'
        || (publication.review_invitation_status === 'ACCEPTED' && publication.my_review_decision !== 'PENDING')
    ));
    const actionableCount = invitees.length + acceptedReviews.filter((publication) => publication.review_status === 'PENDING').length;

    const respondToInvitation = async (publication, decision) => {
        const actionKey = `${decision}-${publication.id}`;
        setPendingAction(actionKey);
        setFeedback(null);
        try {
            const { data } = await API.post(`publications/${publication.id}/review-invitation/`, { decision });
            setFeedback({
                type: 'success',
                message: `Invitation ${decision.toLowerCase()} for “${publication.title}”.${data.notification_warning ? ` ${data.notification_warning}` : ''}`,
            });
            await loadAssignments(false);
        } catch (requestError) {
            console.error('Unable to respond to publication review invitation:', requestError);
            setFeedback({ type: 'error', message: getErrorMessage(requestError, 'Unable to respond to this review invitation.') });
        } finally {
            setPendingAction('');
        }
    };

    const submitReview = async (publication, decision, feedbackText = '') => {
        const actionKey = `${decision}-${publication.id}`;
        setPendingAction(actionKey);
        setFeedback(null);
        try {
            const { data } = await API.post(`publications/${publication.id}/review-decision/`, {
                decision,
                feedback: feedbackText,
            });
            setRevisionPublicationId(null);
            setRevisionFeedback('');
            setFeedback({
                type: 'success',
                message: decision === 'APPROVED'
                    ? `${data.is_approved ? 'All accepting reviewers approved this publication.' : 'Your approval was recorded; it is waiting for other reviewers.'}${data.notification_warning ? ` ${data.notification_warning}` : ''}`
                    : `Revision feedback sent to the submitter.${data.notification_warning ? ` ${data.notification_warning}` : ''}`,
            });
            await loadAssignments(false);
        } catch (requestError) {
            console.error('Unable to submit publication review:', requestError);
            setFeedback({ type: 'error', message: getErrorMessage(requestError, 'Unable to submit this review.') });
        } finally {
            setPendingAction('');
        }
    };

    const togglePreview = async (publication) => {
        if (previewUrls[publication.id]) {
            setPreviewUrls((current) => {
                const next = { ...current };
                objectUrls.current.delete(next[publication.id]);
                URL.revokeObjectURL(next[publication.id]);
                delete next[publication.id];
                return next;
            });
            return;
        }
        setPreviewLoadingId(publication.id);
        try {
            const { data } = await API.get(`publications/${publication.id}/view/`, { responseType: 'blob' });
            const url = URL.createObjectURL(data);
            objectUrls.current.add(url);
            setPreviewUrls((current) => ({ ...current, [publication.id]: url }));
        } catch (requestError) {
            console.error('Unable to open submitted manuscript:', requestError);
            setFeedback({ type: 'error', message: getErrorMessage(requestError, 'Unable to open this manuscript.') });
        } finally {
            setPreviewLoadingId(null);
        }
    };

    const downloadManuscript = async (publication) => {
        setPendingAction(`download-${publication.id}`);
        try {
            const { data } = await API.get(`publications/${publication.id}/download/`, { responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const link = document.createElement('a');
            link.href = url;
            link.download = (publication.file_attachment || `${publication.title}.pdf`).split('/').pop();
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (requestError) {
            console.error('Unable to download submitted manuscript:', requestError);
            setFeedback({ type: 'error', message: getErrorMessage(requestError, 'Unable to download this manuscript.') });
        } finally {
            setPendingAction('');
        }
    };

    if (user?.role !== 'LECTURER') {
        return <section style={pageStyle}><h1>Lecturer review desk</h1><p>This workspace is only available to lecturer accounts.</p></section>;
    }

    return (
        <section style={pageStyle}>
            <header style={headerStyle}>
                <div>
                    <button type="button" onClick={() => navigate('/')} style={backButtonStyle}><ArrowLeft size={16} /> Repository</button>
                    <p style={eyebrowStyle}>LECTURER WORKSPACE</p>
                    <h1 style={titleStyle}>Publication review desk</h1>
                    <p style={subtitleStyle}>Review manuscript invitations assigned to you as supervisor or co-supervisor.</p>
                </div>
                <div style={counterStyle}><strong>{actionableCount}</strong><span>open review tasks</span></div>
            </header>

            {feedback && <p role={feedback.type === 'error' ? 'alert' : 'status'} style={{ ...messageStyle, color: feedback.type === 'error' ? '#b91c1c' : '#166534', background: feedback.type === 'error' ? '#fef2f2' : '#f0fdf4' }}>{feedback.message}</p>}
            {error && <p role="alert" style={{ ...messageStyle, color: '#b91c1c', background: '#fef2f2' }}>{error} <button type="button" onClick={() => loadAssignments()} style={textButtonStyle}>Try again</button></p>}
            {loading && <p role="status" style={loadingStyle}><LoaderCircle className="publication-spinner" size={18} /> Loading review requests…</p>}

            {!loading && !error && publications.length === 0 && (
                <div style={emptyStyle}>
                    <FileText size={28} color="#94a3b8" />
                    <h2 style={{ margin: '10px 0 5px', fontSize: '1rem' }}>Review desk unavailable</h2>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '.9rem' }}>No publication review request has been opened for your account. This panel becomes active when a researcher invites you to review a submission.</p>
                    <button type="button" disabled style={{ ...disabledButtonStyle, marginTop: '14px' }}>No open review request</button>
                </div>
            )}

            {!loading && !error && publications.length > 0 && (
                <>
                    <div style={noticeStyle}>
                        <ShieldCheck size={18} />
                        {actionableCount === 0
                            ? 'There are no review tasks waiting for your action. Completed requests remain available below.'
                            : `${actionableCount} request${actionableCount === 1 ? '' : 's'} need${actionableCount === 1 ? 's' : ''} your attention.`}
                    </div>
                    {invitees.length > 0 && (
                        <ReviewSection title="Invitations" description="Open the manuscript, then accept or decline each request." count={invitees.length}>
                            {invitees.map((publication) => (
                                <ReviewCard key={publication.id} publication={publication} currentReviewerId={user.user_id} previewUrl={previewUrls[publication.id]} previewLoading={previewLoadingId === publication.id} pendingAction={pendingAction} onPreview={togglePreview} onDownload={downloadManuscript}>
                                    <button type="button" disabled={Boolean(pendingAction)} onClick={() => respondToInvitation(publication, 'ACCEPTED')} style={actionButtonStyle('#15803d')}><Check size={16} /> Accept review</button>
                                    <button type="button" disabled={Boolean(pendingAction)} onClick={() => respondToInvitation(publication, 'DECLINED')} style={actionButtonStyle('#b91c1c')}><X size={16} /> Decline</button>
                                </ReviewCard>
                            ))}
                        </ReviewSection>
                    )}
                    {acceptedReviews.length > 0 && (
                        <ReviewSection title="Accepted reviews" description="Your review controls are available once all invited reviewers have responded." count={acceptedReviews.length}>
                            {acceptedReviews.map((publication) => {
                                const ready = publication.review_status === 'PENDING';
                                return (
                                    <ReviewCard key={publication.id} publication={publication} currentReviewerId={user.user_id} previewUrl={previewUrls[publication.id]} previewLoading={previewLoadingId === publication.id} pendingAction={pendingAction} onPreview={togglePreview} onDownload={downloadManuscript}>
                                        {ready ? (
                                            <>
                                                <button type="button" disabled={Boolean(pendingAction)} onClick={() => submitReview(publication, 'APPROVED')} style={actionButtonStyle('#15803d')}><Check size={16} /> Approve</button>
                                                <button type="button" disabled={Boolean(pendingAction)} onClick={() => { setRevisionPublicationId(publication.id); setRevisionFeedback(''); }} style={actionButtonStyle('#b45309')}>Request revisions</button>
                                            </>
                                        ) : (
                                            <button type="button" disabled style={disabledButtonStyle}>
                                                {publication.review_status === 'REVISION_REQUESTED' ? 'Waiting for revised submission' : 'Waiting for other invitees'}
                                            </button>
                                        )}
                                        {revisionPublicationId === publication.id && (
                                            <form onSubmit={(event) => { event.preventDefault(); void submitReview(publication, 'REVISION_REQUESTED', revisionFeedback); }} style={feedbackFormStyle}>
                                                <label htmlFor={`revision-feedback-${publication.id}`} style={labelStyle}>Feedback and requested revisions (required)</label>
                                                <textarea id={`revision-feedback-${publication.id}`} value={revisionFeedback} minLength={5} required rows={4} onChange={(event) => setRevisionFeedback(event.target.value)} style={textareaStyle} />
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                                    <button type="button" onClick={() => setRevisionPublicationId(null)} style={cancelButtonStyle}>Cancel</button>
                                                    <button type="submit" disabled={revisionFeedback.trim().length < 5 || Boolean(pendingAction)} style={actionButtonStyle('#b45309')}>
                                                        {pendingAction === `REVISION_REQUESTED-${publication.id}` && <LoaderCircle className="publication-spinner" size={15} />}
                                                        Send feedback
                                                    </button>
                                                </div>
                                            </form>
                                        )}
                                    </ReviewCard>
                                );
                            })}
                        </ReviewSection>
                    )}
                    {completedReviews.length > 0 && (
                        <ReviewSection title="Processed requests" description="Requests you have already answered or reviewed." count={completedReviews.length}>
                            {completedReviews.map((publication) => (
                                <ReviewCard key={publication.id} publication={publication} currentReviewerId={user.user_id} previewUrl={previewUrls[publication.id]} previewLoading={previewLoadingId === publication.id} pendingAction={pendingAction} onPreview={togglePreview} onDownload={downloadManuscript}>
                                    <button type="button" disabled style={disabledButtonStyle}>{reviewStatusLabel(publication)}</button>
                                </ReviewCard>
                            ))}
                        </ReviewSection>
                    )}
                </>
            )}
        </section>
    );
}

function ReviewSection({ title, description, count, children }) {
    return <section style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10 }}>
            <h2 style={{ margin: 0, color: '#1e293b', fontSize: '1rem' }}>{title}</h2>
            <span style={countStyle}>{count}</span>
            <span style={{ color: '#64748b', fontSize: '.82rem' }}>{description}</span>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>{children}</div>
    </section>;
}

function ReviewCard({ publication, currentReviewerId, previewUrl, previewLoading, pendingAction, onPreview, onDownload, children }) {
    const myInvitation = publication.review_invitations?.find((invitation) => invitation.reviewer === currentReviewerId);
    return <article style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <span style={eyebrowStyle}>{publication.pub_type} · {publication.subject_area}</span>
                <h3 style={{ margin: '6px 0', color: '#0f172a', fontSize: '1.05rem' }}>{publication.title}</h3>
                <p style={{ margin: 0, color: '#475569', fontSize: '.88rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{publication.abstract}</p>
                <p style={{ margin: '9px 0 0', color: '#64748b', fontSize: '.82rem' }}>
                    <strong>Authors:</strong> {publication.authors_details?.map((author) => author.name).join('; ') || 'Not specified'}
                    {' · '}<strong>Role:</strong> {myInvitation?.role === 'CO_SUPERVISOR' ? 'Co-supervisor' : 'Supervisor'}
                </p>
                {myInvitation?.feedback && <p style={{ margin: '8px 0 0', color: '#7c2d12', fontSize: '.82rem', whiteSpace: 'pre-wrap' }}><strong>Your feedback:</strong> {myInvitation.feedback}</p>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" onClick={() => onPreview(publication)} disabled={previewLoading || !publication.file_attachment} style={actionButtonStyle('#0369a1')}>
                    {previewLoading ? <LoaderCircle className="publication-spinner" size={15} /> : <Eye size={15} />}
                    {previewUrl ? 'Hide document' : 'View document'}
                </button>
                <button type="button" onClick={() => onDownload(publication)} disabled={!publication.file_attachment || Boolean(pendingAction)} style={actionButtonStyle('#0369a1')}>
                    {pendingAction === `download-${publication.id}` ? <LoaderCircle className="publication-spinner" size={15} /> : <Download size={15} />}
                    Download
                </button>
                {children}
            </div>
        </div>
        {!publication.file_attachment && <p style={{ margin: '12px 0 0', color: '#92400e', fontSize: '.82rem' }}>No manuscript file was attached to this submission.</p>}
        {previewUrl && <iframe title={`Manuscript preview: ${publication.title}`} src={previewUrl} style={{ width: '100%', height: 'min(65vh, 640px)', marginTop: 14, border: '1px solid #cbd5e1', borderRadius: 6 }} />}
    </article>;
}

function reviewStatusLabel(publication) {
    if (publication.review_invitation_status === 'DECLINED') return 'Invitation declined';
    if (publication.review_status === 'APPROVED') return 'Publication approved';
    if (publication.review_status === 'REVISION_REQUESTED') return 'Revisions requested';
    if (publication.my_review_decision === 'APPROVED') return 'You approved';
    return 'Processed';
}

function getErrorMessage(error, fallback) {
    const data = error.response?.data;
    if (typeof data?.detail === 'string') return data.detail;
    if (data && typeof data === 'object') {
        return Object.entries(data)
            .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(' ') : messages}`)
            .join(' ');
    }
    return fallback;
}

const pageStyle = { height: '100%', width: '100%', boxSizing: 'border-box', overflowY: 'auto', padding: 'clamp(18px, 4vw, 42px)', background: '#f8fafc' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, maxWidth: 1150, margin: '0 auto 22px' };
const backButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 0, background: 'transparent', color: '#0369a1', cursor: 'pointer', font: 'inherit', fontSize: '.84rem' };
const eyebrowStyle = { margin: '8px 0 0', color: '#64748b', fontSize: '.7rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' };
const titleStyle = { margin: '5px 0', color: '#0f172a', fontSize: 'clamp(1.35rem, 3vw, 1.8rem)' };
const subtitleStyle = { margin: 0, color: '#64748b', fontSize: '.9rem' };
const counterStyle = { display: 'grid', justifyItems: 'center', minWidth: 110, padding: '12px 18px', border: '1px solid #bae6fd', borderRadius: 9, background: '#f0f9ff', color: '#075985' };
const noticeStyle = { display: 'flex', alignItems: 'center', gap: 9, maxWidth: 1150, margin: '0 auto', padding: '12px 14px', border: '1px solid #bae6fd', borderRadius: 7, background: '#f0f9ff', color: '#075985', fontSize: '.86rem' };
const emptyStyle = { display: 'grid', justifyItems: 'center', maxWidth: 550, margin: '10vh auto', padding: 28, textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: 10, background: '#fff' };
const loadingStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '18vh auto', color: '#475569' };
const messageStyle = { maxWidth: 1150, margin: '12px auto', padding: 12, borderRadius: 6, fontSize: '.88rem' };
const cardStyle = { maxWidth: 1150, margin: '0 auto', padding: 17, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const countStyle = { display: 'inline-grid', placeItems: 'center', minWidth: 22, height: 22, borderRadius: 999, background: '#e2e8f0', color: '#334155', fontSize: '.75rem', fontWeight: 700 };
const actionButtonStyle = (color) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 34, padding: '6px 10px', border: `1px solid ${color}`, borderRadius: 5, background: '#fff', color, cursor: 'pointer', font: 'inherit', fontSize: '.78rem', fontWeight: 600 });
const disabledButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 34, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 5, background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed', font: 'inherit', fontSize: '.78rem' };
const feedbackFormStyle = { display: 'grid', gap: 8, width: '100%', marginTop: 12, padding: 12, border: '1px solid #fed7aa', borderRadius: 6, background: '#fffaf5' };
const labelStyle = { color: '#7c2d12', fontSize: '.82rem', fontWeight: 700 };
const textareaStyle = { width: '100%', boxSizing: 'border-box', padding: 9, border: '1px solid #fdba74', borderRadius: 4, font: 'inherit', resize: 'vertical' };
const cancelButtonStyle = { minHeight: 34, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 5, background: '#fff', color: '#334155', cursor: 'pointer' };
const textButtonStyle = { marginLeft: 8, padding: 0, border: 0, background: 'transparent', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' };
