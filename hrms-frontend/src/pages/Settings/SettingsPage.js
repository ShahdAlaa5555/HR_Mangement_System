// src/pages/Settings/SettingsPage.js
import React, { useState } from 'react';
import { KeyRound, Bell, Monitor, Save, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { InlineSpinner } from '../../components/common';

export default function SettingsPage() {
  const { changePassword } = useAuth();
  const [tab, setTab]   = useState('security');

  // Password
  const [pw, setPw]         = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwErr, setPwErr]   = useState({});
  const [pwLoad, setPwLoad] = useState(false);
  const [show, setShow]     = useState({ cur: false, new: false, con: false });

  // Notifications (UI only – stored locally for demo)
  const [notifs, setNotifs] = useState({
    leaveUpdates:     true,
    payrollReady:     true,
    attendanceAlerts: false,
    systemMessages:   true,
  });

  // Appearance
  const [theme, setTheme] = useState('dark');

  const validatePw = () => {
    const e = {};
    if (!pw.currentPassword)           e.currentPassword = 'Required';
    if (!pw.newPassword)               e.newPassword     = 'Required';
    else if (pw.newPassword.length < 8) e.newPassword    = 'At least 8 characters';
    else if (!/[A-Z]/.test(pw.newPassword)) e.newPassword = 'Must include an uppercase letter';
    else if (!/[0-9]/.test(pw.newPassword)) e.newPassword = 'Must include a number';
    if (pw.newPassword !== pw.confirm) e.confirm = 'Passwords do not match';
    return e;
  };

  const handlePwChange = async () => {
    const e = validatePw();
    if (Object.keys(e).length) { setPwErr(e); return; }
    setPwLoad(true);
    try {
      await changePassword(pw.currentPassword, pw.newPassword);
      toast.success('Password changed successfully');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Incorrect current password');
    } finally { setPwLoad(false); }
  };

  const TABS = [
    { id: 'security',      label: 'Security',       icon: KeyRound },
    { id: 'notifications', label: 'Notifications',  icon: Bell     },
    { id: 'appearance',    label: 'Appearance',      icon: Monitor  },
  ];

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your account preferences</p>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Sidebar nav */}
        <div style={{ width: 200, flexShrink: 0 }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px', marginBottom: 4,
                borderRadius: 'var(--radius-md)',
                background: tab === id ? 'var(--gold-glow)' : 'transparent',
                border: tab === id ? '1px solid rgba(240,180,41,0.2)' : '1px solid transparent',
                color: tab === id ? 'var(--gold-text)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-body)', fontSize: '0.875rem',
                fontWeight: tab === id ? 600 : 400, cursor: 'pointer',
                textAlign: 'left',
                transition: 'all var(--dur) var(--ease)',
              }}
            >
              <Icon size={16} style={{ color: tab === id ? 'var(--gold)' : 'inherit' }} />
              {label}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div style={{ flex: 1 }}>

          {/* ── Security Tab ── */}
          {tab === 'security' && (
            <div className="card" style={{ maxWidth: 520 }}>
              <div className="card-header">
                <div>
                  <div className="card-title">Change Password</div>
                  <div className="card-subtitle">Keep your account secure with a strong password</div>
                </div>
              </div>

              {/* Strength hint */}
              <div style={{
                padding: '10px 14px', marginBottom: 16,
                background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--blue)',
              }}>
                Password must be ≥ 8 characters with at least one uppercase letter and one number.
              </div>

              {/* Password strength bar (live) */}
              {pw.newPassword.length > 0 && (() => {
                let score = 0;
                if (pw.newPassword.length >= 8)           score++;
                if (/[A-Z]/.test(pw.newPassword))         score++;
                if (/[0-9]/.test(pw.newPassword))         score++;
                if (/[^A-Za-z0-9]/.test(pw.newPassword))  score++;
                const colors = ['var(--red)','var(--amber)','var(--gold)','var(--green)'];
                const labels = ['Weak','Fair','Good','Strong'];
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span>Password Strength</span>
                      <span style={{ color: colors[score - 1] || 'var(--text-muted)', fontWeight: 600 }}>
                        {labels[score - 1] || 'Too short'}
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${(score / 4) * 100}%`,
                        background: colors[score - 1] || 'var(--text-muted)',
                        borderRadius: 99, transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                );
              })()}

              {[
                { key: 'currentPassword', label: 'Current Password', vis: 'cur' },
                { key: 'newPassword',     label: 'New Password',     vis: 'new' },
                { key: 'confirm',         label: 'Confirm Password', vis: 'con' },
              ].map(({ key, label, vis }) => (
                <div className="form-group" key={key}>
                  <label className="form-label required">{label}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input"
                      type={show[vis] ? 'text' : 'password'}
                      value={pw[key]}
                      onChange={e => { setPw(p => ({ ...p, [key]: e.target.value })); setPwErr(err => ({ ...err, [key]: '' })); }}
                      placeholder="••••••••"
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(s => ({ ...s, [vis]: !s[vis] }))}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                      }}
                    >
                      {show[vis] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {pwErr[key] && <div className="form-error">{pwErr[key]}</div>}
                </div>
              ))}

              <button
                className="btn btn-primary"
                onClick={handlePwChange}
                disabled={pwLoad}
                style={{ marginTop: 4 }}
              >
                {pwLoad ? <InlineSpinner /> : <><Save size={15} /> Update Password</>}
              </button>
            </div>
          )}

          {/* ── Notifications Tab ── */}
          {tab === 'notifications' && (
            <div className="card" style={{ maxWidth: 520 }}>
              <div className="card-header">
                <div>
                  <div className="card-title">Notification Preferences</div>
                  <div className="card-subtitle">Choose what updates you want to receive</div>
                </div>
              </div>

              {[
                { key: 'leaveUpdates',     label: 'Leave Request Updates',    desc: 'Notify when your leave status changes'         },
                { key: 'payrollReady',     label: 'Payslip Available',        desc: 'Alert when a new payslip is ready to view'     },
                { key: 'attendanceAlerts', label: 'Attendance Alerts',        desc: 'Remind you to check in/out'                   },
                { key: 'systemMessages',   label: 'System Announcements',     desc: 'Important system-wide messages from HR'        },
              ].map(({ key, label, desc }) => (
                <div key={key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 0', borderBottom: '1px solid var(--border-light)',
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{label}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
                  </div>
                  {/* Toggle switch */}
                  <div
                    onClick={() => setNotifs(n => ({ ...n, [key]: !n[key] }))}
                    style={{
                      width: 44, height: 24, borderRadius: 99,
                      background: notifs[key] ? 'var(--gold)' : 'var(--bg-elevated)',
                      border: `1px solid ${notifs[key] ? 'var(--gold)' : 'var(--border)'}`,
                      cursor: 'pointer', position: 'relative',
                      transition: 'all 0.2s ease', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 2,
                      left: notifs[key] ? 22 : 2,
                      width: 18, height: 18, borderRadius: '50%',
                      background: 'white',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </div>
                </div>
              ))}

              <button
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => toast.success('Notification preferences saved')}
              >
                <Save size={15} /> Save Preferences
              </button>
            </div>
          )}

          {/* ── Appearance Tab ── */}
          {tab === 'appearance' && (
            <div className="card" style={{ maxWidth: 520 }}>
              <div className="card-header">
                <div>
                  <div className="card-title">Appearance</div>
                  <div className="card-subtitle">Customize how the system looks</div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Theme</label>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  {[
                    { id: 'dark',  label: 'Dark',  preview: '#0d1117' },
                    { id: 'light', label: 'Light', preview: '#f5f5f5' },
                    { id: 'auto',  label: 'System', preview: 'linear-gradient(135deg,#0d1117 50%,#f5f5f5 50%)' },
                  ].map(({ id, label, preview }) => (
                    <div
                      key={id}
                      onClick={() => { setTheme(id); toast.success(`${label} theme selected — restart required`); }}
                      style={{
                        cursor: 'pointer', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                        border: `2px solid ${theme === id ? 'var(--gold)' : 'var(--border)'}`,
                        transition: 'border-color 0.2s',
                        boxShadow: theme === id ? 'var(--shadow-gold)' : 'none',
                      }}
                    >
                      <div style={{ width: 80, height: 50, background: preview }} />
                      <div style={{
                        textAlign: 'center', padding: '6px 0',
                        fontSize: '0.75rem', fontWeight: theme === id ? 600 : 400,
                        color: theme === id ? 'var(--gold)' : 'var(--text-secondary)',
                        background: 'var(--bg-elevated)',
                      }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 8 }}>
                <label className="form-label">Sidebar Default</label>
                <select className="form-select">
                  <option>Expanded</option>
                  <option>Collapsed</option>
                </select>
                <div className="form-hint">Controls the default sidebar state on page load</div>
              </div>

              <div className="form-group">
                <label className="form-label">Date Format</label>
                <select className="form-select">
                  <option>MM/DD/YYYY</option>
                  <option>DD/MM/YYYY</option>
                  <option>YYYY-MM-DD</option>
                </select>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => toast.success('Appearance settings saved')}
              >
                <Save size={15} /> Save Settings
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
