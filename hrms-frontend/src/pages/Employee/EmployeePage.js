// src/pages/Employee/EmployeePage.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, MoreHorizontal, Edit2,
  UserX, Eye, Mail, Phone,
  ChevronLeft, ChevronRight, Copy, CheckCheck, Settings,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── FIXED: We are now importing your awesome safeArray helper! ──
import { employeeAPI, safeArray } from '../../api/services';
import { Modal, Badge, SkeletonTable, EmptyState, ConfirmDialog, InlineSpinner } from '../../components/common';

/* ── Credentials Dialog ── */
function CredentialsDialog({ data, onClose }) {
  const [copied, setCopied] = useState('');
  if (!data) return null;

  const copy = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const copyAll = () => {
    const text = `University HR System — Login Credentials\n\nName: ${data.name}\nEmail: ${data.email}\nPassword: ${data.password}\nLogin URL: ${window.location.origin}/login\n\nPlease log in and change your password.`;
    navigator.clipboard.writeText(text);
    setCopied('all');
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title" style={{ color: 'var(--green)' }}>✅ Employee Created Successfully</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Share these login credentials with <strong>{data.name}</strong></p>
          </div>
        </div>
        <div className="modal-body">
          <div style={{ padding: '10px 14px', marginBottom: 16, background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--amber)' }}>
            ⚠️ Save these credentials now — the password won't be shown again.
          </div>
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 14 }}>
            {[
              { label: 'Full Name', value: data.name, mono: false },
              { label: 'Email', value: data.email, mono: false },
              { label: 'Password', value: data.password, mono: true },
              { label: 'Login URL', value: `${window.location.origin}/login`, mono: false },
            ].map(({ label, value, mono }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500, fontFamily: mono ? 'monospace' : 'var(--font-body)', color: label === 'Password' ? 'var(--gold)' : 'var(--text-primary)' }}>{value}</div>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => copy(value, label)}>{copied === label ? <CheckCheck size={14} style={{ color: 'var(--green)' }} /> : <Copy size={14} />}</button>
              </div>
            ))}
          </div>
          <button className="btn btn-secondary w-full" onClick={copyAll} style={{ justifyContent: 'center' }}>{copied === 'all' ? <><CheckCheck size={15} /> Copied!</> : <><Copy size={15} /> Copy All</>}</button>
        </div>
        <div className="modal-footer"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

/* ── Positions Manager Modal ── */
function PositionsManager({ open, onClose, positions, onRefresh }) {
  const [newCode,  setNewCode]  = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [saving,   setSaving]   = useState(false);

  const handleAdd = async () => {
    if (!newCode.trim() || !newTitle.trim()) { toast.error('Both code and title required'); return; }
    setSaving(true);
    try {
      await employeeAPI.createPosition({ PositionCode: newCode.toUpperCase(), PositionTitle: newTitle.trim(), IsActive: true });
      toast.success(`Position added`);
      setNewCode(''); setNewTitle('');
      onRefresh();
    } catch (err) { toast.error('Failed to add position'); } 
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Positions" size="modal-lg">
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <div style={{ flex: '0 0 130px' }}><label className="form-label">Code</label><input className="form-input" placeholder="e.g. PROF" value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} /></div>
        <div style={{ flex: 1 }}><label className="form-label">Title</label><input className="form-input" placeholder="e.g. Professor" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} /></div>
        <div style={{ alignSelf: 'flex-end' }}><button className="btn btn-primary" onClick={handleAdd} disabled={saving}>{saving ? <InlineSpinner /> : 'Add'}</button></div>
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        {positions.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
            <span style={{ fontWeight: 500 }}>{p.PositionTitle || p.positionTitle}</span>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.PositionCode || p.positionCode}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ── Form Helpers ── */
const initEmployee = {
  EmployeeCode: '', FirstName: '', LastName: '', Email: '', Phone: '',
  DepartmentID: '', PositionID: '', WorkLocationID: '', SupervisorID: '',
  StartDate: '', CurrentStatus: 'Active', Gender: '', EmploymentType: 'Full-Time',
  DateOfBirth: '', Nationality: '', MaritalStatus: 'Single', password: ''
};

const generateEmpCode = () => `EMP${Date.now().toString().slice(-6)}`;

function EmployeeForm({ data, onChange, departments, positions, locations, supervisors, errors, isCreate = false }) {
  
  // ── HELPERS ──
  const getId = (o) => o?.EmployeeID || o?.DepartmentID || o?.PositionID || o?.WorkLocationID || o?.id || o?.ID || '';
  
  const getName = (o) => o?.FullName || o?.DepartmentName || o?.PositionTitle || o?.LocationName || o?.name || o?.title || 'Unknown Item';

  // ── FIELD RENDERERS ──
  // FIXED: Added the missing 'field' function definition here
  const field = (k, label, type = 'text', req = false) => (
    <div className="form-group">
      <label className={`form-label ${req ? 'required' : ''}`}>{label}</label>
      <input 
        className="form-input" 
        type={type} 
        value={data[k] || ''} 
        onChange={e => onChange(k, e.target.value)} 
        placeholder={label} 
      />
      {errors[k] && <div className="form-error">{errors[k]}</div>}
    </div>
  );

  const select = (k, label, opts, req = false) => (
    <div className="form-group">
      <label className={`form-label ${req ? 'required' : ''}`}>{label}</label>
      <select 
        className="form-select" 
        value={data[k] || ''} 
        onChange={e => onChange(k, e.target.value)}
      >
        <option value="">— Select {label} —</option>
        {opts && opts.length > 0 ? (
          opts.map((o, i) => (
            <option key={`${getId(o)}-${i}`} value={getId(o)}>
              {getName(o)}
            </option>
          ))
        ) : (
          <option disabled>No {label} available</option>
        )}
      </select>
      {errors[k] && <div className="form-error">{errors[k]}</div>}
    </div>
  );

  return (
    <>
      <div className="form-group">
        <label className="form-label required">Employee Code</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" type="text" value={data.EmployeeCode || ''} onChange={e => onChange('EmployeeCode', e.target.value.toUpperCase())} style={{ flex: 1, fontFamily: 'monospace' }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange('EmployeeCode', generateEmpCode())}>Auto-generate</button>
        </div>
        {errors.EmployeeCode && <div className="form-error">{errors.EmployeeCode}</div>}
      </div>

      <div className="form-row">
        {field('FirstName', 'First Name', 'text', true)}
        {field('LastName',  'Last Name',  'text', true)}
      </div>

      <div className="form-row">
        {field('Email', 'Email', 'email', true)}
        {field('Phone', 'Phone', 'tel')}
      </div>

      <div className="form-row">
        {select('DepartmentID', 'Department', departments, true)}
        {select('PositionID',   'Position',   positions,   true)}
      </div>

      <div className="form-row">
        {select('WorkLocationID', 'Work Location', locations, true)}
        {select('SupervisorID',   'Supervisor / Manager', supervisors, false)}
      </div>

      <div className="form-row">
        {field('StartDate',   'Start Date',    'date', true)}
        {field('DateOfBirth', 'Date of Birth', 'date', true)}
      </div>

      <div className="form-row">
        {select('Gender', 'Gender', [
          { id: 'Male',   name: 'Male'   },
          { id: 'Female', name: 'Female' },
          { id: 'Other',  name: 'Other'  }
        ], true)}
        {select('EmploymentType', 'Type', [
          { id: 'Full-Time', name: 'Full-Time' },
          { id: 'Part-Time', name: 'Part-Time' }
        ], true)}
      </div>

      <div className="form-row">
        {field('Nationality', 'Nationality', 'text', true)}
        {select('CurrentStatus', 'Status', [
          { id: 'Active',   name: 'Active'   },
          { id: 'Inactive', name: 'Inactive' }
        ], true)}
      </div>

      {isCreate && (
        <div className="form-group" style={{ marginTop: 4 }}>
          <label className="form-label required">Temporary Password</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input 
              className="form-input" 
              type="text" 
              value={data.password || ''} 
              onChange={e => onChange('password', e.target.value)} 
              style={{ flex: 1, fontFamily: 'monospace' }} 
            />
            <button 
              type="button" 
              className="btn btn-secondary btn-sm" 
              onClick={() => onChange('password', `Uni@${Math.floor(100000 + Math.random() * 900000)}`)}
            >
              🔄 Regenerate
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function EmployeePage() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [formData, setFormData] = useState(initEmployee);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  
  const [openMenu, setOpenMenu] = useState(null);
  const [credentialsDialog, setCredentialsDialog] = useState(null);
  const [positionsModal, setPositionsModal] = useState(false);
useEffect(() => {
    Promise.all([
      employeeAPI.getDepartments().catch(() => ({ data: [] })),
      employeeAPI.getPositions().catch(() => ({ data: [] })),
      employeeAPI.getWorkLocations().catch(() => ({ data: [] })),
      // WIDE NET: Fetch ALL active employees to act as potential supervisors
      employeeAPI.list({ limit: 1000, status: 'Active' }).catch(() => ({ data: [] }))
    ]).then(([d, p, l, s]) => {
      // Use your services.js safeArray tool to extract them
      setDepartments(safeArray(d, ['departments', 'items', 'data']));
      setPositions(safeArray(p, ['positions', 'items', 'data']));
      setLocations(safeArray(l, ['locations', 'workLocations', 'items', 'data']));
      
      // 🕵️ EXTRA DIAGNOSTIC: Log specifically what the supervisor list found
      const rawSupervisors = safeArray(s, ['employees', 'items', 'data']);
      console.log("🕵️ Supervisor Search Result:", rawSupervisors);
      setSupervisors(rawSupervisors);
    });
  }, []);

  const loadEmployees = useCallback(() => {
    setLoading(true);
    employeeAPI.list({ search: search || undefined, page, limit: 10 })
      .then((res) => {
        const list = safeArray(res, ['employees', 'items', 'data']);
        setEmployees(list);
        setTotal(res?.data?.data?.total || list.length || 0);
      })
      .catch(() => toast.error('Failed to load employees'))
      .finally(() => setLoading(false));
  }, [search, page]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { setPage(1); }, [search]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const payload = { ...formData };
      ['DepartmentID', 'PositionID', 'WorkLocationID'].forEach(k => { if (payload[k]) payload[k] = parseInt(payload[k], 10); });
      if (payload.SupervisorID) payload.SupervisorID = parseInt(payload.SupervisorID, 10);
      else delete payload.SupervisorID;

      const res = await employeeAPI.create(payload);
      setCredentialsDialog({
        name: `${formData.FirstName} ${formData.LastName}`,
        email: formData.Email,
        password: formData.password,
      });
      toast.success('Employee created!');
      setCreateModal(false);
      loadEmployees();
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Failed to create'); } 
    finally { setSaving(false); }
  };

  const openCreate = () => {
    setFormData({ ...initEmployee, EmployeeCode: generateEmpCode(), password: `Uni@${Math.floor(100000 + Math.random() * 900000)}` });
    setFormErrors({});
    setCreateModal(true);
  };

  return (
    <>
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}><h1>Employees</h1></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setPositionsModal(true)}><Settings size={15} /> Manage Positions</button>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Employee</button>
        </div>
      </div>

      <div className="filter-bar" style={{ marginTop: 20 }}>
        <div className="header-search" style={{ width: 260 }}><Search size={15} className="header-search-icon" /><input placeholder="Search name..." value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>

      {loading ? <SkeletonTable rows={8} /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Contact</th><th>Status</th></tr></thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.EmployeeID || emp.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{emp.FullName || `${emp.FirstName} ${emp.LastName}`}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{emp.Email}</div>
                  </td>
                  <td>{emp.Phone || '—'}</td>
                  <td><Badge status={emp.CurrentStatus}>{emp.CurrentStatus}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Add New Employee" size="modal-lg" footer={<><button className="btn btn-secondary" onClick={() => setCreateModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? <InlineSpinner /> : 'Create'}</button></>}>
        <EmployeeForm data={formData} onChange={(k, v) => setFormData(f => ({ ...f, [k]: v }))} departments={departments} positions={positions} locations={locations} supervisors={supervisors} errors={formErrors} isCreate={true} />
      </Modal>

      <PositionsManager open={positionsModal} onClose={() => setPositionsModal(false)} positions={positions} onRefresh={() => employeeAPI.getPositions().then(res => setPositions(safeArray(res, ['positions'])))} />
      <CredentialsDialog data={credentialsDialog} onClose={() => setCredentialsDialog(null)} />
    </>
  );
}