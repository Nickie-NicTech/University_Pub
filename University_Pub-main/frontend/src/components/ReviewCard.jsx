import React from 'react';
import { Download, Eye, LoaderCircle } from 'lucide-react';
import { formatRelativeDate,formatISODate } from './reviewUtils';
import {
    actionButtonStyle,
    cardStyle,
    eyebrowStyle,
    metaRowStyle,
    metaStyle,
} from './reviewStyles';

export default function ReviewCard({
    publication,
    currentReviewerId,
    previewUrl,
    previewLoading,
    pendingAction,
    onPreview,
    onDownload,
    children,
}) {
    const myInvitation = publication.review_invitations?.find(
        (invitation) => invitation.reviewer === currentReviewerId
    );
    const authors =
        publication.authors_details?.map((author) => author.name).join('; ') || 'Not specified';
    const role = myInvitation?.role === 'CO_SUPERVISOR' ? 'Co-supervisor' : 'Supervisor';
    const isDownloading = pendingAction === `download-${publication.id}`;

    return (
        <article id={`publication-${publication.id}`} tabIndex={-1} style={cardStyle}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 50,
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <span style={eyebrowStyle}>
                        {publication.pub_type} · {publication.subject_area}
                    </span>

                    <h3 style={{ margin: '6px 0', color: '#0f172a', fontSize: '1.05rem' }}>
                        {publication.title}
                    </h3>

                    <p
                        style={{
                            margin: 0,
                            color: '#475569',
                            fontSize: '.88rem',
                            lineHeight: 1.55,
                            whiteSpace: 'pre-wrap',
                        }}
                    >
                        {publication.abstract}
                    </p>

                    <div style={metaRowStyle}>
                        <p style={metaStyle}>
                            <span><strong>Authors:</strong> {authors}</span>
                            <span><strong>Role:</strong> {role}</span>
                        </p>

                        <p style={metaStyle}>
                            <span>
                                <strong>Submitted:</strong>{' '}
                                {formatISODate(publication.upload_date) || 'Not specified'}
                            </span>
                            <span>
                                <strong>Last updated:</strong>{' '}
                                {formatRelativeDate(publication.updated_at) || 'Not specified'}
                            </span>
                        </p>
                    </div>

                    {myInvitation?.feedback && (
                        <p
                            style={{
                                margin: '8px 0 0',
                                color: '#7c2d12',
                                fontSize: '.82rem',
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            <strong>Your feedback:</strong> {myInvitation.feedback}
                        </p>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                       {children}
                    <button
                        type="button"
                        onClick={() => onPreview(publication)}
                        disabled={previewLoading || !publication.file_attachment}
                        style={actionButtonStyle('#0369a1')}
                    >
                        {previewLoading ? (
                            <LoaderCircle className="publication-spinner" size={15} />
                        ) : (
                            <Eye size={15} />
                        )}
                        {previewUrl ? 'Hide document' : 'View document'}
                    </button>

                    <button
                        type="button"
                        onClick={() => onDownload(publication)}
                        disabled={!publication.file_attachment || Boolean(pendingAction)}
                        style={actionButtonStyle('#0369a1')}
                    >
                        {isDownloading ? (
                            <LoaderCircle className="publication-spinner" size={15} />
                        ) : (
                            <Download size={15} />
                        )}
                        Download
                    </button>

                 
                </div>
            </div>

            {!publication.file_attachment && (
                <p style={{ margin: '12px 0 0', color: '#92400e', fontSize: '.82rem' }}>
                    No manuscript file was attached to this submission.
                </p>
            )}

            {previewUrl && (
                <iframe
                    title={`Manuscript preview: ${publication.title}`}
                    src={previewUrl}
                    style={{
                        width: '100%',
                        height: 'min(65vh, 640px)',
                        marginTop: 14,
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                    }}
                />
            )}
        </article>
    );
}