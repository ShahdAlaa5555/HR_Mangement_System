// src/pages/Employee/EmployeePage.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, MoreHorizontal, Edit2,
  UserX, Eye, Mail, Phone,
  ChevronLeft, ChevronRight, Copy, CheckCheck, Settings,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeAPI } from '../../api/services';
import { Modal, Badge, SkeletonTable, EmptyState, ConfirmDialog, InlineSpinner } from '../../components/common';

/* ── Credentials Dialog — shown to HR after creating an employee ── */
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
    const text = `University HR System — Login Credentials\n\nName: ${data.name}\nEmail: ${data.email}\nPassword: ${data.password}\nLogin URL: ${window.location.origin}/login\n\nPlease log in and change your password from Settings.`;
    navigator.clipboard.writeText(text);
    setCopied('all');
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title" style={{ color: 'var(--green)' }}>
              ✅ Employee Created Successfully
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              Share these login credentials with <strong>{data.name}</strong>
            </p>
          </div>
        </div>

        <div className="modal-body">
          {/* Warning */}
          <div style={{
            padding: '10px 14px', marginBottom: 16,
            background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--amber)',
          }}>
            ⚠️ Save these credentials now — the password won't be shown again.
          </div>

          {/* Credentials rows */}
          <div style={{
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 14,
          }}>
            {[
              { label: 'Full Name',  value: data.name,                          mono: false },
              { label: 'Email',      value: data.email,                         mono: false },
              { label: 'Password',   value: data.password,                      mono: true  },
              { label: 'Login URL',  value: `${window.location.origin}/login`,  mono: false },
            ].map(({ label, value, mono }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderBottom: '1px solid var(--border-light)',
              }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
                  <div style={{
                    fontSize: '0.9rem', fontWeight: 500,
                    fontFamily: mono ? 'monospace' : 'var(--font-body)',
                    color: label === 'Password' ? 'var(--gold)' : 'var(--text-primary)',
                    letterSpacing: mono ? '0.08em' : 'normal',
                  }}>{value}</div>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => copy(value, label)} title={`Copy ${label}`}>
                  {copied === label ? <CheckCheck size={14} style={{ color: 'var(--green)' }} /> : <Copy size={14} />}
                </button>
              </div>
            ))}
          </div>

          {/* Copy all */}
          <button className="btn btn-secondary w-full" onClick={copyAll} style={{ justifyContent: 'center' }}>
            {copied === 'all' ? <><CheckCheck size={15} /> Copied!</> : <><Copy size={15} /> Copy All as Text</>}
          </button>

          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: 'var(--green-dim)', border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--green)',
          }}>
            💡 The employee should change this password after first login via <strong>Settings → Security</strong>.
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ── Positions Manager Modal ── */
const DEFAULT_POSITIONS = [
  { code: 'PROF',     title: 'Professor'                },
  { code: 'ASSOC',    title: 'Associate Professor'       },
  { code: 'ASST',     title: 'Assistant Professor'       },
  { code: 'LECT',     title: 'Lecturer'                  },
  { code: 'TA',       title: 'Teaching Assistant'        },
  { code: 'RA',       title: 'Research Assistant'        },
  { code: 'HEAD',     title: 'Department Head'           },
  { code: 'DEAN',     title: 'Dean'                      },
  { code: 'HR-MGR',   title: 'HR Manager'                },
  { code: 'HR-SPEC',  title: 'HR Specialist'             },
  { code: 'IT-ENG',   title: 'IT Engineer'               },
  { code: 'FIN',      title: 'Finance Officer'           },
  { code: 'ADMIN',    title: 'Administrative Officer'    },
  { code: 'SEC',      title: 'Secretary'                 },
  { code: 'LAB-TECH', title: 'Lab Technician'            },
  { code: 'LIB',      title: 'Librarian'                 },
  { code: 'SECURITY', title: 'Security Officer'          },
  { code: 'MAINT',    title: 'Maintenance Staff'         },
];

function PositionsManager({ open, onClose, positions, onRefresh }) {
  const [newCode,  setNewCode]  = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [seeding,  setSeeding]  = useState(false);

  const create = async (code, title) => {
    await employeeAPI.createPosition({ PositionCode: code.toUpperCase(), PositionTitle: title, IsActive: true });
  };

  const handleAdd = async () => {
    if (!newCode.trim() || !newTitle.trim()) { toast.error('Both code and title are required'); return; }
    setSaving(true);
    try {
      await create(newCode.trim(), newTitle.trim());
      toast.success(`Position "${newTitle}" added`);
      setNewCode(''); setNewTitle('');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to add position');
    } finally { setSaving(false); }
  };

  const handleSeedAll = async () => {
    setSeeding(true);
    const existingCodes = positions.map(p => (p.PositionCode || p.positionCode || '').toUpperCase());
    const toAdd = DEFAULT_POSITIONS.filter(p => !existingCodes.includes(p.code.toUpperCase()));
    if (toAdd.length === 0) { toast('All default positions already exist'); setSeeding(false); return; }
    let added = 0;
    for (const p of toAdd) {
      try { await create(p.code, p.title); added++; } catch {}
    }
    toast.success(`Added ${added} positions`);
    onRefresh();
    setSeeding(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Positions" size="modal-lg">
      {/* Seed button */}
      <div style={{
        padding: '12px 16px', marginBottom: 20,
        background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Quick Setup</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Add {DEFAULT_POSITIONS.length} standard university positions at once
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleSeedAll} disabled={seeding}>
          {seeding ? <InlineSpinner /> : '⚡ Add All Defaults'}
        </button>
      </div>

      {/* Add custom position */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <div style={{ flex: '0 0 130px' }}>
          <label className="form-label">Code</label>
          <input className="form-input" placeholder="e.g. PROF" value={newCode}
            onChange={e => setNewCode(e.target.value.toUpperCase())}
            style={{ fontFamily: 'monospace' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="form-label">Position Title</label>
          <input className="form-input" placeholder="e.g. Professor" value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
            {saving ? <InlineSpinner /> : <><Plus size={15} /> Add</>}
          </button>
        </div>
      </div>

      {/* Existing positions */}
      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Current Positions ({positions.length})
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        {positions.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No positions yet — use "Add All Defaults" above
          </div>
        ) : positions.map((p, i) => {
          const code  = p.PositionCode  || p.positionCode  || '—';
          const title = p.PositionTitle || p.positionTitle || p.name || '—';
          return (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderBottom: '1px solid var(--border-light)',
            }}>
              <span style={{ fontWeight: 500 }}>{title}</span>
              <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)',
                background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4 }}>{code}</span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* ── helpers ── */
// Schema field names (Employee table):
// FirstName, LastName, Email, Phone, DepartmentID, PositionID,
// WorkLocationID, StartDate, CurrentStatus, Gender, EmploymentType,
// DateOfBirth, Nationality, MaritalStatus
const initEmployee = {
  EmployeeCode:     '',
  FirstName:        '',
  LastName:         '',
  Email:            '',
  Phone:            '',
  DepartmentID:     '',
  PositionID:       '',
  WorkLocationID:   '',
  StartDate:        '',
  CurrentStatus:    'Active',
  Gender:           '',
  EmploymentType:   'Full-Time',
  DateOfBirth:      '',
  Nationality:      '',
  MaritalStatus:    'Single',
  password:         '',   // initial password — sent to backend to create UserCredential
};

// Auto-generate employee code: EMP + timestamp suffix
const generateEmpCode = () => `EMP${Date.now().toString().slice(-6)}`;

function EmployeeForm({ data, onChange, departments, positions, locations, errors, isCreate = false }) {
  // Schema: Department → DepartmentID, DepartmentName
  // Schema: Position  → PositionID,   PositionTitle
  // Schema: WorkLocation → WorkLocationID, LocationName
  const getId = (o) => {
    if (!o) return '';
    return (
      o.DepartmentID    ?? o.departmentID    ?? o.departmentId    ??
      o.PositionID      ?? o.positionID      ?? o.positionId      ??
      o.WorkLocationID  ?? o.workLocationID  ?? o.workLocationId  ??
      o.id              ?? o.ID              ??
      ''
    );
  };

  const getName = (o) => {
    if (!o) return '';
    return (
      o.DepartmentName  ?? o.departmentName  ??   // Department
      o.PositionTitle   ?? o.positionTitle   ??   // Position (uses Title not Name!)
      o.LocationName    ?? o.locationName    ??   // WorkLocation
      o.name            ?? o.Name            ??
      o.title           ?? o.Title           ??
      ''
    );
  };

  const field = (k, label, type = 'text', required = false) => (
    <div className="form-group">
      <label className={`form-label ${required ? 'required' : ''}`}>{label}</label>
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

  const select = (k, label, opts, required = false) => (
    <div className="form-group">
      <label className={`form-label ${required ? 'required' : ''}`}>{label}</label>
      <select className="form-select" value={data[k] || ''} onChange={e => onChange(k, e.target.value)}>
        <option value="">— Select {label} —</option>
        {opts.map((o, i) => {
          const id  = getId(o);
          const nm  = getName(o);
          return <option key={`${id}-${i}`} value={id}>{nm || `Option ${i + 1}`}</option>;
        })}
      </select>
      {errors[k] && <div className="form-error">{errors[k]}</div>}
      {opts.length === 0 && (
        <div className="form-hint" style={{ color: 'var(--amber)' }}>
          ⚠ No {label.toLowerCase()} options loaded
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Employee Code with auto-generate */}
      <div className="form-group">
        <label className="form-label required">Employee Code</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            type="text"
            value={data.EmployeeCode || ''}
            onChange={e => onChange('EmployeeCode', e.target.value.toUpperCase())}
            placeholder="e.g. EMP001"
            style={{ flex: 1, fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onChange('EmployeeCode', generateEmpCode())}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Auto-generate
          </button>
        </div>
        {errors.EmployeeCode && <div className="form-error">{errors.EmployeeCode}</div>}
        <div className="form-hint">Must be unique across all employees</div>
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
        {select('DepartmentID',   'Department',    departments, true)}
        {select('PositionID',     'Position',      positions,   true)}
      </div>
      <div className="form-row">
        {select('WorkLocationID', 'Work Location', locations)}
        {field('StartDate', 'Start Date', 'date', true)}
      </div>
      <div className="form-row">
        {field('DateOfBirth', 'Date of Birth', 'date', true)}
        {select('Gender', 'Gender', [
          { id: 'Male',   name: 'Male'   },
          { id: 'Female', name: 'Female' },
          { id: 'Other',  name: 'Other'  },
        ], true)}
      </div>
      <div className="form-row">
        {select('EmploymentType', 'Employment Type', [
          { id: 'Full-Time',  name: 'Full-Time'  },
          { id: 'Part-Time',  name: 'Part-Time'  },
          { id: 'Contract',   name: 'Contract'   },
          { id: 'Intern',     name: 'Intern'     },
        ], true)}
        {select('MaritalStatus', 'Marital Status', [
          { id: 'Single',   name: 'Single'   },
          { id: 'Married',  name: 'Married'  },
          { id: 'Divorced', name: 'Divorced' },
          { id: 'Widowed',  name: 'Widowed'  },
        ])}
      </div>
      <div className="form-row">
        {field('Nationality', 'Nationality', 'text', true)}
        {select('CurrentStatus', 'Status', [
          { id: 'Active',   name: 'Active'   },
          { id: 'Inactive', name: 'Inactive' },
          { id: 'OnLeave',  name: 'On Leave' },
        ], true)}
      </div>

      {/* Initial password — only shown when creating a new employee */}
      {isCreate && (
        <div className="form-group" style={{ marginTop: 4 }}>
          <div style={{
            padding: '10px 14px', marginBottom: 12,
            background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--amber)',
          }}>
            ⚠️ After creating, a <strong>credentials card</strong> will appear. Share the email
            and temporary password with the employee so they can log in and change it.
          </div>
          <label className="form-label required">Temporary Password</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              type="text"
              value={data.password || ''}
              onChange={e => onChange('password', e.target.value)}
              style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '0.08em', fontSize: '0.95rem' }}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const digits = Math.floor(100000 + Math.random() * 900000);
                onChange('password', `Uni@${digits}`);
              }}
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              🔄 Regenerate
            </button>
          </div>
          {errors.password && <div className="form-error">{errors.password}</div>}
          <div className="form-hint">
            Auto-generated. You can customise it — must have uppercase, lowercase and a number.
          </div>
        </div>
      )}
    </>
  );
}

export default function EmployeePage() {
  const [employees, setEmployees]   = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions]   = useState([]);
  const [locations, setLocations]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]             = useState(1);
  const [total, setTotal]           = useState(0);
  const LIMIT = 10;

  // Modals
  const [createModal, setCreateModal]   = useState(false);
  const [editModal, setEditModal]       = useState(null);  // employee obj
  const [viewModal, setViewModal]       = useState(null);
  const [deleteModal, setDeleteModal]   = useState(null);
  const [formData, setFormData]         = useState(initEmployee);
  const [formErrors, setFormErrors]     = useState({});
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);

  // Open row dropdown
  const [openMenu, setOpenMenu] = useState(null);
  // Success dialog — shows credentials to HR after creation
  const [credentialsDialog, setCredentialsDialog] = useState(null);
  // Positions manager
  const [positionsModal, setPositionsModal] = useState(false);

  // Load lookups once
  useEffect(() => {
    const toArr = (data, keys) => {
      if (Array.isArray(data)) return data;
      for (const k of keys) if (Array.isArray(data?.[k])) return data[k];
      return [];
    };
    Promise.all([
      employeeAPI.getDepartments(),
      employeeAPI.getPositions(),
      employeeAPI.getWorkLocations(),
    ]).then(([d, p, l]) => {
      // Interceptor already unwrapped → res.data is the payload
      setDepartments(toArr(d.data, ['departments','department','items']));
      setPositions(toArr(p.data,   ['positions','position','items']));
      setLocations(toArr(l.data,   ['locations','workLocations','items']));
      console.log('📋 Departments:', d.data);
      console.log('📋 Positions:',   p.data);
    }).catch(err => console.error('Lookup load failed:', err));
  }, []);

  const loadEmployees = useCallback(() => {
    setLoading(true);
    employeeAPI.list({
      search:       search       || undefined,
      departmentId: deptFilter   || undefined,
      status:       statusFilter || undefined,
      page,
      limit: LIMIT,
    })
      .then(({ data }) => {
        // Interceptor unwrapped → data is the payload
        const list = Array.isArray(data) ? data : data?.employees || data?.data || [];
        setEmployees(list);
        setTotal(data?.total || data?.count || list.length || 0);
      })
      .catch(() => toast.error('Failed to load employees'))
      .finally(() => setLoading(false));
  }, [search, deptFilter, statusFilter, page]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // Debounced search
  useEffect(() => { setPage(1); }, [search, deptFilter, statusFilter]);

  const validateForm = (isCreate = false) => {
    const e = {};
    if (!formData.EmployeeCode)   e.EmployeeCode   = 'Required — must be unique';
    if (!formData.FirstName)      e.FirstName      = 'Required';
    if (!formData.LastName)       e.LastName       = 'Required';
    if (!formData.Email)          e.Email          = 'Required';
    else if (!formData.Email.toLowerCase().endsWith('@university.edu'))
                                  e.Email          = 'Must be a @university.edu email address';
    if (!formData.DepartmentID)   e.DepartmentID   = 'Required';
    if (!formData.PositionID)     e.PositionID     = 'Required';
    if (!formData.StartDate)      e.StartDate      = 'Required';
    if (!formData.DateOfBirth)    e.DateOfBirth    = 'Required';
    if (!formData.Gender)         e.Gender         = 'Required';
    if (!formData.Nationality)    e.Nationality    = 'Required';
    if (!formData.WorkLocationID) e.WorkLocationID = 'Required';
    if (isCreate) {
      if (!formData.password)                        e.password = 'Required';
      else if (formData.password.length < 8)         e.password = 'At least 8 characters';
      else if (!/[A-Z]/.test(formData.password))     e.password = 'Must include an uppercase letter';
      else if (!/[0-9]/.test(formData.password))     e.password = 'Must include a number';
    }
    return e;
  };

  // Generate a secure temporary password: Uni + 6 random digits + !
  const generateTempPassword = () => {
    const digits = Math.floor(100000 + Math.random() * 900000);
    return `Uni@${digits}`;
  };

  const handleCreate = async () => {
    const e = validateForm(true);
    if (Object.keys(e).length) { setFormErrors(e); return; }
    setSaving(true);

    // Send all fields including password — backend now accepts it via updated schema
    const { ...employeePayload } = formData;

    try {
      const res     = await employeeAPI.create(employeePayload);
      const payload = res.data?.data || res.data;
      const created = payload?.employee || payload;
      const empId   = created?.EmployeeID || created?.employeeID || created?.id;

      // Store the intended password so HR can set it manually in DB
      setCredentialsDialog({
        name:     `${formData.FirstName} ${formData.LastName}`,
        email:    formData.Email,
        password: formData.password,  // the password HR chose — must be set in DB
        empId,
        needsDbStep: true,
      });

      toast.success('Employee profile created!');
      setCreateModal(false);
      setFormData({ ...initEmployee, EmployeeCode: generateEmpCode(), password: generateTempPassword() });
      loadEmployees();
    } catch (err) {
      console.error('❌ CREATE ERROR:', JSON.stringify(err.response?.data, null, 2));
      const details = err.response?.data?.error?.details;
      if (details?.length) {
        details.forEach(d => toast.error(`${d.field}: ${d.message}`, { duration: 5000 }));
      } else {
        toast.error(err.response?.data?.error?.message || 'Failed to create employee');
      }
    } finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    const e = validateForm(false);
    if (Object.keys(e).length) { setFormErrors(e); return; }
    setSaving(true);
    try {
      const id = editModal.EmployeeID || editModal.employeeID || editModal.id;
      await employeeAPI.update(id, formData);
      toast.success('Employee updated');
      setEditModal(null);
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to update');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const id = deleteModal.EmployeeID || deleteModal.employeeID || deleteModal.id;
      await employeeAPI.terminate(id, { reason: 'Terminated via HRMS' });
      toast.success('Employee terminated');
      setDeleteModal(null);
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to terminate');
    } finally { setDeleting(false); }
  };

  const openEdit = (emp) => {
    setFormData({
      ...initEmployee,
      FirstName:      emp.FirstName      || emp.firstName      || '',
      LastName:       emp.LastName       || emp.lastName       || '',
      Email:          emp.Email          || emp.email          || '',
      Phone:          emp.Phone          || emp.phone          || '',
      DepartmentID:   emp.DepartmentID   || emp.departmentID   || emp.departmentId   || '',
      PositionID:     emp.PositionID     || emp.positionID     || emp.positionId     || '',
      WorkLocationID: emp.WorkLocationID || emp.workLocationID || emp.workLocationId || '',
      StartDate:      emp.StartDate      || emp.startDate      || emp.hireDate       || '',
      CurrentStatus:  emp.CurrentStatus  || emp.currentStatus  || emp.status         || 'Active',
      Gender:         emp.Gender         || emp.gender         || '',
      EmploymentType: emp.EmploymentType || emp.employmentType || 'Full-Time',
      DateOfBirth:    emp.DateOfBirth    || emp.dateOfBirth    || '',
      Nationality:    emp.Nationality    || emp.nationality    || '',
      MaritalStatus:  emp.MaritalStatus  || emp.maritalStatus  || 'Single',
    });
    setFormErrors({});
    setEditModal(emp);
    setOpenMenu(null);
  };
  const openCreate = () => {
    setFormData({
      ...initEmployee,
      EmployeeCode: generateEmpCode(),
      password:     generateTempPassword(),
    });
    setFormErrors({});
    setCreateModal(true);
  };

  const totalPages = Math.ceil(total / LIMIT);
  const deptName  = (id) => departments.find(d => (d.DepartmentID || d.departmentID || d.departmentId || d.id) === id)?.DepartmentName  || departments.find(d => String(d.DepartmentID || d.departmentID || d.id) === String(id))?.DepartmentName  || id || '—';
  const posName   = (id) => positions.find(p  => (p.PositionID   || p.positionID   || p.positionId   || p.id) === id)?.PositionTitle   || positions.find(p  => String(p.PositionID   || p.positionID   || p.id) === String(id))?.PositionTitle   || id || '—';

  return (
    <>
      {/* Header */}
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Employees</h1>
          <p>{total} total employees</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setPositionsModal(true)}>
            <Settings size={15} /> Manage Positions
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add Employee
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ marginTop: 20 }}>
        <div className="header-search" style={{ width: 260 }}>
          <Search size={15} className="header-search-icon" />
          <input
            placeholder="Search name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 180 }}
        >
          <option value="">All Departments</option>
          {departments.map(d => (
            <option key={d.id || d.departmentId} value={d.id || d.departmentId}>{d.name}</option>
          ))}
        </select>
        {['', 'Active', 'Inactive', 'OnLeave'].map(s => (
          <button
            key={s}
            className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s || 'All Status'}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={8} />
      ) : employees.length === 0 ? (
        <EmptyState
          icon={Users => <span style={{ fontSize: 40 }}>👥</span>}
          title="No employees found"
          description="Try adjusting your filters or add a new employee"
          action={<button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Employee</button>}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Position</th>
                  <th>Hire Date</th>
                  <th>Status</th>
                  <th>Contact</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const id   = emp.EmployeeID   || emp.employeeID   || emp.id;
                  const name = `${emp.FirstName || emp.firstName || ''} ${emp.LastName || emp.lastName || ''}`.trim() || emp.FullName || emp.fullName || emp.name || '—';
                  const email      = emp.Email       || emp.email;
                  const status     = emp.CurrentStatus || emp.currentStatus || emp.status || 'Active';
                  const hireDate   = emp.StartDate    || emp.startDate    || emp.hireDate;
                  const deptId     = emp.DepartmentID || emp.departmentID || emp.departmentId;
                  const posId      = emp.PositionID   || emp.positionID   || emp.positionId;
                  return (
                    <tr key={id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="avatar" style={{ width: 34, height: 34, fontSize: '0.8rem', borderRadius: 8 }}>
                            {name[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{email}</div>
                          </div>
                        </div>
                      </td>
                      <td>{deptName(deptId)}</td>
                      <td>{posName(posId) || emp.Position?.PositionTitle || emp.position?.positionTitle || '—'}</td>
                      <td>{hireDate ? new Date(hireDate).toLocaleDateString() : '—'}</td>
                      <td><Badge status={status}>{status}</Badge></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {email && <a href={`mailto:${email}`} className="btn btn-ghost btn-icon btn-sm" title="Email"><Mail size={14} /></a>}
                          {(emp.Phone || emp.phone) && <a href={`tel:${emp.Phone || emp.phone}`} className="btn btn-ghost btn-icon btn-sm" title="Call"><Phone size={14} /></a>}
                        </div>
                      </td>
                      <td style={{ position: 'relative' }}>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => setOpenMenu(openMenu === id ? null : id)}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenu === id && (
                          <div style={{
                            position: 'absolute', right: 0, top: '110%', zIndex: 100,
                            background: 'var(--bg-surface)', border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)', padding: 6, minWidth: 140,
                            boxShadow: 'var(--shadow-lg)',
                          }}>
                            {[
                              { label: 'View Details', icon: Eye,   onClick: () => { setViewModal(emp); setOpenMenu(null); } },
                              { label: 'Edit',          icon: Edit2, onClick: () => openEdit(emp) },
                              { label: 'Terminate',     icon: UserX, onClick: () => { setDeleteModal(emp); setOpenMenu(null); }, danger: true },
                            ].map(({ label, icon: Icon, onClick, danger }) => (
                              <button key={label} onClick={onClick} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                width: '100%', padding: '8px 10px',
                                background: 'none', border: 'none', cursor: 'pointer',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.83rem', fontFamily: 'var(--font-body)',
                                color: danger ? 'var(--red)' : 'var(--text-secondary)',
                              }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                              >
                                <Icon size={14} /> {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Page {page} of {totalPages}
              </span>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <ChevronLeft size={14} />
              </button>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="Add New Employee"
        size="modal-lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreateModal(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? <InlineSpinner /> : 'Create Employee'}
            </button>
          </>
        }
      >
        <EmployeeForm
          data={formData}
          onChange={(k, v) => { setFormData(f => ({ ...f, [k]: v })); setFormErrors(e => ({ ...e, [k]: '' })); }}
          departments={departments}
          positions={positions}
          locations={locations}
          errors={formErrors}
          isCreate={true}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editModal}
        onClose={() => setEditModal(null)}
        title="Edit Employee"
        size="modal-lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditModal(null)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleUpdate} disabled={saving}>
              {saving ? <InlineSpinner /> : 'Save Changes'}
            </button>
          </>
        }
      >
        <EmployeeForm
          data={formData}
          onChange={(k, v) => { setFormData(f => ({ ...f, [k]: v })); setFormErrors(e => ({ ...e, [k]: '' })); }}
          departments={departments}
          positions={positions}
          locations={locations}
          errors={formErrors}
        />
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title="Employee Details" size="modal-lg">
        {viewModal && (
          <div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
              <div className="avatar" style={{ width: 64, height: 64, fontSize: '1.5rem', borderRadius: 12 }}>
                {(`${viewModal.firstName || viewModal.name || '?'}`)[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>
                  {`${viewModal.firstName || ''} ${viewModal.lastName || ''}`.trim() || viewModal.name}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{viewModal.email}</div>
                <Badge status={viewModal.status} style={{ marginTop: 6 }}>{viewModal.status}</Badge>
              </div>
            </div>
            {[
              { label: 'Phone',         value: viewModal.phone },
              { label: 'Department',    value: deptName(viewModal.departmentId) },
              { label: 'Position',      value: posName(viewModal.positionId) || viewModal.position?.name || viewModal.jobTitle },
              { label: 'Hire Date',     value: viewModal.hireDate ? new Date(viewModal.hireDate).toLocaleDateString() : '—' },
              { label: 'Gender',        value: viewModal.gender },
              { label: 'National ID',   value: viewModal.nationalId },
              { label: 'Work Location', value: viewModal.workLocation?.name },
            ].map(({ label, value }) => (
              <div className="info-row" key={label}>
                <span className="info-row-label">{label}</span>
                <span className="info-row-value">{value || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Positions Manager */}
      <PositionsManager
        open={positionsModal}
        onClose={() => setPositionsModal(false)}
        positions={positions}
        onRefresh={() => {
          employeeAPI.getPositions().then((res) => {
            const p = res.data?.data || res.data;
            const arr = Array.isArray(p) ? p : p?.positions || p?.data || [];
            setPositions(arr);
          });
        }}
      />

      {/* Credentials Dialog */}
      <CredentialsDialog
        data={credentialsDialog}
        onClose={() => setCredentialsDialog(null)}
      />

      {/* Delete/Terminate Confirm */}
      <ConfirmDialog
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Terminate Employee"
        message={`Are you sure you want to terminate ${deleteModal?.firstName || 'this employee'}? This action marks them as inactive.`}
        variant="danger"
      />
    </>
  );
}