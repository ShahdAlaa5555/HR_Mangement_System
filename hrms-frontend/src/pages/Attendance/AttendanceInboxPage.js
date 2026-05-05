// src/pages/Attendance/AttendanceInboxPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { attendanceAPI } from '../../api/services';
import { Badge, SkeletonTable, InlineSpinner, Modal } from '../../components/common';
import { Check, X, Plus, Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

// ── Helper: extract array from res.data regardless of shape ───────────────
// Backend returns raw Prisma data — NO { success, data } envelope.
// res.data may be: an array directly, or { corrections: [] }, or { requests: [] }
function extractArray(res, keys = []) {
  const d = res?.data;
  if (!d) return [];
  if (Array.isArray(d)) return d;
  for (const k of keys) {
    if (Array.isArray(d[k])) return d[k];
  }
  return [];
}

// ── Format time helper ────────────────────────────────────────────────────
const fmtTime = (v) => {
  if (!v) return '—';
  try { const d = new Date(v); return isNaN(d) ? v : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
  catch { return v; }
};

const fmtDate = (v) => {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return v; }
};

// ── Overtime Request Modal ────────────────────────────────────────────────
function OvertimeRequestModal({ open, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ OvertimeDate: '', EstimatedHours: '', Reason: '', IsNighttime: false });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.OvertimeDate)    e.OvertimeDate   = 'Required';
    if (!form.EstimatedHours)  e.EstimatedHours = 'Required';
    else if (isNaN(form.EstimatedHours) || Number(form.EstimatedHours) <= 0) e.EstimatedHours = 'Must be positive';
    else if (Number(form.EstimatedHours) > 2) e.EstimatedHours = 'Max 2 hours/day (Egyptian Labor Law)';
    if (!form.Reason.trim())   e.Reason = 'Required';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSubmit({ ...form, EstimatedHours: Number(form.EstimatedHours) });
  };

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  return (
    <Modal open={open} onClose={onClose} title="Submit Overtime Request"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? <InlineSpinner /> : <><Clock size={14} /> Submit</>}
          </button>
        </>
      }
    >
      <div style={{ padding: '10px 14px', marginBottom: 16, background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--blue)' }}>
        Submit a request for overtime. Your manager will review and approve or reject it.
      </div>
      <div className="form-group">
        <label className="form-label required">Overtime Date</label>
        <input className="form-input" type="date" value={form.OvertimeDate}
          min={new Date().toISOString().split('T')[0]}
          onChange={e => set('OvertimeDate', e.target.value)} />
        {errors.OvertimeDate && <div className="form-error">{errors.OvertimeDate}</div>}
      </div>
      <div className="form-group">
        <label className="form-label required">Estimated Hours</label>
        <input className="form-input" type="number" step="0.5" min="0.5" max="2"
          placeholder="e.g. 1.5" value={form.EstimatedHours}
          onChange={e => set('EstimatedHours', e.target.value)} />
        {errors.EstimatedHours && <div className="form-error">{errors.EstimatedHours}</div>}
        <div className="form-hint">Max 2 hours/day — Egyptian Labor Law Art. 130</div>
      </div>
      <div className="form-group">
        <label className="form-label required">Reason</label>
        <textarea className="form-textarea" placeholder="Explain why overtime is needed..."
          value={form.Reason} onChange={e => set('Reason', e.target.value)} />
        {errors.Reason && <div className="form-error">{errors.Reason}</div>}
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.IsNighttime} onChange={e => set('IsNighttime', e.target.checked)} />
          <span className="form-label" style={{ marginBottom: 0 }}>Nighttime overtime (200% pay)</span>
        </label>
      </div>
    </Modal>
  );
}

// ── Correction Request Modal (employee submitting for their own record) ───
// attendedDates: array of { AttendanceID, AttendanceDate, CheckInTime, CheckOutTime, Status }
function CorrectionRequestModal({ open, onClose, onSubmit, loading, attendedDates }) {
  const [form, setForm] = useState({ AttendanceDate: '', Reason: '', CorrectedCheckIn: '', CorrectedCheckOut: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) setForm({ AttendanceDate: '', Reason: '', CorrectedCheckIn: '', CorrectedCheckOut: '' });
  }, [open]);

  const validate = () => {
    const e = {};
    if (!form.AttendanceDate) e.AttendanceDate = 'Required';
    if (!form.Reason.trim())  e.Reason = 'Required';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    // Combine "YYYY-MM-DD" + "HH:mm" → ISO datetime string the backend expects
    const toISO = (dateStr, timeStr) => {
      if (!timeStr) return null;
      return new Date(`${dateStr}T${timeStr}:00`).toISOString();
    };

    onSubmit({
      AttendanceDate:    form.AttendanceDate,
      Reason:            form.Reason,
      CorrectedCheckIn:  toISO(form.AttendanceDate, form.CorrectedCheckIn),
      CorrectedCheckOut: toISO(form.AttendanceDate, form.CorrectedCheckOut),
    });
  };

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  // Only show dates that have an actual attendance record (have AttendanceID)
  const validDates = (attendedDates || [])
    .filter(r => (r.AttendanceID || r.attendanceId) && !['NoRecord','Weekend'].includes(r.Status || r.status))
    .sort((a, b) => new Date(b.AttendanceDate || b.date) - new Date(a.AttendanceDate || a.date));

  const toYMD = (v) => {
    if (!v) return '';
    try { return new Date(v).toISOString().slice(0, 10); }
    catch { return ''; }
  };

  const selectedRecord = validDates.find(r => toYMD(r.AttendanceDate || r.date) === form.AttendanceDate);
  const existingCheckIn  = selectedRecord ? toYMD(selectedRecord.CheckInTime  || selectedRecord.checkInTime)  ? new Date(selectedRecord.CheckInTime  || selectedRecord.checkInTime).toTimeString().slice(0,5)  : '' : '';
  const existingCheckOut = selectedRecord ? toYMD(selectedRecord.CheckOutTime || selectedRecord.checkOutTime) ? new Date(selectedRecord.CheckOutTime || selectedRecord.checkOutTime).toTimeString().slice(0,5) : '' : '';

  return (
    <Modal open={open} onClose={onClose} title="Submit Attendance Correction"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !form.AttendanceDate || !form.Reason.trim()}>
            {loading ? <InlineSpinner /> : <><AlertTriangle size={14} /> Submit</>}
          </button>
        </>
      }
    >
      <div style={{ padding: '10px 14px', marginBottom: 16, background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--amber)' }}>
        Only days with an existing check-in record can be corrected.
      </div>

      <div className="form-group">
        <label className="form-label required">Attendance Date</label>
        {validDates.length === 0 ? (
          <div style={{ padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            No attendance records found this month.
          </div>
        ) : (
          <select className="form-select" value={form.AttendanceDate}
            onChange={e => set('AttendanceDate', e.target.value)}>
            <option value="">Select a date...</option>
            {validDates.map(r => {
              const ymd    = toYMD(r.AttendanceDate || r.date);
              const status = r.Status || r.status;
              const label  = new Date(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <option key={ymd} value={ymd}>{label} — {status}</option>
              );
            })}
          </select>
        )}
        {errors.AttendanceDate && <div className="form-error">{errors.AttendanceDate}</div>}
      </div>

      {/* Show existing times as hint when a date is selected */}
      {selectedRecord && (existingCheckIn || existingCheckOut) && (
        <div style={{ padding: '6px 12px', marginBottom: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Current record: Check-in {existingCheckIn || '—'} · Check-out {existingCheckOut || '—'}
        </div>
      )}

      <div className="form-group">
        <label className="form-label required">Reason</label>
        <textarea className="form-textarea" placeholder="Explain what needs to be corrected..."
          value={form.Reason} onChange={e => set('Reason', e.target.value)} />
        {errors.Reason && <div className="form-error">{errors.Reason}</div>}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Corrected Check-In</label>
          <input className="form-input" type="time" value={form.CorrectedCheckIn}
            onChange={e => set('CorrectedCheckIn', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Corrected Check-Out</label>
          <input className="form-input" type="time" value={form.CorrectedCheckOut}
            onChange={e => set('CorrectedCheckOut', e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function AttendanceInboxPage() {
  const { user }  = useAuth();
  const isManager = ['Manager', 'HR', 'Admin'].includes(user?.role || user?.Role);

  // Shared state
  const [tab,        setTab]        = useState(isManager ? 'corrections' : 'overtime');
  const [loading,    setLoading]    = useState(true);
  const [acting,     setActing]     = useState({});

  // Manager state
  const [corrections, setCorrections] = useState([]);
  const [overtime,    setOvertime]    = useState([]);

  // Employee state
  const [myOvertimeReqs,   setMyOvertimeReqs]   = useState([]);
  const [myCorrectionReqs, setMyCorrectionReqs] = useState([]);
  const [myCalData,        setMyCalData]        = useState([]); // attendance records for correction modal

  // Modals
  const [otModal,   setOtModal]   = useState(false);
  const [corrModal, setCorrModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);

    if (isManager) {
      // Fetch both corrections and overtime in parallel
      Promise.all([
        attendanceAPI.listCorrections({ status: 'Pending' }),
        attendanceAPI.listOvertimeRequests({ status: 'Pending' }),
      ]).then(([corrRes, otRes]) => {
        // Use res.data directly — no envelope wrapper
        setCorrections(extractArray(corrRes, ['corrections', 'data']));
        setOvertime(extractArray(otRes, ['requests', 'overtimeRequests', 'data']));
      }).catch(() => {}).finally(() => setLoading(false));

    } else {
      // Employee: fetch independently so one failure doesn't kill the other.
      attendanceAPI.listOvertimeRequests()
        .then(res => setMyOvertimeReqs(extractArray(res, ['requests', 'overtimeRequests', 'data'])))
        .catch(() => {})
        .finally(() => setLoading(false));

      attendanceAPI.listMyCorrections()
        .then(res => setMyCorrectionReqs(extractArray(res, ['corrections', 'data'])))
        .catch(() => {});

      // Fetch last 3 months of calendar data so the correction modal has attended dates
      const now = new Date();
      const months = [
        { year: now.getFullYear(), month: now.getMonth() + 1 },
        { year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), month: now.getMonth() === 0 ? 12 : now.getMonth() },
        { year: now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear(), month: now.getMonth() <= 1 ? now.getMonth() + 11 : now.getMonth() - 1 },
      ];
      Promise.all(months.map(({ year, month }) => attendanceAPI.getCalendarMe({ year, month })))
        .then(results => {
          const all = results.flatMap(res => extractArray(res, ['records', 'attendances']));
          setMyCalData(all);
        })
        .catch(() => {});
    }
  }, [isManager, user]);

  useEffect(() => { load(); }, [load]);

  // ── Employee: submit overtime ─────────────────────────────────────────
  const handleSubmitOvertime = async (formData) => {
    setSubmitting(true);
    try {
      const empId = user?.EmployeeID || user?.employeeId || user?.employee_id || user?.id;
      if (!empId) throw new Error('Could not determine your employee ID. Please contact HR.');
      await attendanceAPI.submitOvertime({
        EmployeeID:     empId,
        RequestedBy:    empId,
        OvertimeDate:   formData.OvertimeDate,
        EstimatedHours: formData.EstimatedHours,
        Reason:         formData.Reason,
        IsNighttime:    formData.IsNighttime,
      });
      toast.success('Overtime request submitted! Your manager will review it.');
      setOtModal(false);
      load();
    } catch (err) {
      toast.error(err.message || err.response?.data?.error?.message || 'Failed to submit');
    } finally { setSubmitting(false); }
  };

  // ── Employee: submit correction ───────────────────────────────────────
  const handleSubmitCorrection = async (formData) => {
    setSubmitting(true);
    try {
      const toYMD = (v) => { try { return new Date(v).toISOString().slice(0, 10); } catch { return null; } };

      // Find record from already-loaded calendar data — no extra API call needed
      const record = myCalData.find(r => {
        const recDate = toYMD(r.AttendanceDate || r.date || r.attendanceDate);
        return recDate === formData.AttendanceDate;
      });

      const attId = record?.AttendanceID || record?.attendanceId;
      if (!attId) {
        toast.error('Could not find attendance record. Please contact HR.');
        setSubmitting(false);
        return;
      }

      await attendanceAPI.submitCorrection(attId, {
        Reason:            formData.Reason,
        CorrectedCheckIn:  formData.CorrectedCheckIn  || null,
        CorrectedCheckOut: formData.CorrectedCheckOut || null,
      });
      toast.success('Correction request submitted!');
      setCorrModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to submit correction');
    } finally { setSubmitting(false); }
  };

  // ── Manager: act on correction ────────────────────────────────────────
  const actOnCorrection = async (id, approved) => {
    const status = approved ? 'Approved' : 'Rejected';
    setActing(a => ({ ...a, [id]: status }));
    try {
      await attendanceAPI.reviewCorrection(id, { Status: status, ReviewNote: '' });
      toast.success(`Correction ${status.toLowerCase()}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Action failed');
    } finally { setActing(a => ({ ...a, [id]: null })); }
  };

  // ── Manager: act on overtime ──────────────────────────────────────────
  const actOnOvertime = async (id, approved) => {
    const key = `ot_${id}`;
    setActing(a => ({ ...a, [key]: approved ? 'approve' : 'reject' }));
    try {
      await attendanceAPI.approveOvertime(id, { approved });
      toast.success(`Overtime ${approved ? 'approved' : 'rejected'}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Action failed');
    } finally { setActing(a => ({ ...a, [key]: null })); }
  };

  const pendingCorr = corrections.filter(c => (c.Status || c.status) === 'Pending').length;
  const pendingOT   = overtime.filter(o => (o.Status   || o.status) === 'Pending').length;

  // ════════════════════════════════════════════════════════════════════════
  // EMPLOYEE VIEW — unified "My Requests" page
  // ════════════════════════════════════════════════════════════════════════
  if (!isManager) {
    const TABS = [
      { id: 'overtime',    label: `Overtime (${myOvertimeReqs.length})`   },
      { id: 'corrections', label: `Corrections (${myCorrectionReqs.length})` },
    ];

    return (
      <>
        <div className="page-header-row">
          <div className="page-header" style={{ marginBottom: 0 }}>
            <h1>My Requests</h1>
            <p>Submit and track your overtime and correction requests</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setCorrModal(true)}>
              <AlertTriangle size={15} /> Correction Request
            </button>
            <button className="btn btn-primary" onClick={() => setOtModal(true)}>
              <Plus size={15} /> Overtime Request
            </button>
          </div>
        </div>

        <div className="tabs">
          {TABS.map(({ id, label }) => (
            <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {loading ? <SkeletonTable rows={4} /> : (
          <>
            {/* ── Overtime tab ── */}
            {tab === 'overtime' && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">My Overtime Requests</div>
                </div>
                {myOvertimeReqs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <Clock size={36} style={{ opacity: 0.4, marginBottom: 12 }} />
                    <div style={{ fontSize: '0.9rem', marginBottom: 6 }}>No overtime requests yet</div>
                    <button className="btn btn-primary btn-sm" onClick={() => setOtModal(true)}>
                      <Plus size={14} /> Request Overtime
                    </button>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Date</th><th>Est. Hours</th><th>Reason</th><th>Nighttime</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {myOvertimeReqs.map((r, i) => {
                          const status = r.Status || r.status || 'Pending';
                          return (
                            <tr key={r.OvertimeRequestID || r.overtimeRequestId || i}>
                              <td>{fmtDate(r.OvertimeDate || r.overtimeDate)}</td>
                              <td style={{ color: 'var(--gold)', fontWeight: 600 }}>
                                {(r.EstimatedHours || r.estimatedHours) ? `${Number(r.EstimatedHours || r.estimatedHours).toFixed(1)}h` : '—'}
                              </td>
                              <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: 220 }}>
                                <span className="truncate" style={{ display: 'block' }}>{r.Reason || r.reason || '—'}</span>
                              </td>
                              <td>
                                <Badge status={(r.IsNighttime || r.isNighttime) ? 'Active' : 'Inactive'}>
                                  {(r.IsNighttime || r.isNighttime) ? 'Yes' : 'No'}
                                </Badge>
                              </td>
                              <td><Badge status={status}>{status}</Badge></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Corrections tab ── */}
            {tab === 'corrections' && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">My Correction Requests</div>
                </div>
                {myCorrectionReqs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <AlertTriangle size={36} style={{ opacity: 0.4, marginBottom: 12 }} />
                    <div style={{ fontSize: '0.9rem', marginBottom: 6 }}>No correction requests yet</div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setCorrModal(true)}>
                      <AlertTriangle size={14} /> Submit Correction
                    </button>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Date</th><th>Reason</th><th>Req. Check-In</th><th>Req. Check-Out</th><th>Reviewed By</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {myCorrectionReqs.map((c, i) => {
                          const status  = c.Status  || c.status  || 'Pending';
                          const attDate = c.Attendance?.AttendanceDate || c.AttendanceDate || c.attendanceDate;
                          return (
                            <tr key={c.CorrectionID || c.correctionId || i}>
                              <td>{fmtDate(attDate)}</td>
                              <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: 220 }}>
                                <span className="truncate" style={{ display: 'block' }}>{c.Reason || c.reason || '—'}</span>
                              </td>
                              <td style={{ color: 'var(--green)', fontWeight: 500 }}>
                                {fmtTime(c.CorrectedCheckIn || c.correctedCheckIn)}
                              </td>
                              <td style={{ color: 'var(--red)', fontWeight: 500 }}>
                                {fmtTime(c.CorrectedCheckOut || c.correctedCheckOut)}
                              </td>
                              <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                {c.Reviewer?.FullName || '—'}
                                {(c.ReviewNote || c.reviewNote) && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    {c.ReviewNote || c.reviewNote}
                                  </div>
                                )}
                              </td>
                              <td><Badge status={status}>{status}</Badge></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* How it works */}
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header"><div className="card-title">How Requests Work</div></div>
              {[
                { step: '1', label: 'Submit',         desc: 'Fill in the form and submit your overtime or correction request.' },
                { step: '2', label: 'Manager Reviews', desc: 'Your manager receives it in their inbox and approves or rejects it.' },
                { step: '3', label: 'Notification',   desc: 'You will be notified of the decision.' },
                { step: '4', label: 'Payroll Impact',  desc: 'Approved overtime is included in payroll at 135% (normal) or 200% (holiday). Approved corrections update your attendance record.' },
              ].map(({ step, label, desc }) => (
                <div key={step} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--gold-glow)', border: '1px solid rgba(240,180,41,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)',
                  }}>{step}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{label}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <OvertimeRequestModal
          open={otModal}
          onClose={() => setOtModal(false)}
          onSubmit={handleSubmitOvertime}
          loading={submitting}
        />
        <CorrectionRequestModal
          open={corrModal}
          onClose={() => setCorrModal(false)}
          onSubmit={handleSubmitCorrection}
          loading={submitting}
          attendedDates={myCalData}
        />
      </>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // MANAGER VIEW — unified inbox with both request types
  // ════════════════════════════════════════════════════════════════════════
  return (
    <>
      <div className="page-header">
        <h1>Manager Inbox</h1>
        <p>Review and action pending attendance requests from your team</p>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'corrections' ? 'active' : ''}`} onClick={() => setTab('corrections')}>
          Correction Requests
          {pendingCorr > 0 && <span className="nav-badge" style={{ marginLeft: 6 }}>{pendingCorr}</span>}
        </button>
        <button className={`tab-btn ${tab === 'overtime' ? 'active' : ''}`} onClick={() => setTab('overtime')}>
          Overtime Requests
          {pendingOT > 0 && <span className="nav-badge" style={{ marginLeft: 6 }}>{pendingOT}</span>}
        </button>
      </div>

      {loading ? <SkeletonTable rows={5} /> : (
        <>
          {/* ── Manager: Corrections ── */}
          {tab === 'corrections' && (
            corrections.length === 0 ? (
              <div className="card">
                <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
                  No pending correction requests
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Req. Check-In</th>
                      <th>Req. Check-Out</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corrections.map((c, i) => {
                      const id     = c.CorrectionID || c.correctionID || c.id;
                      const status = c.Status || c.status || 'Pending';
                      const attDate = c.Attendance?.AttendanceDate || c.AttendanceDate || c.attendanceDate;
                      return (
                        <tr key={id || i}>
                          <td style={{ fontWeight: 500 }}>
                            {c.Employee?.FullName || c.employeeName || '—'}
                            {c.Employee?.EmployeeCode && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.Employee.EmployeeCode}</div>
                            )}
                          </td>
                          <td>{fmtDate(attDate)}</td>
                          <td style={{ color: 'var(--green)', fontWeight: 500 }}>
                            {fmtTime(c.CorrectedCheckIn || c.correctedCheckIn)}
                          </td>
                          <td style={{ color: 'var(--red)', fontWeight: 500 }}>
                            {fmtTime(c.CorrectedCheckOut || c.correctedCheckOut)}
                          </td>
                          <td style={{ maxWidth: 200 }}>
                            <span className="truncate" style={{ display: 'block', fontSize: '0.82rem' }}>
                              {c.Reason || c.reason || '—'}
                            </span>
                          </td>
                          <td><Badge status={status}>{status}</Badge></td>
                          <td>
                            {status === 'Pending' && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-success btn-sm"
                                  onClick={() => actOnCorrection(id, true)}
                                  disabled={!!acting[id]}>
                                  {acting[id] === 'Approved' ? <InlineSpinner /> : <><Check size={13} /> Approve</>}
                                </button>
                                <button className="btn btn-danger btn-sm"
                                  onClick={() => actOnCorrection(id, false)}
                                  disabled={!!acting[id]}>
                                  {acting[id] === 'Rejected' ? <InlineSpinner /> : <><X size={13} /> Reject</>}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Manager: Overtime ── */}
          {tab === 'overtime' && (
            overtime.length === 0 ? (
              <div className="card">
                <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
                  No pending overtime requests
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Est. Hours</th>
                      <th>Reason</th>
                      <th>Nighttime</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overtime.map((ot, i) => {
                      const id     = ot.OvertimeRequestID || ot.overtimeRequestID || ot.id;
                      const status = ot.Status || ot.status || 'Pending';
                      const key    = `ot_${id}`;
                      return (
                        <tr key={id || i}>
                          <td style={{ fontWeight: 500 }}>
                            {ot.Employee?.FullName || ot.employeeName || '—'}
                            {ot.Employee?.EmployeeCode && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ot.Employee.EmployeeCode}</div>
                            )}
                          </td>
                          <td>{fmtDate(ot.OvertimeDate || ot.overtimeDate)}</td>
                          <td style={{ color: 'var(--gold)', fontWeight: 600 }}>
                            {(ot.EstimatedHours || ot.estimatedHours) ? `${ot.EstimatedHours || ot.estimatedHours}h` : '—'}
                          </td>
                          <td style={{ maxWidth: 200 }}>
                            <span className="truncate" style={{ display: 'block', fontSize: '0.82rem' }}>
                              {ot.Reason || ot.reason || '—'}
                            </span>
                          </td>
                          <td>
                            <Badge status={(ot.IsNighttime || ot.isNighttime) ? 'Active' : 'Inactive'}>
                              {(ot.IsNighttime || ot.isNighttime) ? 'Yes' : 'No'}
                            </Badge>
                          </td>
                          <td><Badge status={status}>{status}</Badge></td>
                          <td>
                            {status === 'Pending' && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-success btn-sm"
                                  onClick={() => actOnOvertime(id, true)}
                                  disabled={!!acting[key]}>
                                  {acting[key] === 'approve' ? <InlineSpinner /> : <><Check size={13} /> Approve</>}
                                </button>
                                <button className="btn btn-danger btn-sm"
                                  onClick={() => actOnOvertime(id, false)}
                                  disabled={!!acting[key]}>
                                  {acting[key] === 'reject' ? <InlineSpinner /> : <><X size={13} /> Reject</>}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </>
  );
}