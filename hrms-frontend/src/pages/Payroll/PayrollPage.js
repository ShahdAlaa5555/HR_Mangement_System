// src/pages/Payroll/PayrollPage.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, DollarSign, AlertTriangle, FileText,
  Play, CheckCircle, Download, Plus, RefreshCw,
  TrendingUp, Users, Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { payrollAPI } from '../../api/services';
import { Badge, SkeletonCard, SkeletonTable, Modal, InlineSpinner } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

/* ── Dashboard KPI card ── */
function PayKPI({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-card-accent" style={{ background: color }} />
      <div className="stat-card-icon" style={{ background: `${color}22` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="stat-card-value">{value ?? '—'}</div>
      <div className="stat-card-label">{label}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/* ── Payslip viewer ── */
function PayslipModal({ payslip, onClose }) {
  if (!payslip) return null;
  return (
    <Modal open={!!payslip} onClose={onClose} title="Payslip Details" size="modal-lg">
      <div style={{
        background: 'var(--bg-base)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>Payslip</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Period: {payslip.payPeriodStart ? `${new Date(payslip.payPeriodStart).toLocaleDateString()} – ${new Date(payslip.payPeriodEnd).toLocaleDateString()}` : payslip.period || '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Badge status={payslip.status || 'Finalized'}>{payslip.status || 'Finalized'}</Badge>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Earnings</div>
            {[
              { label: 'Basic Salary',    value: payslip.basicSalary    || payslip.baseSalary  },
              { label: 'Allowances',      value: payslip.totalAllowances || payslip.allowances },
              { label: 'Overtime',        value: payslip.overtimePay    || payslip.overtime     },
              { label: 'Shift Diff.',     value: payslip.shiftDiffPay                           },
              { label: 'Gross Pay',       value: payslip.grossPay       || payslip.gross,       bold: true },
            ].map(({ label, value, bold }) => value !== undefined && (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-light)', fontWeight: bold ? 700 : 400 }}>
                <span style={{ fontSize: '0.82rem', color: bold ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontSize: '0.82rem', color: bold ? 'var(--green)' : 'var(--text-primary)' }}>
                  {value != null ? Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—'}
                </span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Deductions</div>
            {[
              { label: 'Income Tax',      value: payslip.incomeTax      || payslip.tax          },
              { label: 'Social Security', value: payslip.socialSecurity || payslip.ssDeduction  },
              { label: 'Other Deductions',value: payslip.otherDeductions                        },
              { label: 'Total Deductions',value: payslip.totalDeductions || payslip.deductions,  bold: true },
            ].map(({ label, value, bold }) => value !== undefined && (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-light)', fontWeight: bold ? 700 : 400 }}>
                <span style={{ fontSize: '0.82rem', color: bold ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontSize: '0.82rem', color: bold ? 'var(--red)' : 'var(--text-primary)' }}>
                  {value != null ? Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Net Pay */}
        <div style={{
          marginTop: 16, padding: '14px 16px',
          background: 'var(--gold-glow)', border: '1px solid rgba(240,180,41,0.3)',
          borderRadius: 'var(--radius-md)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>NET PAY</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)' }}>
            {payslip.netPay != null ? Number(payslip.netPay).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—'}
          </span>
        </div>
      </div>
    </Modal>
  );
}

/* ── Main ── */
export default function PayrollPage() {
  const { user }   = useAuth();
  const isPayroll  = ['Payroll','HR','Admin'].includes(user?.role);

  const [tab, setTab]           = useState('dashboard');
  const [dashboard, setDash]    = useState(null);
  const [runs, setRuns]         = useState([]);
  const [myPayslips, setMySlips]= useState([]);
  const [exceptions, setExcept] = useState([]);
  const [selectedSlip, setSlip] = useState(null);
  const [loadDash, setLoadDash] = useState(true);
  const [loadRuns, setLoadRuns] = useState(true);
  const [createRunModal, setCreateRunModal] = useState(false);
  const [runForm, setRunForm]   = useState({ period: '', payPeriodStart: '', payPeriodEnd: '', description: '' });
  const [saving, setSaving]     = useState(false);

  const load = useCallback(() => {
    const toArr = (data, keys) => {
      if (Array.isArray(data)) return data;
      for (const k of keys) if (Array.isArray(data?.[k])) return data[k];
      return [];
    };

    if (isPayroll) {
      payrollAPI.getDashboard()
        .then(({ data }) => { setDash(data); setLoadDash(false); })
        .catch(() => setLoadDash(false));

      payrollAPI.listRuns({ limit: 10 })
        .then(({ data }) => { setRuns(toArr(data, ['runs','payrollRuns'])); setLoadRuns(false); })
        .catch(() => setLoadRuns(false));

      payrollAPI.listExceptions()
        .then(({ data }) => setExcept(toArr(data, ['exceptions'])))
        .catch(() => {});
    } else {
      setLoadDash(false); setLoadRuns(false);
    }

    payrollAPI.getMyPayslips()
      .then(({ data }) => setMySlips(toArr(data, ['payslips'])))
      .catch(() => {});
  }, [isPayroll]);

  useEffect(() => { load(); }, [load]);

  const handleRunAction = async (runId, action) => {
    try {
      if (action === 'process')  await payrollAPI.processRun(runId, {});
      if (action === 'approve')  await payrollAPI.approveRun(runId, {});
      if (action === 'finalize') await payrollAPI.finalizeRun(runId);
      if (action === 'payslips') await payrollAPI.generatePayslips(runId);
      toast.success(`Run ${action}d successfully`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || `Failed to ${action}`);
    }
  };

  const handleCreateRun = async () => {
    setSaving(true);
    try {
      await payrollAPI.createRun(runForm);
      toast.success('Payroll run created');
      setCreateRunModal(false);
      setRunForm({ period: '', payPeriodStart: '', payPeriodEnd: '', description: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create run');
    } finally { setSaving(false); }
  };

  const handleResolveException = async (id) => {
    try {
      await payrollAPI.resolveException(id, { resolution: 'Resolved manually' });
      toast.success('Exception resolved');
      load();
    } catch { toast.error('Failed'); }
  };

  const TABS = [
    { id: 'dashboard', label: 'Dashboard'  },
    { id: 'myslips',   label: 'My Payslips' },
    ...(isPayroll ? [
      { id: 'runs',       label: 'Payroll Runs' },
      { id: 'exceptions', label: `Exceptions${exceptions.length ? ` (${exceptions.length})` : ''}` },
    ] : []),
  ];

  const fmt = (v) => v != null ? Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—';

  return (
    <>
      <div className="page-header">
        <h1>Payroll</h1>
        <p>Manage payroll runs, view payslips, and track exceptions</p>
      </div>

      <div className="tabs">
        {TABS.map(({ id, label }) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {tab === 'dashboard' && (
        <>
          {loadDash ? (
            <div className="grid-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
          ) : dashboard ? (
            <>
              <div className="grid-4" style={{ marginBottom: 24 }}>
                <PayKPI icon={DollarSign} color="var(--green)"  label="Total Payroll"     value={fmt(dashboard.totalPayroll || dashboard.totalNetPay)} sub="This period" />
                <PayKPI icon={Users}      color="var(--blue)"   label="Employees Paid"    value={dashboard.employeesPaid   || dashboard.headcount     || '—'} />
                <PayKPI icon={CreditCard} color="var(--gold)"   label="Active Runs"       value={dashboard.activeRuns      || dashboard.pendingRuns   || '—'} />
                <PayKPI icon={AlertTriangle} color="var(--red)" label="Open Exceptions"   value={dashboard.openExceptions  || exceptions.length       || '—'} sub="Needs attention" />
              </div>

              {dashboard.monthlySummary && (
                <div className="card">
                  <div className="card-header"><div className="card-title">Monthly Payroll Trend</div></div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dashboard.monthlySummary || []} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="netPay" fill="var(--gold)" radius={[4,4,0,0]} name="Net Pay" />
                      <Bar dataKey="grossPay" fill="var(--blue-dim)" radius={[4,4,0,0]} name="Gross" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              {isPayroll ? 'No payroll data available' : 'You do not have access to payroll dashboard'}
            </div>
          )}
        </>
      )}

      {/* ── My Payslips ── */}
      {tab === 'myslips' && (
        <>
          {myPayslips.length === 0 ? (
            <div className="card">
              <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                <FileText size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                <div>No payslips found</div>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Period</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {myPayslips.map((slip, i) => (
                    <tr key={slip.id || i}>
                      <td>
                        {slip.payPeriodStart
                          ? `${new Date(slip.payPeriodStart).toLocaleDateString('en-US',{month:'short',year:'numeric'})}`
                          : slip.period || '—'}
                      </td>
                      <td style={{ color: 'var(--green)', fontWeight: 500 }}>{fmt(slip.grossPay || slip.gross)}</td>
                      <td style={{ color: 'var(--red)'   }}>{fmt(slip.totalDeductions || slip.deductions)}</td>
                      <td style={{ color: 'var(--gold)',  fontWeight: 700 }}>{fmt(slip.netPay)}</td>
                      <td><Badge status={slip.status || 'Finalized'}>{slip.status || 'Finalized'}</Badge></td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSlip(slip)}>
                          <FileText size={13} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Payroll Runs (HR/Payroll) ── */}
      {tab === 'runs' && isPayroll && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setCreateRunModal(true)}>
              <Plus size={16} /> New Run
            </button>
          </div>

          {loadRuns ? <SkeletonTable /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Run ID</th><th>Period</th><th>Status</th><th>Total</th><th>Employees</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {runs.map((run, i) => {
                    const status = run.status || 'Draft';
                    return (
                      <tr key={run.id || i}>
                        <td style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                          #{run.id || run.runId || i + 1}
                        </td>
                        <td>
                          {run.payPeriodStart
                            ? `${new Date(run.payPeriodStart).toLocaleDateString()} – ${new Date(run.payPeriodEnd || run.payPeriodStart).toLocaleDateString()}`
                            : run.period || '—'}
                        </td>
                        <td><Badge status={status}>{status}</Badge></td>
                        <td style={{ fontWeight: 500 }}>{fmt(run.totalNetPay || run.totalPay)}</td>
                        <td>{run.employeeCount || run.headcount || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {status === 'Draft'      && <button className="btn btn-primary btn-sm"  onClick={() => handleRunAction(run.id, 'process')} ><Play size={12} /> Process</button>}
                            {status === 'Processed'  && <button className="btn btn-success btn-sm" onClick={() => handleRunAction(run.id, 'approve')} ><CheckCircle size={12} /> Approve</button>}
                            {status === 'Approved'   && <button className="btn btn-primary btn-sm"  onClick={() => handleRunAction(run.id, 'finalize')}><Zap size={12} /> Finalize</button>}
                            {status === 'Finalized'  && <button className="btn btn-ghost btn-sm"   onClick={() => handleRunAction(run.id, 'payslips')}><FileText size={12} /> Payslips</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {runs.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No payroll runs yet</div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Exceptions ── */}
      {tab === 'exceptions' && isPayroll && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Type</th><th>Description</th><th>Severity</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {exceptions.map((ex, i) => (
                <tr key={ex.id || i}>
                  <td>{ex.employeeName || '—'}</td>
                  <td>{ex.exceptionType || ex.type || '—'}</td>
                  <td style={{ maxWidth: 250 }}><span className="truncate">{ex.description || ex.message || '—'}</span></td>
                  <td>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: ex.severity === 'High' ? 'var(--red)' : 'var(--amber)' }}>
                      {ex.severity || 'Medium'}
                    </span>
                  </td>
                  <td><Badge status={ex.status || 'Open'}>{ex.status || 'Open'}</Badge></td>
                  <td>
                    {(!ex.status || ex.status === 'Open') && (
                      <button className="btn btn-success btn-sm" onClick={() => handleResolveException(ex.id)}>
                        <CheckCircle size={12} /> Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {exceptions.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No open exceptions 🎉</div>
          )}
        </div>
      )}

      {/* Create Run Modal */}
      <Modal
        open={createRunModal}
        onClose={() => setCreateRunModal(false)}
        title="Create Payroll Run"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreateRunModal(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateRun} disabled={saving}>
              {saving ? <InlineSpinner /> : 'Create Run'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label required">Period Label</label>
          <input className="form-input" placeholder="e.g. April 2026" value={runForm.period} onChange={e => setRunForm(f => ({ ...f, period: e.target.value }))} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label required">Start Date</label>
            <input className="form-input" type="date" value={runForm.payPeriodStart} onChange={e => setRunForm(f => ({ ...f, payPeriodStart: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label required">End Date</label>
            <input className="form-input" type="date" value={runForm.payPeriodEnd} onChange={e => setRunForm(f => ({ ...f, payPeriodEnd: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-textarea" value={runForm.description} onChange={e => setRunForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes..." />
        </div>
      </Modal>

      {/* Payslip Modal */}
      <PayslipModal payslip={selectedSlip} onClose={() => setSlip(null)} />
    </>
  );
}