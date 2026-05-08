import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Bell, ChevronDown, Check, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { notificationAPI } from '../../api/services';
import toast from 'react-hot-toast';


export default function Header({ onSearch }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false); // 👈 Controls popup
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]); // 👈 Stores real data
  const [searchVal, setSearchVal] = useState('');
  
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  // ── FETCH NOTIFICATIONS ──
// ── FETCH NOTIFICATIONS ──
  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationAPI.list();
      setNotifications(res.data?.notifications || res.data || []);
    } catch (err) {
      console.error("Failed to load notifications", err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      // Initial load
      loadNotifications();

      // ── POLL EVERY 30 SECONDS ──
      // This ensures the employee/manager sees the dot appear 
      // without refreshing their browser.
      const interval = setInterval(() => {
        loadNotifications();
      }, 30000); 

      return () => clearInterval(interval);
    }
  }, [user, loadNotifications]);

  // Handle clicks outside to close
  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter(n => !n.IsRead).length;

  const markAllRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      loadNotifications();
    } catch (err) { toast.error("Action failed"); }
  };

  const displayName = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.name || 'User';
  const initial = displayName[0]?.toUpperCase() || 'U';

  return (
    <header className="header">
      <h1 className="header-title">Leave Management</h1>

      <div className="header-search">
        <Search size={15} className="header-search-icon" />
        <input type="text" placeholder="Search..." value={searchVal} onChange={(e) => { setSearchVal(e.target.value); onSearch?.(e.target.value); }} />
      </div>

      <div className="header-actions">
        {/* ── NOTIFICATION POPUP ── */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button className="icon-btn" onClick={() => setNotifOpen(!notifOpen)}>
            <Bell size={18} />
            {unreadCount > 0 && <span className="notif-dot" />}
          </button>

          {notifOpen && (
            <div className="notif-popup" style={{
              position: 'absolute', top: '120%', right: 0, width: 320,
              background: '#fff', border: '1px solid #eee', borderRadius: 12,
              boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000,
              maxHeight: 450, overflowY: 'auto'
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} style={{ fontSize: '0.75rem', color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>Mark all read</button>
                )}
              </div>
              
              <div style={{ padding: '8px 0' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: '0.8rem' }}>No notifications yet</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.NotificationID} style={{
                      padding: '12px 16px', borderBottom: '1px solid #fafafa',
                      background: n.IsRead ? 'transparent' : 'rgba(59, 130, 246, 0.05)',
                      cursor: 'pointer'
                    }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: 2, color: '#333' }}>{n.Title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#666', lineHeight: 1.4 }}>{n.Body}</div>
                      <div style={{ fontSize: '0.65rem', color: '#999', marginTop: 6 }}>{new Date(n.CreatedAt || Date.now()).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button className="avatar-btn" onClick={() => setMenuOpen(!menuOpen)}>
            <div className="avatar">{initial}</div>
            <div className="avatar-info">
              <div className="avatar-name">{displayName}</div>
              <div className="avatar-role">{user?.role || 'Employee'}</div>
            </div>
            <ChevronDown size={14} style={{ marginLeft: 4, opacity: 0.5 }} />
          </button>

          {menuOpen && (
            <div className="user-dropdown" style={{ position: 'absolute', top: '120%', right: 0, width: 180, background: '#fff', border: '1px solid #eee', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: 4, zIndex: 1000 }}>
              <button className="dropdown-item" onClick={() => { navigate('/profile'); setMenuOpen(false); }}>My Profile</button>
              <button className="dropdown-item danger" onClick={() => { logout(); navigate('/login'); }}>Logout</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}