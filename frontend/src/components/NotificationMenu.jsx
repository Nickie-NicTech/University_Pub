import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';

export default function NotificationMenu({ notifications, error, onMarkRead }) {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const unreadCount = notifications.filter((notification) => !notification.read_at).length;

    const openNotification = async (notification) => {
        if (!await onMarkRead(notification)) return;
        if (notification.link?.startsWith('/') && !notification.link.startsWith('//')) {
            navigate(notification.link);
            setOpen(false);
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setOpen((current) => !current)} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} style={{ position: 'relative', border: 0, background: 'transparent', color: '#f8fafc', cursor: 'pointer', padding: '6px' }}>
                <Bell size={19} aria-hidden="true" />
                {unreadCount > 0 && <span style={{ position: 'absolute', top: 2, right: 1, width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />}
            </button>
            {open && (
                <section aria-label="Notifications" style={{ position: 'absolute', top: '42px', right: 0, zIndex: 30, width: 'min(360px, 85vw)', maxHeight: '420px', overflowY: 'auto', background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 12px 24px rgba(15,23,42,.2)', padding: '12px' }}>
                    <h2 style={{ margin: '2px 4px 10px', fontSize: '1rem' }}>Notifications</h2>
                    {error && <p role="alert" style={{ margin: '8px 4px', color: '#b91c1c', fontSize: '.82rem' }}>{error}</p>}
                    {notifications.length === 0 ? <p style={{ margin: '8px 4px', color: '#64748b', fontSize: '.85rem' }}>You have no notifications.</p> : notifications.map((notification) => (
                        <button key={notification.id} type="button" onClick={() => openNotification(notification)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderTop: '1px solid #e2e8f0', background: notification.read_at ? '#fff' : '#f0f9ff', padding: '10px 6px', cursor: notification.link ? 'pointer' : 'default', color: 'inherit' }}>
                            <strong style={{ display: 'block', fontSize: '.85rem' }}>{notification.title}</strong>
                            <span style={{ display: 'block', marginTop: '3px', fontSize: '.8rem', lineHeight: 1.4 }}>{notification.message}</span>
                            <time style={{ display: 'block', marginTop: '4px', color: '#64748b', fontSize: '.72rem' }}>{new Date(notification.created_at).toLocaleString()}</time>
                        </button>
                    ))}
                </section>
            )}
        </div>
    );
}
