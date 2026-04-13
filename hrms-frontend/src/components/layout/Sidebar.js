// src/components/layout/Sidebar.js
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Clock, CreditCard, CalendarDays,
  Settings, LogOut, ChevronLeft, ChevronRight, Building2,
  Bell, UserCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NAV = [
  {
    section: 'Main',
    items: [
      { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
    ],
  },
  {
    section: 'Modules',
    items: [
      { to: '/employees',   icon: Users,        label: 'Employees'   },
      { to: '/attendance',  icon: Clock,        label: 'Attendance'  },
      { to: '/leave',       icon: CalendarDays, label: 'Leave'       },
      { to: '/payroll',     icon: CreditCard,   label: 'Payroll'     },
    ],
  },
  {
    section: 'Account',
    items: [
      { to: '/profile',     icon: UserCircle,   label: 'My Profile'  },
      { to: '/settings',    icon: Settings,     label: 'Settings'    },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Building2 size={20} />
        </div>
        {!collapsed && (
          <div className="sidebar-logo-text">
            University<br /><span>HR System</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <div className="nav-section-label">{section}</div>
            {items.map(({ to, icon: Icon, label, badge }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                title={collapsed ? label : undefined}
              >
                <Icon size={18} className="nav-icon" />
                {!collapsed && <span className="nav-label">{label}</span>}
                {!collapsed && badge && <span className="nav-badge">{badge}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {!collapsed && user && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center',
            padding: '10px 12px', marginBottom: 8,
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
          }}>
            <div className="avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>
              {(user.firstName?.[0] || user.name?.[0] || 'U').toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.name || 'User'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {user.role || 'Employee'}
              </div>
            </div>
          </div>
        )}
        <button className="nav-item" onClick={handleLogout} style={{ width: '100%', background: 'none', border: 'none' }}>
          <LogOut size={18} className="nav-icon" style={{ color: 'var(--red)' }} />
          {!collapsed && <span className="nav-label" style={{ color: 'var(--red)' }}>Logout</span>}
        </button>
        <button
          className="nav-item"
          onClick={onToggle}
          style={{ width: '100%', background: 'none', border: 'none', marginTop: 4 }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight size={18} className="nav-icon" /> : <><ChevronLeft size={18} className="nav-icon" /><span className="nav-label">Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
