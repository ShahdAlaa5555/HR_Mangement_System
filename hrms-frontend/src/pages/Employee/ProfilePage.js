// src/pages/Employee/ProfilePage.js
import React, { useState, useEffect, useCallback } from 'react';
import { 
  User, Mail, Phone, MapPin, Calendar, Edit2, Save, X, KeyRound,
  HeartPulse, Award, Plus, Trash2, Image as ImageIcon, BookOpen,
  Clock, FolderOpen, Download, FileText, LifeBuoy
} from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeAPI, safeArray } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { Badge, InlineSpinner, Modal } from '../../components/common';

export default function ProfilePage() {
  const { user, changePassword } = useAuth();
  
  // Hooks must ALWAYS be at the top level
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);
  
  // Password State
  const [pwModal, setPwModal]   = useState(false);
  const [pwForm, setPwForm]     = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwErrors, setPwErrors] = useState({});

  // Relational States
  const [contacts, setContacts] = useState([]);
  const [skills, setSkills]     = useState([]);
  const [docs, setDocs]         = useState([]);
  
  // Contacts Modal
  const [contactModal, setContactModal] = useState(false);
  const [editingContactId, setEditingContactId] = useState(null);
  const [contactForm, setContactForm] = useState({ ContactName: '', Relationship: '', Phone: '', AltPhone: '', IsPrimary: false });

  // Skills & Docs Modals
  const [skillModal, setSkillModal] = useState(false);
  const [skillForm, setSkillForm] = useState({ SkillName: '', ProficiencyLevel: 'Intermediate', YearsExperience: '' });

  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ DocumentTitle: '', DocumentType: 'National ID', ExpiryDate: '' });
  const [docFile, setDocFile] = useState(null);

  const [timelineModal, setTimelineModal] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState([]);

  const loadRelationalData = useCallback(async (empId) => {
    try {
      const [contactsRes, skillsRes, docsRes] = await Promise.all([
        employeeAPI.getContacts(empId).catch(() => ({ data: { data: [] } })),
        employeeAPI.getSkills(empId).catch(() => ({ data: { data: [] } })),
        employeeAPI.getDocuments(empId).catch(() => ({ data: { data: [] } }))
      ]);
      setContacts(safeArray(contactsRes));
      setSkills(safeArray(skillsRes));
      setDocs(safeArray(docsRes));
    } catch (error) {
      console.error("Failed to load relational data", error);
    }
  }, []);

  useEffect(() => {
    employeeAPI.getMe()
      .then(({ data }) => {
        const emp = data?.employee || data?.user || data?.data || data;
        setProfile(emp);
        setForm(emp);
        
        const empId = emp.EmployeeID || emp.id || emp.employeeId;
        if (empId) loadRelationalData(empId);
        
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [loadRelationalData]);

  // ─── SAVE PROFILE CHANGES ───
  const handleSave = async () => {
    setSaving(true);
    try {
      const id = profile.EmployeeID || profile.id || profile.employeeId;
      const changes = [];
      const fieldsToCheck = ['FirstName', 'LastName', 'Phone', 'Address', 'Bio'];
      
      for (const field of fieldsToCheck) {
        const originalValue = profile[field] || '';
        const newValue = form[field] || '';
        if (originalValue !== newValue) {
          changes.push({ FieldName: field, NewValue: String(newValue) || ' ' });
        }
      }

      if (changes.length === 0) {
        toast.success('No changes detected');
        setEditing(false);
        setSaving(false);
        return;
      }

      await Promise.all(changes.map(change => employeeAPI.submitChangeRequest(id, change)));
      toast.success('Change requests submitted to HR for review');
      setEditing(false);
    } catch (err) { toast.error('Failed to submit changes'); } 
    finally { setSaving(false); }
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
    } catch (err) { toast.error('Failed to change password'); } 
    finally { setPwLoading(false); }
  };

  const downloadPdf = async (type) => {
    const toastId = toast.loading(`Generating ${type === 'contract' ? 'Contract' : 'Verification Letter'}...`);
    try {
      const empId = profile.EmployeeID || profile.id;
      const res = type === 'contract' 
        ? await employeeAPI.downloadContract(empId)
        : await employeeAPI.downloadVerification(empId);
      
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Downloaded successfully!', { id: toastId });
    } catch (error) {
      toast.error('Failed to download document.', { id: toastId });
    }
  };

  const openTimeline = async () => {
    setTimelineModal(true);
    try {
      const empId = profile.EmployeeID || profile.id;
      const res = await employeeAPI.getTimeline(empId);
      setTimelineEvents(safeArray(res));
    } catch (err) { toast.error('Failed to load timeline'); }
  };

  // ─── EMERGENCY CONTACTS (ADD, EDIT, DELETE) ───
  const handleOpenAddContact = () => {
    setContactForm({ ContactName: '', Relationship: '', Phone: '', AltPhone: '', IsPrimary: false });
    setEditingContactId(null);
    setContactModal(true);
  };

  const handleOpenEditContact = (contact) => {
    setContactForm(contact);
    setEditingContactId(contact.ContactID);
    setContactModal(true);
  };

  const handleSaveContact = async () => {
    if (!contactForm.ContactName || !contactForm.Relationship || !contactForm.Phone) {
      toast.error("Name, relationship, and phone are required.");
      return;
    }
    setSaving(true);
    try {
      const empId = profile.EmployeeID || profile.id;
      if (editingContactId) {
        await employeeAPI.updateContact(empId, editingContactId, contactForm);
        toast.success('Emergency contact updated');
      } else {
        await employeeAPI.addContact(empId, contactForm);
        toast.success('Emergency contact added');
      }
      setContactModal(false);
      loadRelationalData(empId);
    } catch (err) { toast.error('Failed to save contact'); } 
    finally { setSaving(false); }
  };

  const handleDeleteContact = async (contactId) => {
    if (!window.confirm('Delete this contact?')) return;
    const empId = profile.EmployeeID || profile.id;
    await employeeAPI.deleteContact(empId, contactId).then(() => {
      toast.success('Contact deleted');
      loadRelationalData(empId);
    });
  };

  // ─── SKILLS & DOCS ───
  const handleAddSkill = async () => {
    if (!skillForm.SkillName || !skillForm.ProficiencyLevel) return;
    setSaving(true);
    try {
      const empId = profile.EmployeeID || profile.id;
      await employeeAPI.addSkill(empId, { ...skillForm, YearsExperience: skillForm.YearsExperience ? parseInt(skillForm.YearsExperience, 10) : null });
      setSkillModal(false);
      setSkillForm({ SkillName: '', ProficiencyLevel: 'Intermediate', YearsExperience: '' });
      loadRelationalData(empId);
    } catch (err) { toast.error('Failed to add skill'); } 
    finally { setSaving(false); }
  };

  const handleDeleteSkill = async (skillId) => {
    if (!window.confirm('Delete this skill?')) return;
    const empId = profile.EmployeeID || profile.id;
    await employeeAPI.deleteSkill(empId, skillId).then(() => loadRelationalData(empId));
  };

  const handleUploadDoc = async () => {
    if (!docForm.DocumentTitle || !docFile) { toast.error('Title and File are required'); return; }
    setSaving(true);
    try {
      const empId = profile.EmployeeID || profile.id;
      await employeeAPI.uploadDocument(empId, docForm, docFile);
      toast.success('Document uploaded successfully');
      setDocModal(false);
      setDocForm({ DocumentTitle: '', DocumentType: 'National ID', ExpiryDate: '' });
      setDocFile(null);
      loadRelationalData(empId);
    } catch (err) { toast.error('Upload failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      const empId = profile.EmployeeID || profile.id;
      await employeeAPI.deleteDocument(empId, docId);
      setDocs(docs.filter(d => d.DocumentID !== docId));
      toast.success('Deleted');
    } catch (err) { toast.error('Failed to delete'); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner spinner-lg" /></div>;

  const displayName = profile ? `${profile.FirstName || profile.firstName || ''} ${profile.LastName || profile.lastName || ''}`.trim() || profile.FullName || profile.name || 'User' : 'User';

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
              <button className="btn btn-secondary" onClick={() => { setEditing(false); setForm(profile); }} disabled={saving}><X size={15} /> Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <InlineSpinner /> : <><Save size={15} /> Submit Changes</>}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid-2-1" style={{ marginTop: 24 }}>
        {/* ── MAIN COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          <div className="card">
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--gold)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: 'var(--text-inverse)', flexShrink: 0, boxShadow: 'var(--shadow-gold)', border: '2px solid var(--border-light)' }}>
                {profile?.PhotoURL ? <img src={profile.PhotoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (displayName[0]?.toUpperCase() || '?')}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700 }}>{displayName}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 2 }}>{profile?.Email || profile?.email}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Badge status={profile?.CurrentStatus || profile?.status || 'Active'}>{profile?.CurrentStatus || profile?.status || 'Active'}</Badge>
                  {profile?.role && <span className="badge badge-info">{profile.role}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Personal Information</div>
              {editing && <span className="badge badge-gold">Editing</span>}
            </div>

            {editing ? (
              <>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">First Name</label><input className="form-input" value={form.FirstName || form.firstName || ''} onChange={e => setForm(f => ({ ...f, FirstName: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Last Name</label><input className="form-input" value={form.LastName || form.lastName || ''} onChange={e => setForm(f => ({ ...f, LastName: e.target.value }))} /></div>
                </div>
                <div className="form-group">
                  <label className="form-label">Profile Photo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <div style={{ width: 50, height: 50, borderRadius: '50%', backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {form.PhotoURL ? <img src={form.PhotoURL} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={20} style={{ color: 'var(--text-muted)' }} />}
                    </div>
                    <div>
                      <input type="file" id="actual-btn" accept="image/png, image/jpeg, image/jpg" style={{ display: 'none' }} onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          const toastId = toast.loading('Uploading photo...');
                          try {
                            const res = await employeeAPI.uploadPhoto(file);
                            const newUrl = res.data?.data?.url || res.data?.url;
                            const id = profile.EmployeeID || profile.id || profile.employeeId;
                            await employeeAPI.updatePhoto(id, newUrl);
                            setForm(f => ({ ...f, PhotoURL: newUrl }));
                            setProfile(p => ({ ...p, PhotoURL: newUrl })); 
                            toast.success('Profile photo updated instantly!', { id: toastId });
                          } catch (err) { toast.error('Failed to upload photo.', { id: toastId }); }
                        }}
                      />
                      <label htmlFor="actual-btn" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>Browse Files...</label>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>JPG or PNG. Max size 5MB.</div>
                    </div>
                  </div>
                </div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-input" type="tel" value={form.Phone || form.phone || ''} onChange={e => setForm(f => ({ ...f, Phone: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Address</label><textarea className="form-textarea" value={form.Address || form.address || ''} onChange={e => setForm(f => ({ ...f, Address: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Biography</label><textarea className="form-textarea" placeholder="Tell us about yourself..." style={{ height: 100 }} value={form.Bio || ''} onChange={e => setForm(f => ({ ...f, Bio: e.target.value }))} /></div>
                <div style={{ padding: '10px 14px', background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--amber)' }}>
                  ⚠️ Changes to core details (Name, Address, Bio) will be submitted as an HR Change Request and must be approved before updating your public profile.
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { icon: Mail,     label: 'Email',       value: profile?.Email || profile?.email },
                  { icon: Phone,    label: 'Phone',       value: profile?.Phone || profile?.phone },
                  { icon: MapPin,   label: 'Address',     value: profile?.Address || profile?.address },
                  { icon: Calendar, label: 'Date of Birth', value: profile?.DateOfBirth ? new Date(profile.DateOfBirth).toLocaleDateString() : null },
                  { icon: User,     label: 'Gender',      value: profile?.Gender || profile?.gender },
                  { icon: User,     label: 'Nationality', value: profile?.Nationality },
                  { icon: ImageIcon, label: 'Photo URL',  value: profile?.PhotoURL ? 'Active Photo' : null },
                  { icon: BookOpen, label: 'Biography',   value: profile?.Bio },
                ].map(({ icon: Icon, label, value }) => (
                  <div className="info-row" key={label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
                      <Icon size={14} style={{ color: 'var(--text-muted)' }} />
                      <span className="info-row-label">{label}</span>
                    </div>
                    <span className="info-row-value" style={{ flex: 1 }}>{value || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><HeartPulse size={18} style={{ color: 'var(--red)' }} /> Emergency Contacts</div>
              <button className="btn btn-ghost btn-sm" onClick={handleOpenAddContact}><Plus size={15} /> Add</button>
            </div>
            {contacts.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No emergency contacts added yet.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Relationship</th><th>Phone</th><th style={{ width: 80, textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {contacts.map(c => (
                      <tr key={c.ContactID}>
                        <td>{c.ContactName} {c.IsPrimary && <Badge status="Active" className="ml-2" style={{ fontSize: '0.65rem' }}>Primary</Badge>}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{c.Relationship}</td>
                        <td style={{ fontFamily: 'monospace' }}>{c.Phone}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--text-secondary)' }} onClick={() => handleOpenEditContact(c)} title="Edit"><Edit2 size={14} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDeleteContact(c.ContactID)} title="Delete"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* ── SIDEBAR COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Support & Leadership Card */}
          <div className="card">
            <div className="card-header"><div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LifeBuoy size={18} style={{ color: 'var(--purple)' }}/> Support & Leadership</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Direct Manager</div>
                {profile?.Supervisor ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--gold)', backgroundImage: profile.Supervisor.PhotoURL ? `url("${profile.Supervisor.PhotoURL}")` : 'none', backgroundSize: 'cover', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                      {!profile.Supervisor.PhotoURL && (profile.Supervisor.FullName?.charAt(0) || 'M')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{profile.Supervisor.FullName}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{profile.Supervisor.Email}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No direct manager assigned.</div>
                )}
              </div>
              
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>HR Contact</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                    HR
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>Human Resources Dept.</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>hr.support@university.edu</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Employment</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Employee Code',  value: profile?.EmployeeCode || profile?.employeeCode },
                { label: 'Department',     value: profile?.Department?.DepartmentName || profile?.department?.name },
                { label: 'Position',       value: profile?.Position?.PositionTitle || profile?.position?.name },
                { label: 'Work Location',  value: profile?.WorkLocation?.LocationName || profile?.workLocation?.name },
                { label: 'Hire Date',      value: profile?.StartDate ? new Date(profile.StartDate).toLocaleDateString() : null },
                { label: 'Employee Type',  value: profile?.EmploymentType || profile?.employeeType },
              ].map(({ label, value }) => (
                <div className="info-row" key={label}>
                  <span className="info-row-label">{label}</span>
                  <span className="info-row-value">{value || '—'}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
              <button className="btn btn-secondary w-full" onClick={openTimeline}>
                <Clock size={15} /> View Employment Timeline
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Letters & Contracts</div></div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>Download official system-generated documents.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-secondary w-full" style={{ justifyContent: 'flex-start' }} onClick={() => downloadPdf('verification')}>
                <FileText size={15} style={{ color: 'var(--blue)' }} /> Request Verification Letter
              </button>
              <button className="btn btn-secondary w-full" style={{ justifyContent: 'flex-start' }} onClick={() => downloadPdf('contract')}>
                <FileText size={15} style={{ color: 'var(--purple)' }} /> Download Contract
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title">My Documents</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDocModal(true)}><Plus size={16} /></button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>Upload Identity cards, Passports, and Certifications.</p>
            {docs.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No documents uploaded.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {docs.map(doc => (
                  <div key={doc.DocumentID} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.DocumentTitle}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{doc.DocumentType}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <a href={doc.FileURL} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm btn-icon"><Download size={14} /></a>
                      <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }} onClick={() => handleDeleteDoc(doc.DocumentID)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Award size={18} style={{ color: 'var(--gold)' }} /> Skills</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSkillModal(true)}><Plus size={16} /></button>
            </div>
            {skills.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No skills added yet.</p> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {skills.map(s => (
                  <div key={s.SkillID} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-hover)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 500 }}>{s.SkillName}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>• {s.ProficiencyLevel}</span>
                    <button onClick={() => handleDeleteSkill(s.SkillID)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0, marginLeft: 4, display: 'flex' }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALS */}
      <Modal open={contactModal} onClose={() => setContactModal(false)} title={editingContactId ? "Edit Emergency Contact" : "Add Emergency Contact"} footer={<><button className="btn btn-secondary" onClick={() => setContactModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSaveContact} disabled={saving}>{saving ? <InlineSpinner /> : 'Save Contact'}</button></>}>
        <div className="form-group"><label className="form-label required">Contact Name</label><input className="form-input" value={contactForm.ContactName} onChange={e => setContactForm(f => ({...f, ContactName: e.target.value}))} /></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label required">Relationship</label><input className="form-input" placeholder="e.g. Spouse, Parent" value={contactForm.Relationship} onChange={e => setContactForm(f => ({...f, Relationship: e.target.value}))} /></div>
          <div className="form-group"><label className="form-label required">Phone</label><input className="form-input" type="tel" value={contactForm.Phone} onChange={e => setContactForm(f => ({...f, Phone: e.target.value}))} /></div>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={contactForm.IsPrimary} onChange={e => setContactForm(f => ({...f, IsPrimary: e.target.checked}))} /> Set as Primary Contact
          </label>
        </div>
      </Modal>

      <Modal open={skillModal} onClose={() => setSkillModal(false)} title="Add Skill" footer={<><button className="btn btn-secondary" onClick={() => setSkillModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleAddSkill} disabled={saving}>{saving ? <InlineSpinner /> : 'Add Skill'}</button></>}>
        <div className="form-group"><label className="form-label required">Skill Name</label><input className="form-input" placeholder="e.g. React.js, CPR Certified" value={skillForm.SkillName} onChange={e => setSkillForm(f => ({...f, SkillName: e.target.value}))} /></div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label required">Proficiency</label>
            <select className="form-select" value={skillForm.ProficiencyLevel} onChange={e => setSkillForm(f => ({...f, ProficiencyLevel: e.target.value}))}>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
              <option value="Expert">Expert</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Years of Experience</label><input className="form-input" type="number" min="0" value={skillForm.YearsExperience} onChange={e => setSkillForm(f => ({...f, YearsExperience: e.target.value}))} /></div>
        </div>
      </Modal>

      <Modal open={docModal} onClose={() => setDocModal(false)} title="Upload Document" footer={<><button className="btn btn-secondary" onClick={() => setDocModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleUploadDoc} disabled={saving || !docFile}>{saving ? <InlineSpinner /> : 'Upload'}</button></>}>
        <div className="form-group"><label className="form-label required">Document Title</label><input className="form-input" placeholder="e.g. Scanned ID Front" value={docForm.DocumentTitle} onChange={e => setDocForm(f => ({...f, DocumentTitle: e.target.value}))} /></div>
        <div className="form-group">
          <label className="form-label required">Category</label>
          <select className="form-select" value={docForm.DocumentType} onChange={e => setDocForm(f => ({...f, DocumentType: e.target.value}))}>
            <option value="National ID">National ID</option>
            <option value="Passport">Passport</option>
            <option value="Certificate">Certificate / Degree</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="form-group"><label className="form-label">Expiry Date (Optional)</label><input className="form-input" type="date" value={docForm.ExpiryDate} onChange={e => setDocForm(f => ({...f, ExpiryDate: e.target.value}))} /></div>
        <div className="form-group">
          <label className="form-label required">File (PDF/Image)</label>
          <input className="form-input" type="file" accept=".pdf, image/*" onChange={e => setDocFile(e.target.files[0])} />
        </div>
      </Modal>

      <Modal open={!!timelineModal} onClose={() => setTimelineModal(false)} title={`My Employment Timeline`} size="modal-lg" footer={<button className="btn btn-secondary" onClick={() => setTimelineModal(false)}>Close</button>}>
        {timelineEvents.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No major career events recorded yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 0' }}>
            {timelineEvents.map((evt, i) => (
              <div key={i} style={{ display: 'flex', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--gold)', zIndex: 1 }} />
                  {i !== timelineEvents.length - 1 && <div style={{ flex: 1, width: 2, background: 'var(--border)', margin: '4px 0' }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: 16 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    {new Date(evt.ChangedAt).toLocaleDateString()} • Recorded by {evt.ChangedByEmp?.FullName || 'System'}
                  </div>
                  <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', padding: 12, borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Change to <span className="badge badge-purple">{evt.FieldChanged}</span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      <span style={{ textDecoration: 'line-through', marginRight: 8 }}>{evt.OldValue || 'None'}</span>
                      → <span style={{ color: 'var(--green)', fontWeight: 500, marginLeft: 8 }}>{evt.NewValue}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={pwModal} onClose={() => setPwModal(false)} title="Change Password" footer={<><button className="btn btn-secondary" onClick={() => setPwModal(false)} disabled={pwLoading}>Cancel</button><button className="btn btn-primary" onClick={handlePasswordChange} disabled={pwLoading}>{pwLoading ? <InlineSpinner /> : 'Change Password'}</button></>}>
        {[{ key: 'currentPassword', label: 'Current Password' }, { key: 'newPassword', label: 'New Password' }, { key: 'confirm', label: 'Confirm Password' }].map(({ key, label }) => (
          <div className="form-group" key={key}>
            <label className="form-label required">{label}</label>
            <input className="form-input" type="password" value={pwForm[key]} onChange={e => { setPwForm(f => ({ ...f, [key]: e.target.value })); setPwErrors(err => ({ ...err, [key]: '' })); }} />
            {pwErrors[key] && <div className="form-error">{pwErrors[key]}</div>}
          </div>
        ))}
      </Modal>
    </>
  );
}