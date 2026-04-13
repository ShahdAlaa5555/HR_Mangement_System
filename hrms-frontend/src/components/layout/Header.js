// src/components/layout/Header.js
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Bell, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const PAGE_TITLES = {
  '/dashboard':  'Dashboard',
  '/employees':  'Employee Management',
  '/attendance': 'Attendance & Time',
  '/leave':      'Leave Management',
  '/payroll':    'Payroll',
  '/profile':    'My Profile',
  '/settings':   'Settings',
};

export default function Header({ onSearch }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen]     = useState(false);
  const [searchVal, setSearchVal]   = useState('');
  const menuRef = useRef(null);

  const title = PAGE_TITLES[location.pathname] || 'HRMS';

  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (e) => {
    setSearchVal(e.target.value);
    onSearch?.(e.target.value);
  };

  const displayName = user
    ? (user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.name || 'User')
    : 'User';
  const initial = displayName[0]?.toUpperCase() || 'U';

  return (
    <header className="header">
      <h1 className="header-title">{title}</h1>

      {/* Search */}
      <div className="header-search">
        <Search size={15} className="header-search-icon" />
        <input
          type="text"
          placeholder="Search..."
          value={searchVal}
          onChange={handleSearch}
        />
      </div>

      <div className="header-actions">
        {/* Notifications */}
        <button className="icon-btn" onClick={() => navigate('/notifications')}>
          <Bell size={18} />
          <span className="notif-dot" />
        </button>

        {/* User Menu */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button className="avatar-btn" onClick={() => setMenuOpen(v => !v)}>
            <div className="avatar">{initial}</div>
            <div>
              <div className="avatar-name">{displayName}</div>
              <div className="avatar-role">{user?.role || 'Employee'}</div>
            </div>
            <ChevronDown size={14} style={{ color: 'var(--text-muted)', marginLeft: 4 }} />
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: '110%', right: 0, zIndex: 200,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '6px',
              minWidth: 180,
              boxShadow: 'var(--shadow-lg)',
              animation: 'fadeUp 0.15s var(--ease)',
            }}>
              {[
                { label: 'My Profile', onClick: () => { navigate('/profile'); setMenuOpen(false); } },
                { label: 'Change Password', onClick: () => { navigate('/settings'); setMenuOpen(false); } },
                { label: 'Logout', onClick: () => { logout(); navigate('/login'); }, danger: true },
              ].map(({ label, onClick, danger }) => (
                <button key={label} onClick={onClick} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 14px', borderRadius: 'var(--radius-md)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.85rem', fontFamily: 'var(--font-body)',
                  color: danger ? 'var(--red)' : 'var(--text-secondary)',
                  transition: 'background var(--dur)',
                }}
                  onMouseEnter={e => e.target.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.target.style.background = 'none'}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
