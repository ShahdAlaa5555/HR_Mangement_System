// src/pages/Employee/ProfilePage.js
import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, MapPin, Calendar, Edit2, Save, X, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeAPI } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { Badge, InlineSpinner, Modal } from '../../components/common';

export default function ProfilePage() {
  const { user, changePassword } = useAuth();
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);
  const [pwModal, setPwModal]   = useState(false);
  const [pwForm, setPwForm]     = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwErrors, setPwErrors] = useState({});

  useEffect(() => {
    employeeAPI.getMe()
      .then((res) => {
        const outer = res.data;
        const payload = (outer && 'data' in outer) ? outer.data : outer;
        const emp = payload?.employee || payload?.user || payload;
        setProfile(emp);
        setForm(emp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const id = profile.id || profile.employeeId;
      await employeeAPI.submitChangeRequest(id, {
        changes: form,
        reason: 'Profile update via self-service',
      });
      toast.success('Change request submitted for review');
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to submit changes');
    } finally { setSaving(false); }
  };

  const handlePasswordChange = async () => {
    const e = {};
    if (!pwForm.currentPassword) e.currentPassword = 'Required';
    if (!pwForm.newPassword)     e.newPassword     = 'Required';
    else if (pwForm.newPassword.length < 8) e.newPassword = 'Min 8 characters';
    if (pwForm.newPassword !== pwForm.confirm) e.confirm = 'Passwords do not match';
    if (Object.keys(e).length) { setPwErrors(e); return; }

    setPwLoading(true);
    try {
      await changePassword(pwForm.currentPassword, pwForm.newPassword);
      toast.success('Password changed successfully');
      setPwModal(false);
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to change password');
    } finally { setPwLoading(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner spinner-lg" />
    </div>
  );

  const displayName = profile
    ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.name || 'User'
    : 'User';

  return (
    <>
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>My Profile</h1>
          <p>View and manage your personal information</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setPwModal(true)}>
            <KeyRound size={15} /> Change Password
          </button>
          {!editing ? (
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              <Edit2 size={15} /> Edit Profile
            </button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setEditing(false)} disabled={saving}><X size={15} /> Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <InlineSpinner /> : <><Save size={15} /> Submit Request</>}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid-2-1" style={{ marginTop: 24 }}>
        {/* Main Info */}
        <div>
          {/* Header card */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: 'var(--radius-lg)',
                background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700,
                color: 'var(--text-inverse)', flexShrink: 0, boxShadow: 'var(--shadow-gold)',
              }}>
                {displayName[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700 }}>{displayName}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 2 }}>{profile?.email}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Badge status={profile?.status || 'Active'}>{profile?.status || 'Active'}</Badge>
                  {profile?.role && <span className="badge badge-info">{profile.role}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Editable fields */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Personal Information</div>
              {editing && <span className="badge badge-gold">Editing</span>}
            </div>

            {editing ? (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">First Name</label>
                    <input className="form-input" value={form.firstName || ''} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last Name</label>
                    <input className="form-input" value={form.lastName || ''} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" type="tel" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <textarea className="form-textarea" value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div style={{
                  padding: '10px 14px', background: 'var(--amber-dim)',
                  border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem', color: 'var(--amber)',
                }}>
                  ⚠️ Changes will be submitted as a change request and reviewed by HR before taking effect.
                </div>
              </>
            ) : (
              [
                { icon: Mail,     label: 'Email',       value: profile?.email                                 },
                { icon: Phone,    label: 'Phone',       value: profile?.phone                                 },
                { icon: MapPin,   label: 'Address',     value: profile?.address                               },
                { icon: Calendar, label: 'Date of Birth', value: profile?.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : null },
                { icon: User,     label: 'Gender',      value: profile?.gender                                },
                { icon: User,     label: 'National ID', value: profile?.nationalId                            },
              ].map(({ icon: Icon, label, value }) => (
                <div className="info-row" key={label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={14} style={{ color: 'var(--text-muted)' }} />
                    <span className="info-row-label">{label}</span>
                  </div>
                  <span className="info-row-value">{value || '—'}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">Employment</div></div>
            {[
              { label: 'Employee ID',    value: profile?.employeeId || profile?.id         },
              { label: 'Department',     value: profile?.department?.name || profile?.departmentName },
              { label: 'Position',       value: profile?.position?.name || profile?.jobTitle || profile?.positionName },
              { label: 'Work Location',  value: profile?.workLocation?.name                },
              { label: 'Hire Date',      value: profile?.hireDate ? new Date(profile.hireDate).toLocaleDateString() : null },
              { label: 'Employee Type',  value: profile?.employeeType                      },
            ].map(({ label, value }) => (
              <div className="info-row" key={label}>
                <span className="info-row-label">{label}</span>
                <span className="info-row-value">{value || '—'}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Account</div></div>
            {[
              { label: 'Role',        value: user?.role || profile?.role },
              { label: 'Last Login',  value: user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : null },
              { label: 'Status',      value: <Badge status={profile?.status || 'Active'}>{profile?.status || 'Active'}</Badge> },
            ].map(({ label, value }) => (
              <div className="info-row" key={label}>
                <span className="info-row-label">{label}</span>
                <span className="info-row-value">{value || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Password Modal */}
      <Modal
        open={pwModal}
        onClose={() => setPwModal(false)}
        title="Change Password"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPwModal(false)} disabled={pwLoading}>Cancel</button>
            <button className="btn btn-primary" onClick={handlePasswordChange} disabled={pwLoading}>
              {pwLoading ? <InlineSpinner /> : 'Change Password'}
            </button>
          </>
        }
      >
        {[
          { key: 'currentPassword', label: 'Current Password' },
          { key: 'newPassword',     label: 'New Password'     },
          { key: 'confirm',         label: 'Confirm Password' },
        ].map(({ key, label }) => (
          <div className="form-group" key={key}>
            <label className="form-label required">{label}</label>
            <input
              className="form-input"
              type="password"
              value={pwForm[key]}
              onChange={e => { setPwForm(f => ({ ...f, [key]: e.target.value })); setPwErrors(err => ({ ...err, [key]: '' })); }}
            />
            {pwErrors[key] && <div className="form-error">{pwErrors[key]}</div>}
          </div>
        ))}
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Password must be at least 8 characters with uppercase, lowercase, and a number.
        </div>
      </Modal>
    </>
  );
}