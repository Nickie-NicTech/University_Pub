export const pageStyle = { height: '100%', width: '100%', boxSizing: 'border-box', overflowY: 'auto', padding: 'clamp(18px, 4vw, 42px)', background: '#f8fafc' };
export const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, maxWidth: 1150, margin: '0 auto 22px' };
export const backButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 0, background: 'transparent', color: '#0369a1', cursor: 'pointer', font: 'inherit', fontSize: '.84rem' };
export const eyebrowStyle = { margin: '8px 0 0', color: '#64748b', fontSize: '.7rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' };
export const titleStyle = { margin: '5px 0', color: '#0f172a', fontSize: 'clamp(1.35rem, 3vw, 1.8rem)' };
export const subtitleStyle = { margin: 0, color: '#64748b', fontSize: '.9rem' };
export const counterStyle = { display: 'grid', justifyItems: 'center', minWidth: 110, padding: '12px 18px', border: '1px solid #bae6fd', borderRadius: 9, background: '#f0f9ff', color: '#075985' };
export const noticeStyle = { display: 'flex', alignItems: 'center', gap: 9, maxWidth: 1150, margin: '0 auto', padding: '12px 14px', border: '1px solid #bae6fd', borderRadius: 7, background: '#f0f9ff', color: '#075985', fontSize: '.86rem' };
export const emptyStyle = { display: 'grid', justifyItems: 'center', maxWidth: 550, margin: '10vh auto', padding: 28, textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: 10, background: '#fff' };
export const loadingStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '18vh auto', color: '#475569' };
export const messageStyle = { maxWidth: 1150, margin: '12px auto', padding: 12, borderRadius: 6, fontSize: '.88rem' };
export const cardStyle = { maxWidth: 1150, margin: '0 auto', padding: 17, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
export const countStyle = { display: 'inline-grid', placeItems: 'center', minWidth: 22, height: 22, borderRadius: 999, background: '#e2e8f0', color: '#334155', fontSize: '.75rem', fontWeight: 700 };
export const actionButtonStyle = (color) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 34, padding: '6px 10px', border: `1px solid ${color}`, borderRadius: 5, background: '#fff', color, cursor: 'pointer', font: 'inherit', fontSize: '.78rem', fontWeight: 600 });
export const disabledButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 34, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 5, background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed', font: 'inherit', fontSize: '.78rem' };
export const feedbackFormStyle = { display: 'grid', gap: 8, width: '100%', marginTop: 12, padding: 12, border: '1px solid #fed7aa', borderRadius: 6, background: '#fffaf5' };
export const labelStyle = { color: '#7c2d12', fontSize: '.82rem', fontWeight: 700 };
export const textareaStyle = { width: '100%', boxSizing: 'border-box', padding: 9, border: '1px solid #fdba74', borderRadius: 4, font: 'inherit', resize: 'vertical' };
export const cancelButtonStyle = { minHeight: 34, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 5, background: '#fff', color: '#334155', cursor: 'pointer' };
export const textButtonStyle = { marginLeft: 8, padding: 0, border: 0, background: 'transparent', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' };

// Used by ReviewCard
export const metaRowStyle = { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '4px 24px', marginTop: 9 };
export const metaStyle = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0, color: '#64748b', fontSize: '.82rem' };