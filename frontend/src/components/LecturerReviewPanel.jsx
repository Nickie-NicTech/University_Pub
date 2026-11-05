import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, FileText, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import API from '../api';
import ReviewCard from './ReviewCard';
import { getErrorMessage, reviewStatusLabel } from './reviewUtils';
import {
    actionButtonStyle,
    backButtonStyle,
    cancelButtonStyle,
    countStyle,
    counterStyle,
    disabledButtonStyle,
    emptyStyle,
    eyebrowStyle,
    feedbackFormStyle,
    headerStyle,
    labelStyle,
    loadingStyle,
    messageStyle,
    noticeStyle,
    pageStyle,
    subtitleStyle,
    textareaStyle,
    textButtonStyle,
    titleStyle,
} from './reviewStyles';

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
    const [searchParams, setSearchParams] = useSearchParams();

    const isLecturer = user?.role === 'LECTURER';

    const loadAssignments = useCallback(async (showLoader = true) => {
        if (!isLecturer) {
            setLoading(false);
            return;
        }
        if (showLoader) setLoading(true);
        try {
            const { data } = await API.get('publications/?review_assignments=true');
            if (!Array.isArray(data)) throw new Error('The review assignment response was not a list.');
            setPublications(data.filter((publication) => publication.review_invitation_status));
            setError('');
        } catch (requestError) {
            console.error('Unable to load lecturer review assignments:', requestError);
            setError(requestError.response?.data?.detail || requestError.message || 'Unable to load review assignments.');
        } finally {
            setLoading(false);
        }
    }, [isLecturer]);

    // Initial load
    useEffect(() => {
        loadAssignments();
    }, [loadAssignments]);

    // Revoke any open blob URLs on unmount
    useEffect(() => {
        const urls = objectUrls.current;
        return () => urls.forEach((url) => URL.revokeObjectURL(url));
    }, []);

    // Scroll to a publication linked via ?publication=<id>
    useEffect(() => {
        const publicationId = searchParams.get('publication');
        if (!publicationId || loading) return;

        const publication = publications.find((item) => String(item.id) === publicationId);
        if (!publication) return;

        const card = document.getElementById(`publication-${publication.id}`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card?.focus({ preventScroll: true });

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('publication');
        setSearchParams(nextParams, { replace: true });
    }, [loading, publications, searchParams, setSearchParams]);

    const invitees = publications.filter((p) => p.review_invitation_status === 'INVITED');
    const acceptedReviews = publications.filter(
        (p) => p.review_invitation_status === 'ACCEPTED' && p.my_review_decision === 'PENDING'
    );
    const completedReviews = publications.filter(
        (p) =>
            p.review_invitation_status === 'DECLINED' ||
            (p.review_invitation_status === 'ACCEPTED' && p.my_review_decision !== 'PENDING')
    );
    const actionableCount =
        invitees.length + acceptedReviews.filter((p) => p.review_status === 'PENDING').length;

    const respondToInvitation = async (publication, decision) => {
        setPendingAction(`${decision}-${publication.id}`);
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
        setPendingAction(`${decision}-${publication.id}`);
        setFeedback(null);
        try {
            const { data } = await API.post(`publications/${publication.id}/review-decision/`, {
                decision,
                feedback: feedbackText,
            });
            setRevisionPublicationId(null);
            setRevisionFeedback('');
            const warning = data.notification_warning ? ` ${data.notification_warning}` : '';
            setFeedback({
                type: 'success',
                message:
                    decision === 'APPROVED'
                        ? `${data.is_approved ? 'All accepting reviewers approved this publication.' : 'Your approval was recorded; it is waiting for other reviewers.'}${warning}`
                        : `Revision feedback sent to the submitter.${warning}`,
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
        const existing = previewUrls[publication.id];
        if (existing) {
            objectUrls.current.delete(existing);
            URL.revokeObjectURL(existing);
            setPreviewUrls((current) => {
                const next = { ...current };
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
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (requestError) {
            console.error('Unable to download submitted manuscript:', requestError);
            setFeedback({ type: 'error', message: getErrorMessage(requestError, 'Unable to download this manuscript.') });
        } finally {
            setPendingAction('');
        }
    };

    const cardProps = (publication) => ({
        publication,
        currentReviewerId: user.user_id,
        previewUrl: previewUrls[publication.id],
        previewLoading: previewLoadingId === publication.id,
        pendingAction,
        onPreview: togglePreview,
        onDownload: downloadManuscript,
    });

    if (!isLecturer) {
        return (
            <section style={pageStyle}>
                <h1>Lecturer review desk</h1>
                <p>This workspace is only available to lecturer accounts.</p>
            </section>
        );
    }

    const linkedPublicationId = searchParams.get('publication');
    const linkedPublicationMissing =
        linkedPublicationId &&
        !publications.some((publication) => String(publication.id) === linkedPublicationId);

    return (
        <section style={pageStyle}>
            <header style={headerStyle}>
                <div>
                    <button type="button" onClick={() => navigate('/')} style={backButtonStyle}>
                        <ArrowLeft size={16} /> Repository
                    </button>
                    <p style={eyebrowStyle}>LECTURER WORKSPACE</p>
                    <h1 style={titleStyle}>Publication review desk</h1>
                    <p style={subtitleStyle}>Review manuscript invitations assigned to you as supervisor or co-supervisor.</p>
                </div>
                <div style={counterStyle}>
                    <strong>{actionableCount}</strong>
                    <span>open review tasks</span>
                </div>
            </header>

            {feedback && (
                <p
                    role={feedback.type === 'error' ? 'alert' : 'status'}
                    style={{
                        ...messageStyle,
                        color: feedback.type === 'error' ? '#b91c1c' : '#166534',
                        background: feedback.type === 'error' ? '#fef2f2' : '#f0fdf4',
                    }}
                >
                    {feedback.message}
                </p>
            )}

            {error && (
                <p role="alert" style={{ ...messageStyle, color: '#b91c1c', background: '#fef2f2' }}>
                    {error}{' '}
                    <button type="button" onClick={() => loadAssignments()} style={textButtonStyle}>
                        Try again
                    </button>
                </p>
            )}

            {loading && (
                <p role="status" style={loadingStyle}>
                    <LoaderCircle className="publication-spinner" size={18} /> Loading review requests…
                </p>
            )}

            {!loading && !error && publications.length === 0 && (
                <div style={emptyStyle}>
                    <FileText size={28} color="#94a3b8" />
                    <h2 style={{ margin: '10px 0 5px', fontSize: '1rem' }}>Review desk unavailable</h2>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '.9rem' }}>
                        No publication review request has been opened for your account. This panel becomes active when a researcher invites you to review a submission.
                    </p>
                    <button type="button" disabled style={{ ...disabledButtonStyle, marginTop: 14 }}>
                        No open review request
                    </button>
                </div>
            )}

            {!loading && !error && linkedPublicationMissing && (
                <p role="alert" style={{ ...messageStyle, color: '#b91c1c', background: '#fef2f2' }}>
                    This publication is no longer assigned to your review desk.
                </p>
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
                        <ReviewSection
                            title="Invitations"
                            description="Open the manuscript, then accept or decline each request."
                            count={invitees.length}
                        >
                            {invitees.map((publication) => (
                                <ReviewCard key={publication.id} {...cardProps(publication)}>
                                    <button
                                        type="button"
                                        disabled={Boolean(pendingAction)}
                                        onClick={() => respondToInvitation(publication, 'ACCEPTED')}
                                        style={actionButtonStyle('#15803d')}
                                    >
                                        <Check size={16} /> Accept review
                                    </button>
                                    {/* <button
                                        type="button"
                                        disabled={Boolean(pendingAction)}
                                        onClick={() => respondToInvitation(publication, 'DECLINED')}
                                        style={actionButtonStyle('#b91c1c')}
                                    >
                                        <X size={16} /> Decline
                                    </button> */}
                                </ReviewCard>
                            ))}
                        </ReviewSection>
                    )}

                    {acceptedReviews.length > 0 && (
                        <ReviewSection
                            title="Accepted reviews"
                            description="You can review immediately after accepting; publication decisions are finalized after all invited reviewers respond."
                            count={acceptedReviews.length}
                        >
                            {acceptedReviews.map((publication) => {
                                const ready = publication.review_status === 'PENDING';
                                return (
                                    <ReviewCard key={publication.id} {...cardProps(publication)}>
                                        {ready ? (
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={Boolean(pendingAction)}
                                                    onClick={() => submitReview(publication, 'APPROVED')}
                                                    style={actionButtonStyle('#15803d')}
                                                >
                                                    <Check size={16} /> Approve
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={Boolean(pendingAction)}
                                                    onClick={() => {
                                                        setRevisionPublicationId(publication.id);
                                                        setRevisionFeedback('');
                                                    }}
                                                    style={actionButtonStyle('#b45309')}
                                                >
                                                    Request revisions
                                                </button>
                                            </>
                                        ) : (
                                            <button type="button" disabled style={disabledButtonStyle}>
                                                {publication.review_status === 'REVISION_REQUESTED'
                                                    ? 'Waiting for revised submission'
                                                    : 'Waiting for other invitees'}
                                            </button>
                                        )}

                                        {revisionPublicationId === publication.id && (
                                            <form
                                                onSubmit={(event) => {
                                                    event.preventDefault();
                                                    void submitReview(publication, 'REVISION_REQUESTED', revisionFeedback);
                                                }}
                                                style={feedbackFormStyle}
                                            >
                                                <label htmlFor={`revision-feedback-${publication.id}`} style={labelStyle}>
                                                    Feedback and requested revisions (required)
                                                </label>
                                                <textarea
                                                    id={`revision-feedback-${publication.id}`}
                                                    value={revisionFeedback}
                                                    minLength={5}
                                                    required
                                                    rows={4}
                                                    onChange={(event) => setRevisionFeedback(event.target.value)}
                                                    style={{
                                                        ...textareaStyle,
                                                        borderColor: revisionFeedback.trim().split(/\s+/).filter(Boolean).length > 1000
                                                            ? '#dc2626' : textareaStyle.borderColor,
                                                    }}
                                                />
                                                {(() => {
                                                    const wordCount = revisionFeedback.trim() ? revisionFeedback.trim().split(/\s+/).filter(Boolean).length : 0;
                                                    const exceeded = wordCount > 1000;
                                                    return (
                                                        <div style={{
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                            fontSize: '.78rem', color: exceeded ? '#dc2626' : '#64748b',
                                                        }}>
                                                            <span>
                                                                {exceeded
                                                                    ? `Exceeds limit by ${wordCount - 1000} word${wordCount - 1000 === 1 ? '' : 's'}`
                                                                    : `${1000 - wordCount} word${1000 - wordCount === 1 ? '' : 's'} remaining`}
                                                            </span>
                                                            <span style={{ fontWeight: 600 }}>{wordCount} / 1000 words</span>
                                                        </div>
                                                    );
                                                })()}
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setRevisionPublicationId(null)}
                                                        style={cancelButtonStyle}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="submit"
                                                        disabled={
                                                            revisionFeedback.trim().length < 5
                                                            || (revisionFeedback.trim().split(/\s+/).filter(Boolean).length > 1000)
                                                            || Boolean(pendingAction)
                                                        }
                                                        style={actionButtonStyle('#b45309')}
                                                    >
                                                        {pendingAction === `REVISION_REQUESTED-${publication.id}` && (
                                                            <LoaderCircle className="publication-spinner" size={15} />
                                                        )}
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
                        <ReviewSection
                            title="Processed requests"
                            description="Requests you have already answered or reviewed."
                            count={completedReviews.length}
                        >
                            {completedReviews.map((publication) => (
                                <ReviewCard key={publication.id} {...cardProps(publication)}>
                                    <button type="button" disabled style={disabledButtonStyle}>
                                        {reviewStatusLabel(publication)}
                                    </button>
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
    return (
        <section style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10 }}>
                <h2 style={{ margin: 0, color: '#1e293b', fontSize: '1rem' }}>{title}</h2>
                <span style={countStyle}>{count}</span>
                <span style={{ color: '#64748b', fontSize: '.82rem' }}>{description}</span>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>{children}</div>
        </section>
    );
}