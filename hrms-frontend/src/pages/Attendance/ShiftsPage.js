// src/pages/Attendance/ShiftsPage.js
import React, { useState, useEffect } from 'react';
import { attendanceAPI, employeeAPI } from '../../api/services';
import { Badge, SkeletonTable, SkeletonCard, InlineSpinner, Modal } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { Plus, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ShiftsPage() {
  const { user }    = useAuth();
  const isManager   = ['Manager','HR','Admin'].includes(user?.role || user?.Role);

  const [shifts,      setShifts]      = useState([]);
  const [myShift,     setMyShift]     = useState(null);   // always loaded for everyone
  const [employees,   setEmployees]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [myShiftLoading, setMyShiftLoading] = useState(true);
  const [assignModal, setAssignModal] = useState(false);
  const [form,        setForm]        = useState({ EmployeeID: '', ShiftID: '', EffectiveFrom: '' });
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    // Always fetch the current user's own shift regardless of role
    // res.data IS the payload directly — no { success, data } envelope
    attendanceAPI.getTodayStatus()
      .then(res => {
        const d = res.data;
        setMyShift(d?.todayShift || null);
      })
      .catch(() => {})
      .finally(() => setMyShiftLoading(false));

    if (isManager) {
      const toArr = (d, keys) => {
        if (Array.isArray(d)) return d;
        for (const k of keys) if (Array.isArray(d?.[k])) return d[k];
        return [];
      };
      Promise.all([
        attendanceAPI.listShifts(),
        employeeAPI.list({ limit: 100 }),
      ]).then(([s, e]) => {
        setShifts(toArr(s.data, ['shifts', 'data']));
        setEmployees(toArr(e.data, ['employees', 'data']));
      }).catch(() => {}).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [isManager]);

  const handleAssign = async () => {
    if (!form.EmployeeID || !form.ShiftID || !form.EffectiveFrom) {
      toast.error('All fields are required');
      return;
    }
    setSaving(true);
    try {
      await attendanceAPI.assignShift({
        EmployeeID:    parseInt(form.EmployeeID),
        ShiftID:       parseInt(form.ShiftID),
        EffectiveFrom: form.EffectiveFrom,
        AssignedBy:    user?.EmployeeID || user?.employeeId || user?.id,
      });
      toast.success('Shift assigned successfully');
      setAssignModal(false);
      setForm({ EmployeeID: '', ShiftID: '', EffectiveFrom: '' });
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to assign shift');
    } finally { setSaving(false); }
  };

  const fmtTime = (t) => {
    if (!t) return '—';
    if (/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(t)) return t;
    try {
      const d = new Date(t.includes('T') ? t : `1970-01-01T${t}`);
      return isNaN(d) ? t : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch { return t; }
  };

  // ── My Shift card — shown for everyone ───────────────────────────────────
  const MyShiftCard = () => (
    <div style={{ maxWidth: isManager ? '100%' : 480 }}>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">My Shift</div>
            <div className="card-subtitle">Your currently assigned schedule</div>
          </div>
          {myShift && <Badge status="Active">Active</Badge>}
        </div>

        {myShiftLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <div className="spinner" />
          </div>
        ) : myShift ? (
          <>
            {[
              { label: 'Shift Name',     value: myShift.shiftName     || myShift.ShiftName      },
              { label: 'Start Time',     value: fmtTime(myShift.startTime  || myShift.StartTime) },
              { label: 'End Time',       value: fmtTime(myShift.endTime    || myShift.EndTime)   },
              { label: 'Expected Hours', value: (myShift.expectedHours || myShift.ExpectedHours)
                  ? `${myShift.expectedHours || myShift.ExpectedHours}h` : '—' },
              { label: 'Break',          value: myShift.nextBreak?.durationMin
                  ? `${myShift.nextBreak.durationMin} min` : '—' },
            ].map(({ label, value }) => (
              <div className="info-row" key={label}>
                <span className="info-row-label">{label}</span>
                <span className="info-row-value">{value || '—'}</span>
              </div>
            ))}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 30 }}>
            <Clock size={36} style={{ color: 'var(--text-muted)', marginBottom: 10, opacity: 0.4 }} />
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>No shift assigned yet</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {isManager ? 'Ask another HR admin to assign your shift.' : 'Contact your HR manager to get a shift assigned.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Employee view ─────────────────────────────────────────────────────────
  if (!isManager) {
    return (
      <>
        <div className="page-header">
          <h1>My Shift</h1>
          <p>Your currently assigned work schedule</p>
        </div>
        <MyShiftCard />
      </>
    );
  }

  // ── Manager / HR view ─────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Shifts &amp; Schedule</h1>
          <p>All configured shifts and employee assignments</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAssignModal(true)}>
          <Plus size={15} /> Assign Shift
        </button>
      </div>

      {/* Manager's own shift — shown at the top */}
      <div style={{ marginBottom: 24, maxWidth: 480 }}>
        <MyShiftCard />
      </div>

      {/* All shifts table */}
      {loading ? <SkeletonTable rows={4} /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Shift Name</th>
                <th>Code</th>
                <th>Start</th>
                <th>End</th>
                <th>Hours</th>
                <th>Break</th>
                <th>Overnight</th>
                <th>Night</th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    No shifts found — add them via SQL Server
                  </td>
                </tr>
              ) : shifts.map((s, i) => (
                <tr key={s.ShiftID || i}>
                  <td style={{ fontWeight: 500 }}>{s.ShiftName || '—'}</td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4 }}>
                      {s.ShiftCode || '—'}
                    </span>
                  </td>
                  <td>{fmtTime(s.StartTime)}</td>
                  <td>{fmtTime(s.EndTime)}</td>
                  <td>{s.ExpectedHours ? `${s.ExpectedHours}h` : '—'}</td>
                  <td>{s.BreakDurationMin ? `${s.BreakDurationMin} min` : '—'}</td>
                  <td><Badge status={s.IsOvernight ? 'Active' : 'Inactive'}>{s.IsOvernight ? 'Yes' : 'No'}</Badge></td>
                  <td><Badge status={s.IsNightShift ? 'Active' : 'Inactive'}>{s.IsNightShift ? 'Yes' : 'No'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign Shift Modal */}
      <Modal
        open={assignModal}
        onClose={() => setAssignModal(false)}
        title="Assign Shift to Employee"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAssignModal(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAssign} disabled={saving}>
              {saving ? <InlineSpinner /> : 'Assign'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label required">Employee</label>
          <select className="form-select" value={form.EmployeeID}
            onChange={e => setForm(f => ({ ...f, EmployeeID: e.target.value }))}>
            <option value="">Select employee...</option>
            {employees.map(emp => (
              <option key={emp.EmployeeID || emp.id} value={emp.EmployeeID || emp.id}>
                {emp.FullName || `${emp.FirstName} ${emp.LastName}`}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label required">Shift</label>
          <select className="form-select" value={form.ShiftID}
            onChange={e => setForm(f => ({ ...f, ShiftID: e.target.value }))}>
            <option value="">Select shift...</option>
            {shifts.map(s => (
              <option key={s.ShiftID} value={s.ShiftID}>
                {s.ShiftName} ({fmtTime(s.StartTime)} – {fmtTime(s.EndTime)})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label required">Effective From</label>
          <input className="form-input" type="date" value={form.EffectiveFrom}
            onChange={e => setForm(f => ({ ...f, EffectiveFrom: e.target.value }))} />
        </div>
      </Modal>
    </>
  );
}