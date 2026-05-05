// src/pages/Leave/LeavePage.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Plus, Check, X, Clock, AlertCircle,
  Send, BarChart2, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { leaveAPI } from '../../api/services';
import { Modal, Badge, SkeletonCard, EmptyState, InlineSpinner, StatCard } from '../../components/common';
import { useAuth } from '../../context/AuthContext';

// Real DB status values → human-readable label
const STATUS_LABEL = {
  // Uppercase variants (SCREAMING_SNAKE_CASE)
  SUBMITTED:       'Submitted',
  PENDING_MANAGER: 'Pending Approval',
  PendingManager:  'Pending Approval',
  PendingHR:       'Pending HR',
  PENDING_HR:      'Pending HR',
  APPROVED:        'Approved',
  REJECTED:        'Rejected',
  CANCELLED:       'Cancelled',
  CANCELED:        'Cancelled',
  DRAFT:           'Draft',
  // Title case variants
  Submitted:       'Submitted',
  Pending:         'Pending Approval',
  Approved:        'Approved',
  Rejected:        'Rejected',
  Cancelled:       'Cancelled',
  // Lowercase variants
  submitted:       'Submitted',
  pending:         'Pending Approval',
  approved:        'Approved',
  rejected:        'Rejected',
  cancelled:       'Cancelled',
};

// Filter chips for All Requests (HR/Manager view)
const STATUS_OPTIONS = [
  { value: '',                label: 'All' },
  { value: 'SUBMITTED',       label: 'Submitted' },
  { value: 'PENDING_MANAGER', label: 'Pending Approval' },
  { value: 'APPROVED',        label: 'Approved' },
  { value: 'REJECTED',        label: 'Rejected' },
  { value: 'CANCELLED',       label: 'Cancelled' },
];

// Filter chips for My History (employee view)
const STATUS_HISTORY = [
  { value: '',                label: 'All' },
  { value: 'SUBMITTED',       label: 'Submitted' },
  { value: 'PENDING_MANAGER', label: 'Pending' },
  { value: 'APPROVED',        label: 'Approved' },
  { value: 'REJECTED',        label: 'Rejected' },
  { value: 'CANCELLED',       label: 'Cancelled' },
];

/* ── Leave Balance Card ── */
function BalanceCard({ balance, loading }) {
  if (loading) return <SkeletonCard />;
  // Support both camelCase (API response) and PascalCase (Prisma raw) field names
  const name      = balance.leaveTypeName  || balance.LeaveTypeName  || balance.name || balance.type || 'Leave';
  const used      = Number(balance.usedDays      ?? balance.UsedDays      ?? 0);
  const pending   = Number(balance.pendingDays   ?? balance.PendingDays   ?? 0);
  const entitled  = Number(balance.entitledDays  ?? balance.EntitledDays  ?? 0);
  const carryOver = Number(balance.carryOverDays ?? balance.CarryOverDays ?? 0);
  const adjusted  = Number(balance.adjustedDays  ?? balance.AdjustedDays  ?? 0);
  // Remaining = entitled + carryover + adjusted - used - pending
  const remaining = Number(
    balance.remainingDays ?? balance.RemainingDays ??
    Math.max(0, entitled + carryOver + adjusted - used - pending)
  );
  // Use maxDaysPerYear (full policy entitlement) as the display ceiling so a
  // prorated new-joiner with 25 entitled days still shows "25 of 30 days" not "100%".
  // Fallback to entitled+carryOver+adjusted if maxDaysPerYear not in response.
  const maxDays = Number(balance.maxDaysPerYear ?? (entitled + carryOver + adjusted));
  const total   = maxDays || (used + remaining) || 1;
  const pct     = total > 0 ? Math.round((remaining / total) * 100) : 0;

  const COLOR_MAP = {
    Annual: 'var(--blue)', Sick: 'var(--green)', Medical: 'var(--green)',
    Emergency: 'var(--red)', Accidental: 'var(--red)', Sabbatical: 'var(--purple)',
    Maternity: 'var(--purple)', Paternity: 'var(--purple)',
  };
  const color = Object.entries(COLOR_MAP).find(([k]) => name.includes(k))?.[1] || 'var(--gold)';

  return (
    <div className="stat-card">
      <div className="stat-card-accent" style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {name}
        </div>
        <CalendarDays size={18} style={{ color }} />
      </div>
      <div className="stat-card-value" style={{ color }}>{remaining}</div>
      <div className="stat-card-label">days remaining of {maxDays}</div>
      <div className="stat-card-progress" style={{ marginTop: 12 }}>
        <div className="stat-card-progress-bar" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="stat-card-meta">
        <span>{used} used{pending > 0 ? ` · ${pending} pending` : ''}{carryOver > 0 ? ` · ${carryOver} carried` : ''}</span>
        <span>{pct}%</span>
      </div>
      {remaining <= 3 && remaining > 0 && (
        <div style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: 4, fontWeight: 600 }}>
          ⚠ Low balance — {remaining} day{remaining !== 1 ? 's' : ''} remaining
        </div>
      )}
      {remaining === 0 && used > 0 && (
        <div style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: 4, fontWeight: 600 }}>
          ✕ Balance exhausted
        </div>
      )}
    </div>
  );
}

/* ── Request Row ── */
function RequestRow({ req, onAction, isManager, userRole }) {
  const [acting, setActing] = useState('');

  // Support both PascalCase (Prisma direct) and camelCase (serialized) field names
  const name   = req.LeaveType?.LeaveTypeName || req.leaveType?.LeaveTypeName
               || req.leaveTypeName || req.LeaveTypeName || req.type || '—';
  const from   = (req.StartDate   || req.startDate)   ? new Date(req.StartDate   || req.startDate).toLocaleDateString()   : '—';
  const to     = (req.EndDate     || req.endDate)     ? new Date(req.EndDate     || req.endDate).toLocaleDateString()     : '—';
  const days   = req.TotalDays ?? req.totalDays ?? req.numberOfDays ?? req.days ?? '—';
  const status = req.Status || req.status || 'SUBMITTED';
  const id     = req.LeaveRequestID || req.leaveRequestId || req.id;
  const empName = req.Employee?.FullName || req.employee?.FullName
                || req.employeeName
                || [req.employee?.firstName, req.employee?.lastName].filter(Boolean).join(' ')
                || '—';

  const act = async (action) => {
    setActing(action);
    try { await onAction(id, action); }
    finally { setActing(''); }
  };

  // Match any non-final status regardless of exact constant string value
  const isFinal = ['APPROVED','REJECTED','CANCELLED','CANCELED','Approved','Rejected','Cancelled','approved','rejected','cancelled'].includes(status);
  const isActionable  = !isFinal;
  const isCancellable = !isFinal;

  const displayLabel = STATUS_LABEL[status] || status;

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 500 }}>{name}</div>
        {(req.Reason || req.reason) && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {req.Reason || req.reason}
          </div>
        )}
      </td>
      {isManager && <td><div style={{ fontWeight: 500 }}>{empName}</div></td>}
      <td style={{ fontSize: '0.82rem' }}>{from} → {to}</td>
      <td>{days !== '—' ? `${days} day${days !== 1 ? 's' : ''}` : '—'}</td>
      <td>
        <span style={{
          display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
          background: status === 'APPROVED' ? 'rgba(34,197,94,0.15)' :
                      status === 'REJECTED' ? 'rgba(239,68,68,0.15)' :
                      status === 'CANCELLED' ? 'rgba(156,163,175,0.15)' : 'rgba(251,191,36,0.15)',
          color:      status === 'APPROVED' ? '#16a34a' :
                      status === 'REJECTED' ? '#dc2626' :
                      status === 'CANCELLED' ? '#6b7280' : '#b45309',
        }}>
          {displayLabel}
        </span>
      </td>
      {isManager && (
        <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: 160 }}>
          {(req.Reason || req.reason || '—').slice(0, 60)}{(req.Reason || req.reason || '').length > 60 ? '…' : ''}
        </td>
      )}
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          {isManager && isActionable && (
            <>
              <button className="btn btn-success btn-sm" onClick={() => act('approve')} disabled={!!acting}>
                {acting === 'approve' ? <InlineSpinner /> : <><Check size={13} /> Approve</>}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => act('reject')} disabled={!!acting}>
                {acting === 'reject' ? <InlineSpinner /> : <><X size={13} /> Reject</>}
              </button>
            </>
          )}
          {!isManager && isCancellable && (
            <button className="btn btn-ghost btn-sm" onClick={() => act('cancel')} disabled={!!acting}>
              {acting === 'cancel' ? <InlineSpinner /> : 'Cancel'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ── Submit Form ── */
function SubmitLeaveForm({ leaveTypes, onSubmit, loading }) {
  const [form, setForm]     = useState({ LeaveTypeID: '', startDate: '', endDate: '', reason: '', isHalfDay: false, documentReference: '' });
  const [errors, setErrors] = useState({});
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.LeaveTypeID) e.LeaveTypeID = 'Select a leave type';
    if (!form.startDate)   e.startDate   = 'Required';
    if (!form.endDate)     e.endDate     = 'Required';
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      e.endDate = 'End date must be after start date';
    return e;
  };

  const handle = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    // Map to exact field names expected by backend Joi schema
    onSubmit({
      LeaveTypeID:       parseInt(form.LeaveTypeID, 10),
      StartDate:         form.startDate,
      EndDate:           form.endDate,
      IsHalfDay:         form.isHalfDay,
      Reason:            form.reason || null,
      DocumentReference: form.documentReference || null,
    });
  };

  const days = form.startDate && form.endDate
    ? Math.max(0, Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1)
    : 0;

  return (
    <>
      {/* Progress steps */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
        {[{l:'Leave Type',done:!!form.LeaveTypeID},{l:'Dates',done:!!(form.startDate&&form.endDate)},{l:'Details',done:false}].map((s,i,arr) => (
          <React.Fragment key={i}>
            <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.75rem',
              color: s.done ? '#16a34a' : 'var(--text-secondary)', fontWeight: s.done ? 600 : 400 }}>
              <span style={{ width:18, height:18, borderRadius:'50%', display:'inline-flex', alignItems:'center',
                justifyContent:'center', fontSize:'0.6rem', fontWeight:700,
                background: s.done ? 'rgba(34,197,94,0.15)' : 'var(--surface-alt,#2a2a3a)',
                color: s.done ? '#16a34a' : 'var(--text-muted)', border:'1px solid', borderColor: s.done ? 'rgba(34,197,94,0.4)':'var(--border)' }}>
                {s.done ? '✓' : i+1}
              </span>
              {s.l}
            </div>
            {i < arr.length-1 && <span style={{flex:1, height:1, background:'var(--border)', margin:'0 4px'}} />}
          </React.Fragment>
        ))}
      </div>

      <div className="form-group">
        <label className="form-label required">Leave Type</label>
        <select className="form-select" value={form.LeaveTypeID} onChange={e => set('LeaveTypeID', e.target.value)}>
          <option value="">— Select a leave type —</option>
          {leaveTypes.map(t => {
            const id   = t.leaveTypeId  || t.LeaveTypeID  || t.id;
            const name = t.leaveTypeName || t.LeaveTypeName || t.name;
            return <option key={id} value={id}>{name}</option>;
          })}
        </select>
        {errors.LeaveTypeID && <div className="form-error">{errors.LeaveTypeID}</div>}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Start Date</label>
          <input className="form-input" type="date" value={form.startDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={e => set('startDate', e.target.value)} />
          {errors.startDate && <div className="form-error">{errors.startDate}</div>}
        </div>
        <div className="form-group">
          <label className="form-label required">End Date</label>
          <input className="form-input" type="date" value={form.endDate}
            min={form.startDate || new Date().toISOString().split('T')[0]}
            onChange={e => set('endDate', e.target.value)} />
          {errors.endDate && <div className="form-error">{errors.endDate}</div>}
        </div>
      </div>

      {days > 0 && (
        <div style={{ padding:'10px 14px', background:'rgba(34,197,94,0.07)',
          border:'1px solid rgba(34,197,94,0.2)', borderRadius:'var(--radius-md)',
          marginBottom:14, fontSize:'0.85rem', color:'#16a34a', fontWeight:500 }}>
          📅 <strong>{days} calendar day{days!==1?'s':''}</strong>
          <span style={{opacity:0.7,marginLeft:6,fontWeight:400}}>(net working days confirmed on submit)</span>
        </div>
      )}

      <div className="form-group">
        <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:'0.875rem',userSelect:'none'}}>
          <input type="checkbox" checked={form.isHalfDay} onChange={e => set('isHalfDay', e.target.checked)} />
          <span>Half-day <span style={{color:'var(--text-secondary)',fontSize:'0.78rem'}}>(0.5 days deducted)</span></span>
        </label>
      </div>

      <div className="form-group">
        <label className="form-label">
          Reason
          <span style={{color:'var(--text-secondary)',fontSize:'0.76rem',fontWeight:400,marginLeft:6}}>optional</span>
        </label>
        <textarea className="form-textarea" rows={2} value={form.reason}
          onChange={e => set('reason', e.target.value)}
          placeholder="Briefly describe the reason for this leave request..." />
      </div>

      <div className="form-group">
        <label className="form-label">
          Document Reference
          <span style={{color:'var(--text-secondary)',fontSize:'0.76rem',fontWeight:400,marginLeft:6}}>
            required for sick &gt;1 day · maternity · bereavement
          </span>
        </label>
        <input className="form-input" type="text" value={form.documentReference}
          onChange={e => set('documentReference', e.target.value)}
          placeholder="Medical cert no., birth cert ref., death cert no. …" />
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
        marginTop:16, paddingTop:14, borderTop:'1px solid var(--border-light)'}}>
        <button className="btn btn-ghost" type="button" onClick={() => {
          setForm({LeaveTypeID:'',startDate:'',endDate:'',reason:'',isHalfDay:false,documentReference:''});
          setErrors({});
        }} disabled={loading}>
          Clear form
        </button>
        <button className="btn btn-primary" onClick={handle}
          disabled={loading||!form.LeaveTypeID||!form.startDate||!form.endDate}>
          {loading ? <InlineSpinner /> : <><Send size={15} style={{marginRight:6}}/>Submit Request</>}
        </button>
      </div>
    </>
  );
}

/* ── Reason Modal (for reject / cancel) ── */
function ReasonModal({ title, placeholder, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <div className="form-group">
        <label className="form-label required">Reason</label>
        <textarea
          className="form-textarea"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={placeholder}
          rows={3}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Back</button>
        <button
          className="btn btn-primary"
          onClick={() => reason.trim() && onConfirm(reason.trim())}
          disabled={loading || !reason.trim()}
        >
          {loading ? <InlineSpinner /> : 'Confirm'}
        </button>
      </div>
    </Modal>
  );
}

/* ── Main Page ── */
export default function LeavePage() {
  const { user }  = useAuth();
  // Case-insensitive role check — handles 'HR Manager', 'hr', 'Admin', 'manager', etc.
  const roleStr = (user?.role || user?.Role || '').toLowerCase();
  const isManager = roleStr.includes('manager') || roleStr.includes('hr') || 
                    roleStr.includes('admin') || roleStr === 'supervisor';

  const [tab, setTab]             = useState('dashboard');
  const [balances, setBalances]   = useState([]);
  const [myRequests, setMyReqs]   = useState([]);
  const [allRequests, setAll]     = useState([]);
  const [leaveTypes, setTypes]    = useState([]);
  const [holidays, setHolidays]   = useState([]);
  const [loadBal, setLoadBal]     = useState(true);
  const [loadReq, setLoadReq]     = useState(true);
  const [loadAll, setLoadAll]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const [allFilter, setAllFilter]       = useState('');
  const [reasonModal, setReasonModal] = useState(null); // { id, action }
  const [actingReason, setActingReason] = useState(false);

  /**
   * Safely extracts an array from any API response shape.
   * sendSuccess wraps as: { success: true, data: <actual> }
   * axios wraps that as:  { data: { success: true, data: <actual> } }
   * So the axios response's .data field = { success, data: <actual> }
   * and <actual> may be: an array, or { requests: [], meta: {} }, etc.
   */
  // Safely extract array from axios response (interceptor already unwrapped envelope)
  // r.data is the actual payload — either an array or { requests: [...], meta: {} }
  const toArr = (r) => {
    if (!r) return [];
    const d = r.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.requests)) return d.requests;
    return [];
  };

  const loadData = useCallback(async () => {
    setLoadBal(true);
    setLoadReq(true);

    // Balances — sendSuccess(res, array) → interceptor → res.data = array
    leaveAPI.getMyBalances()
      .then(r => setBalances(Array.isArray(r.data) ? r.data : []))
      .catch(console.error)
      .finally(() => setLoadBal(false));

    // My requests — sendSuccess(res, result.requests) → interceptor → res.data = array
    leaveAPI.getMyRequests({ limit: 100 })
      .then(r => setMyReqs(Array.isArray(r.data) ? r.data : []))
      .catch(console.error)
      .finally(() => setLoadReq(false));

    // Leave types for dropdown
    leaveAPI.getTypes()
      .then(r => setTypes(Array.isArray(r.data) ? r.data : []))
      .catch(console.error);

    // Holidays
    leaveAPI.getHolidays()
      .then(r => setHolidays(Array.isArray(r.data) ? r.data : []))
      .catch(console.error);

    // All requests for manager/HR
    if (isManager) {
      setLoadAll(true);
      leaveAPI.listAll({ limit: 100 })
        .then(r => setAll(Array.isArray(r.data) ? r.data : []))
        .catch(console.error)
        .finally(() => setLoadAll(false));
    } else {
      setLoadAll(false);
    }
  }, [isManager]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Submit Leave Request ── */
  const handleSubmit = async (form) => {
    setSubmitting(true);
    try {
      await leaveAPI.submit(form);
      toast.success('Leave request submitted!');
      setTab('history');
      // Small delay so the tab switch renders first, then data loads
      setTimeout(() => loadData(), 100);
    } catch (err) {
      toast.error(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to submit request'
      );
    } finally { setSubmitting(false); }
  };

  /* ── Approve / Reject / Cancel ── */
  const handleAction = async (id, action, reason) => {
    try {
      if (action === 'cancel') {
        if (!reason) { setReasonModal({ id, action: 'cancel' }); return; }
        // Backend Joi schema requires CancelReason field
        await leaveAPI.cancel(id, { CancelReason: reason });
        toast.success('Request cancelled');
      } else if (action === 'approve') {
        // Backend expects { decision, comments } — maps to LEAVE_APPROVAL_DECISION constants
        await leaveAPI.approveReject(id, { decision: 'Approved', comments: '' });
        toast.success('Request approved');
      } else if (action === 'reject') {
        if (!reason) { setReasonModal({ id, action: 'reject' }); return; }
        await leaveAPI.approveReject(id, { decision: 'Rejected', comments: reason });
        toast.success('Request rejected');
      }
      loadData();
    } catch (err) {
      toast.error(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Action failed'
      );
    }
  };

  const handleReasonConfirm = async (reason) => {
    if (!reasonModal) return;
    setActingReason(true);
    try {
      await handleAction(reasonModal.id, reasonModal.action, reason);
      setReasonModal(null);
    } finally { setActingReason(false); }
  };

  const TABS = [
    { id: 'dashboard', label: 'Dashboard',    icon: BarChart2 },
    { id: 'request',   label: 'Request Leave', icon: Plus },
    { id: 'history',   label: 'My History',    icon: Clock },
    ...(isManager ? [
      { id: 'all', label: 'All Requests', icon: Calendar },
    ] : []),
  ];

  // Normalise both sides: uppercase + strip underscores
  // DB stores 'PendingManager', chips send 'PENDING_MANAGER' — both normalise to 'PENDINGMANAGER'
  const normStatus = s => (s || '').toUpperCase().replace(/_/g, '');
  const statusMatches = (reqStatus, filterValue) => {
    if (!filterValue) return true;
    const rs = normStatus(reqStatus);
    const fv = normStatus(filterValue);
    if (rs === fv) return true;
    // 'Pending Approval' chip (PENDINGMANAGER) should match ALL non-final states
    const allPending = new Set(['PENDINGMANAGER','PENDINGHR','SUBMITTED','PENDING','DRAFT','PENDINGDOCTOR']);
    if (fv === 'PENDINGMANAGER' && allPending.has(rs)) return true;
    return false;
  };

  const filteredMyReqs  = myRequests.filter(r =>
    statusMatches(r.Status || r.status, historyFilter)
  );
  const filteredAllReqs = allRequests.filter(r =>
    statusMatches(r.Status || r.status, allFilter)
  );

  return (
    <>
      {reasonModal && (
        <ReasonModal
          title={reasonModal.action === 'cancel' ? 'Cancel Leave Request' : 'Reject Leave Request'}
          placeholder={reasonModal.action === 'cancel' ? 'Reason for cancellation...' : 'Reason for rejection...'}
          onConfirm={handleReasonConfirm}
          onClose={() => setReasonModal(null)}
          loading={actingReason}
        />
      )}

      <div className="page-header">
        <h1>Leave Management</h1>
        <p>Manage leave requests, balances, and approvals</p>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`tab-btn ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {tab === 'dashboard' && (
        <>
          <div className="grid-4" style={{ marginBottom: 28 }}>
            {loadBal
              ? [1,2,3,4].map(i => <SkeletonCard key={i} />)
              : balances.length > 0
                ? balances.slice(0, 4).map((b, i) => <BalanceCard key={i} balance={b} loading={false} />)
                : (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
                    <CalendarDays size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
                    <div style={{ fontWeight: 500 }}>No leave balances found</div>
                    <div style={{ fontSize: '0.8rem', marginTop: 4 }}>Contact HR to initialize your leave balance for this year.</div>
                  </div>
                )
            }
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <div className="card-title">Pending Requests</div>
                <span className="badge badge-pending">
                  {myRequests.filter(r =>
                    ['Pending','PENDING_MANAGER','PENDING_HR','SUBMITTED'].includes(r.status || r.Status)
                  ).length}
                </span>
              </div>
              {myRequests.filter(r =>
                ['Pending','PENDING_MANAGER','PENDING_HR','SUBMITTED'].includes(r.status || r.Status)
              ).length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No pending requests
                </div>
              ) : (
                myRequests
                  .filter(r => ['Pending','PENDING_MANAGER','PENDING_HR','SUBMITTED'].includes(r.status || r.Status))
                  .map((req, i) => {
                    const name = req.leaveTypeName || req.LeaveTypeName || req.leaveType?.LeaveTypeName || '—';
                    const days = req.numberOfDays ?? req.TotalDays ?? req.totalDays ?? req.days ?? '—';
                    const from = (req.startDate || req.StartDate) ? new Date(req.startDate || req.StartDate).toLocaleDateString() : '—';
                    const to   = (req.endDate   || req.EndDate)   ? new Date(req.endDate   || req.EndDate).toLocaleDateString()   : '—';
                    return (
                      <div key={i} style={{
                        padding: '12px 0', borderBottom: '1px solid var(--border-light)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{from} — {to}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 600 }}>{days !== '—' ? `${days} days` : '—'}</div>
                          <Badge status="Pending">Pending</Badge>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">Upcoming Holidays</div>
              </div>
              {holidays.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No holidays scheduled
                </div>
              ) : (
                holidays
                  .filter(h => new Date(h.HolidayDate || h.holidayDate || h.date) >= new Date())
                  .slice(0, 6)
                  .map((h, i) => (
                    <div key={i} style={{
                      padding: '10px 0', borderBottom: '1px solid var(--border-light)',
                      display: 'flex', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                          {h.HolidayName || h.holidayName || h.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Public Holiday</div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 600 }}>
                        {(h.HolidayDate || h.holidayDate || h.date)
                          ? new Date(h.HolidayDate || h.holidayDate || h.date)
                              .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '—'}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Request Leave ── */}
      {tab === 'request' && (
        <div style={{ maxWidth: 600 }}>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Submit Leave Request</div>
                <div className="card-subtitle">Fill in the details below to request time off</div>
              </div>
            </div>
            {leaveTypes.length === 0 && (
              <div style={{
                padding: '10px 14px', marginBottom: 12,
                background: 'rgba(240,180,41,0.08)', borderRadius: 'var(--radius-md)',
                fontSize: '0.82rem', color: 'var(--text-secondary)',
              }}>
                <AlertCircle size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                No leave types available. Contact HR to configure leave types.
              </div>
            )}
            <SubmitLeaveForm leaveTypes={leaveTypes} onSubmit={handleSubmit} loading={submitting} />
          </div>
        </div>
      )}

      {/* ── My History ── */}
      {tab === 'history' && (
        <>
          <div className="filter-bar">
            {STATUS_HISTORY.map(({ value, label }) => (
              <button
                key={value}
                className={`filter-chip ${historyFilter === value ? 'active' : ''}`}
                onClick={() => setHistoryFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {loadReq ? (
            <SkeletonCard />
          ) : filteredMyReqs.length === 0 ? (
            <div className="card">
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                No leave requests found
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Leave Type</th>
                    <th>Period</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMyReqs.map((req, i) => (
                    <RequestRow
                      key={req.LeaveRequestID || req.leaveRequestId || req.id || i}
                      req={req}
                      onAction={handleAction}
                      isManager={false}
                      userRole={user?.role}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── All Requests (HR/Admin) ── */}
      {tab === 'all' && isManager && (
        <>
          <div className="filter-bar">
            {STATUS_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                className={`filter-chip ${allFilter === value ? 'active' : ''}`}
                onClick={() => setAllFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {loadAll ? (
            <SkeletonCard />
          ) : filteredAllReqs.length === 0 ? (
            <div className="card">
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                {allFilter ? `No ${allFilter.toLowerCase()} requests found` : 'No leave requests found'}
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Leave Type</th>
                    <th>Employee</th>
                    <th>Period</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllReqs.map((req, i) => (
                    <RequestRow
                      key={req.LeaveRequestID || req.id || i}
                      req={req}
                      onAction={handleAction}
                      isManager={true}
                      userRole={user?.role}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}