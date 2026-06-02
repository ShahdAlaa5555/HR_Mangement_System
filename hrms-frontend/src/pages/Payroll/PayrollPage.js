import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, DollarSign, AlertTriangle, FileText,
  Play, CheckCircle, Download, Plus, RefreshCw,
  TrendingUp, Users, Zap, ShieldCheck, Database,
  Globe, Scale, Save, Lock, Settings, Calculator, 
  Receipt, Clock, Check, X
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

  const financialData = payslip?.Entry || payslip || {};
  const runData = payslip?.PayrollRun || payslip || {};

  const startDate = runData?.PeriodStartDate || runData?.payPeriodStart || payslip?.IssueDate;
  const endDate = runData?.PeriodEndDate || runData?.payPeriodEnd;
  const status = payslip?.Status || payslip?.status || 'Finalized';
  
  const netPay = financialData?.NetPay || financialData?.netPay || 0;
  const grossPay = financialData?.TotalEarnings || financialData?.totalEarnings || 0;
  const totalDeductions = financialData?.TotalDeductions || financialData?.totalDeductions || 0;

  const lines = financialData?.Lines || [];
  const earningsLines = lines.filter(l => Number(l.Amount || l.amount) > 0);
  const deductionLines = lines.filter(l => Number(l.Amount || l.amount) < 0);

  const fmt = (v) => Number(v).toLocaleString('en-US', { style: 'currency', currency: 'EGP' });

  return (
    <Modal open={!!payslip} onClose={onClose} title="Payslip Details" size="modal-lg">
      <div style={{
        background: 'var(--bg-base)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>Official Payslip</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Period: {startDate ? `${new Date(startDate).toLocaleDateString()} – ${endDate ? new Date(endDate).toLocaleDateString() : 'Present'}` : '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Badge status={status}>{status}</Badge>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Earnings Breakdown
            </div>
            {earningsLines.map((line, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{line.Description || line.description || 'Earning'}</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{fmt(Math.abs(line.Amount || line.amount))}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-light)', fontWeight: 700, marginTop: 8 }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>Total Gross Pay</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--green)' }}>{fmt(grossPay)}</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Deductions & Penalties
            </div>
            {deductionLines.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No deductions this period.</div>
            ) : (
              deductionLines.map((line, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{line.Description || line.description || 'Deduction'}</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{fmt(Math.abs(line.Amount || line.amount))}</span>
                </div>
              ))
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-light)', fontWeight: 700, marginTop: 8 }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>Total Deductions</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--red)' }}>{fmt(totalDeductions)}</span>
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 16, padding: '14px 16px',
          background: 'var(--gold-glow)', border: '1px solid rgba(240,180,41,0.3)',
          borderRadius: 'var(--radius-md)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>FINAL NET PAY</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)' }}>{fmt(netPay)}</span>
        </div>
      </div>
    </Modal>
  );
}

/* ── Main Page Component ── */
export default function PayrollPage() {
  const { user }   = useAuth();
  const isPayroll  = ['Payroll','HR','Admin'].includes(user?.role);
  const isLegal    = ['Admin','Legal'].includes(user?.role);

  const [tab, setTab]           = useState('dashboard');
  const [dashboard, setDash]    = useState(null);
  const [runs, setRuns]         = useState([]);
  const [myPayslips, setMySlips]= useState([]);
  const [exceptions, setExcept] = useState([]);
  const [claims, setClaims]     = useState([]); 
  const [selectedSlip, setSlip] = useState(null);
  const [loadDash, setLoadDash] = useState(true);
  const [loadRuns, setLoadRuns] = useState(true);
  const [createRunModal, setCreateRunModal] = useState(false);
  const [claimModal, setClaimModal] = useState(false);
  const [saving, setSaving]     = useState(false);

  const [editPolicyModal, setEditPolicyModal] = useState(false);
  const [editGradeModal, setEditGradeModal] = useState(false);
  const [editTaxModal, setEditTaxModal] = useState(false);
  const [configForm, setConfigForm] = useState({ minWage: 6000, workDays: 22 });
  const [legalForm, setLegalForm] = useState({ siRate: 7.25 });
  
  const [runForm, setRunForm] = useState({ PolicyID: 1, PeriodStartDate: '', PeriodEndDate: '', CutoffDate: '', PaymentDate: '' });
  const [claimForm, setClaimForm] = useState({ type: 'Transport', amount: '', reason: '' });

  const load = useCallback(async () => {
    const extract = (res) => {
      let payload = res;
      if (payload && payload.data !== undefined) payload = payload.data;
      if (payload && payload.success !== undefined && payload.data !== undefined) payload = payload.data;
      return payload || null;
    };

    try {
        // Await everything so state isn't lost
        const [slipsRes, claimsRes] = await Promise.all([
          payrollAPI.getMyPayslips().catch(() => null),
          payrollAPI.listReimbursements().catch(() => null)
        ]);

        if (slipsRes) setMySlips(extract(slipsRes)?.payslips || extract(slipsRes) || []);
        if (claimsRes) setClaims(extract(claimsRes) || []);

        if (isPayroll) {
          const [dashRes, runsRes, excRes] = await Promise.all([
            payrollAPI.getDashboard().catch(() => null),
            payrollAPI.listRuns({ limit: 50 }).catch(() => null),
            // FIX: explicitly ask for more records so pagination doesn't hide new exceptions
            payrollAPI.listExceptions({ limit: 100 }).catch(() => null)
          ]);

          if (dashRes) setDash(extract(dashRes));
          setLoadDash(false);

          if (runsRes) {
            const runsData = extract(runsRes);
            setRuns(Array.isArray(runsData) ? runsData : (runsData?.runs || [])); 
          }
          setLoadRuns(false); 

          if (excRes) {
            const excData = extract(excRes);
            setExcept(Array.isArray(excData) ? excData : (excData?.exceptions || [])); 
          }
        } else {
          setLoadDash(false); setLoadRuns(false);
        }
    } catch (err) { console.error("Load Data Failed", err); }
  }, [isPayroll]);

  useEffect(() => { load(); }, [load]);

  const handleRunAction = async (runId, action) => {
    try {
      const id = parseInt(runId, 10);
      let result;

      if (action === 'process') result = await payrollAPI.processRun(id, {});
      else if (action === 'approve') await payrollAPI.approveRun(id, {});
      else if (action === 'finalize') await payrollAPI.finalizeRun(id, {});
      else if (action === 'payslips') await payrollAPI.generatePayslips(id, {});
      else if (action === 'bankfile') {
        await payrollAPI.generateBankFile(id, { FileFormat: 'CSV' });
        toast.success('Downloading...');
        return; 
      }

      // Check if the process returned exceptions
      const responseData = result?.data || result;
      if (action === 'process' && responseData?.exceptionsCount > 0) {
        toast.error(`Payroll processed with ${responseData.exceptionsCount} exceptions. Please check the Exceptions tab.`, { duration: 6000 });
      } else {
        toast.success(`Run ${action}d successfully`);
      }
      
      load(); // Reloads exceptions and run status immediately
    } catch (err) {
      toast.error(err.response?.data?.error?.message || `Action ${action} failed`);
    }
  };

  const handleActionClaim = async (claimId, status) => {
    try {
      if (typeof payrollAPI.actionReimbursement !== 'function') {
         return toast.error("Frontend API missing actionReimbursement function.");
      }
      await payrollAPI.actionReimbursement(parseInt(claimId, 10), { status }); 
      toast.success(`Claim ${status}`);
      load();
    } catch (err) { 
      toast.error(err.response?.data?.message || "Failed to update claim status"); 
    }
  };

  const handleSubmitClaim = async () => {
    if (!claimForm.amount || !claimForm.reason) return toast.error("Required fields missing");
    setSaving(true);
    try {
      await payrollAPI.submitReimbursement({
        type: claimForm.type,
        amount: parseFloat(claimForm.amount),
        reason: claimForm.reason
      });
      toast.success("Claim Submitted");
      setClaimModal(false);
      setClaimForm({ type: 'Transport', amount: '', reason: '' });
      load();
    } catch (err) { toast.error("Submission failed"); } finally { setSaving(false); }
  };

  const handleCreateRun = async () => {
    setSaving(true);
    try {
      const startDateObj = new Date(runForm.PeriodStartDate);
      const payload = {
        PolicyID: Number(runForm.PolicyID) || 1,
        PeriodYear: startDateObj.getFullYear(),
        PeriodMonth: startDateObj.getMonth() + 1,
        PeriodStartDate: new Date(runForm.PeriodStartDate).toISOString(),
        PeriodEndDate: new Date(runForm.PeriodEndDate).toISOString(),
        CutoffDate: new Date(runForm.CutoffDate || runForm.PeriodEndDate).toISOString(),
        PaymentDate: new Date(runForm.PaymentDate || runForm.PeriodEndDate).toISOString(),
      };
      await payrollAPI.createRun(payload);
      toast.success('Payroll run created');
      setCreateRunModal(false);
      load();
    } catch (err) {
      toast.error('Failed to create run');
    } finally { setSaving(false); }
  };

  const handleResolveException = async (id) => {
    try {
      await payrollAPI.resolveException(parseInt(id, 10), { resolution: 'Resolved', ResolutionNotes: 'Resolved manually' });
      toast.success('Exception resolved');
      load();
    } catch (err) { toast.error('Failed to resolve'); }
  };

  const handleBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ runs, timestamp: new Date() }));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "payroll_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success("System Backup Created");
  };

  // Compute open exceptions for the badge
  const openExceptions = exceptions.filter(ex => 
    String(ex.Status || ex.status || 'Open').toUpperCase() === 'OPEN'
  );

  const TABS = [
    { id: 'dashboard', label: 'Dashboard'  },
    { id: 'myslips',   label: 'My Payslips' },
    { id: 'claims',    label: 'Reimbursements' },
    ...(isPayroll ? [
      { id: 'runs',       label: 'Payroll Runs' },
      { id: 'exceptions', label: `Exceptions${openExceptions.length > 0 ? ` (${openExceptions.length})` : ''}` },
      { id: 'config',     label: 'System Config' },
    ] : []),
    ...(isLegal ? [{ id: 'legal', label: 'Legal & Compliance' }] : [])
  ];

  const fmt = (v) => v != null ? Number(v).toLocaleString('en-US', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }) : '—';
  const dashTotalPay = dashboard?.TotalNetAmount || 0;
  const dashHeadcount = dashboard?.TotalEmployees || 0;
  const dashActiveRuns = dashboard?.ActiveRuns || 0;
  const dashExceptions = dashboard?.OpenExceptions || openExceptions.length || 0;
  
  const chartData = (dashboard?.MonthlySummary || []).map(d => ({
    month: d.Month || d.month,
    netPay: d.NetPay || d.netPay,
    grossPay: d.GrossPay || d.grossPay
  }));

  return (
    <>
      <div className="page-header">
        <h1>Payroll Engine</h1>
        <p>Enterprise Compliance & Calculation Service</p>
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
          ) : (
            <>
              <div className="grid-4" style={{ marginBottom: 24 }}>
                <PayKPI icon={DollarSign} color="var(--green)"  label="Total Payroll"     value={fmt(dashTotalPay)} sub="Current cycle" />
                <PayKPI icon={Users}      color="var(--blue)"   label="Employees Paid"    value={dashHeadcount} />
                <PayKPI icon={CreditCard} color="var(--gold)"   label="Active Runs"       value={dashActiveRuns} />
                <PayKPI icon={AlertTriangle} color="var(--red)" label="Open Exceptions"   value={dashExceptions} sub="Needs attention" />
              </div>
              {chartData.length > 0 && (
                <div className="card">
                  <div className="card-header"><div className="card-title">Monthly Payroll Trend</div></div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
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
          )}
        </>
      )}

      {/* ── My Payslips ── */}
      {tab === 'myslips' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Period</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {myPayslips.map((slip, i) => {
                const runData = slip.PayrollRun || slip;
                const financialData = slip.Entry || slip;
                return (
                  <tr key={slip.PayslipID || i}>
                    <td>{new Date(runData.PeriodStartDate || slip.IssueDate).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</td>
                    <td style={{ color: 'var(--green)' }}>{fmt(financialData.TotalEarnings || 0)}</td>
                    <td style={{ color: 'var(--red)'   }}>{fmt(financialData.TotalDeductions || 0)}</td>
                    <td style={{ color: 'var(--gold)',  fontWeight: 700 }}>{fmt(financialData.NetPay || 0)}</td>
                    <td><Badge status={slip.Status || 'Finalized'}>{slip.Status || 'Finalized'}</Badge></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setSlip(slip)}><FileText size={13} /> View</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reimbursements ── */}
      {tab === 'claims' && (
        <div className="table-wrap">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setClaimModal(true)}><Plus size={14}/> New Claim</button>
          </div>
          <table>
            <thead><tr><th>Employee</th><th>Date</th><th>Category</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {claims.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24 }}>No claims found.</td></tr>
              ) : (
                claims.map(c => (
                  <tr key={c.ClaimID || c.id}>
                    <td>{c.Employee?.FullName || user.fullName}</td>
                    <td>{new Date(c.CreatedAt || Date.now()).toLocaleDateString()}</td>
                    <td>{c.Category || c.type}</td>
                    <td>{fmt(c.Amount || c.amount)}</td>
                    <td><Badge status={c.Status || c.status}>{c.Status || c.status}</Badge></td>
                    <td>
                      {isPayroll && (c.Status === 'Pending' || c.status === 'Pending') && (
                        <div style={{display:'flex', gap: 4}}>
                           <button className="btn btn-success btn-xs" onClick={() => handleActionClaim(c.ClaimID || c.id, 'Approved')}><Check size={12}/></button>
                           <button className="btn btn-red btn-xs" onClick={() => handleActionClaim(c.ClaimID || c.id, 'Rejected')}><X size={12}/></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Payroll Runs ── */}
      {tab === 'runs' && isPayroll && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setCreateRunModal(true)}><Plus size={16} /> New Run</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Run ID</th><th>Period</th><th>Status</th><th>Total Net</th><th>Employees</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr key={run.PayrollRunID || i}>
                    <td>#{run.PayrollRunID}</td>
                    <td>{new Date(run.PeriodStartDate).toLocaleDateString()} – {new Date(run.PeriodEndDate).toLocaleDateString()}</td>
                    <td><Badge status={run.Status}>{run.Status}</Badge></td>
                    <td style={{ fontWeight: 500 }}>{fmt(run.TotalNetAmount)}</td>
                    <td>{run.TotalEmployees}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(run.Status === 'Draft' || run.Status === 'Processing') && (
                          <button className="btn btn-primary btn-sm" onClick={() => handleRunAction(run.PayrollRunID, 'process')}><Play size={12} /> {run.Status === 'Processing' ? 'Re-Process' : 'Process'}</button>
                        )}
                        {run.Status === 'PendingApproval' && (
                          <button className="btn btn-success btn-sm" onClick={() => handleRunAction(run.PayrollRunID, 'approve')}><CheckCircle size={12} /> Approve</button>
                        )}
                        {run.Status === 'Approved' && (
                          <button className="btn btn-primary btn-sm" onClick={() => handleRunAction(run.PayrollRunID, 'finalize')}><Zap size={12} /> Finalize</button>
                        )}
                        {run.Status === 'Finalized' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleRunAction(run.PayrollRunID, 'payslips')}><FileText size={12} /> Payslips</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── System Config Tab (Active) ── */}
      {tab === 'config' && isPayroll && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
          <div className="card">
            <div className="card-header"><div className="card-title"><Zap size={18} className="text-gold" /> Global Policies</div></div>
            <div className="card-body">
              <div className="form-group"><label className="form-label">Minimum Wage Cap: <strong>{configForm.minWage} EGP</strong></label></div>
              <div className="form-group"><label className="form-label">Working Days: <strong>{configForm.workDays} Days</strong></label></div>
              <button className="btn btn-primary btn-sm w-full" onClick={() => setEditPolicyModal(true)}><Settings size={14}/> Edit Policies</button>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title"><TrendingUp size={18} className="text-blue" /> Salary Bands</div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Grade</th><th>Range</th><th>Action</th></tr></thead>
                <tbody>
                  <tr><td>Junior (G1)</td><td>15k – 25k</td><td><button className="btn btn-ghost btn-sm" onClick={() => setEditGradeModal(true)}>Edit</button></td></tr>
                  <tr><td>Senior (G2)</td><td>30k – 55k</td><td><button className="btn btn-ghost btn-sm" onClick={() => setEditGradeModal(true)}>Edit</button></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title"><Calculator size={18} className="text-green" /> Rules & Elements</div></div>
            <div className="card-body">
              <button className="btn btn-outline btn-sm w-full" onClick={() => toast("Element Manager Opening...")}>Manage Multipliers</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Legal & Compliance Tab (Active) ── */}
      {tab === 'legal' && isLegal && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
          <div className="card">
            <div className="card-header"><div className="card-title"><Globe size={18} className="text-blue" /> Tax Brackets</div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Bracket</th><th>Rate %</th><th>Action</th></tr></thead>
                <tbody>
                  <tr><td>0 - 20k</td><td>0%</td><td><Badge status="Active">Locked</Badge></td></tr>
                  <tr><td>20k - 45k</td><td>10%</td><td><button className="btn btn-ghost btn-sm" onClick={() => setEditTaxModal(true)}>Update</button></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title"><Scale size={18} className="text-red" /> Social Rules</div></div>
            <div className="card-body">
              <div className="form-group"><label className="form-label">Employee SI Rate: <strong>{legalForm.siRate}%</strong></label></div>
              <button className="btn btn-primary btn-sm w-full" onClick={() => toast("Legal Update Form Opening...")}>Apply Legal Update</button>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title"><Database size={18} className="text-purple" /> Maintenance</div></div>
            <div className="card-body">
              <button className="btn btn-success btn-sm w-full" onClick={handleBackup}><Download size={14} /> Download System Backup</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exceptions ── */}
      {tab === 'exceptions' && isPayroll && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Type</th><th>Description</th><th>Severity</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {/* THE FIX: We map over ALL exceptions so history remains visible */}
              {exceptions.map((ex, i) => {
                const isOpen = String(ex.Status || ex.status || 'OPEN').toUpperCase() === 'OPEN';
                return (
                  <tr key={ex.ExceptionID || i}>
                    <td>{ex.Employee?.FullName || '—'}</td>
                    <td>{ex.ExceptionType || '—'}</td>
                    <td style={{ maxWidth: 250 }}><span className="truncate">{ex.Description || '—'}</span></td>
                    <td><span style={{ color: ex.Severity === 'High' ? 'var(--red)' : 'var(--amber)', fontWeight: 600 }}>{ex.Severity || 'Medium'}</span></td>
                    <td><Badge status={ex.Status || 'Open'}>{ex.Status || 'Open'}</Badge></td>
                    <td>
                      {isOpen ? (
                        <button className="btn btn-success btn-sm" onClick={() => handleResolveException(ex.ExceptionID)}><CheckCircle size={12} /> Resolve</button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Resolved</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {exceptions.length === 0 && (
                <tr><td colSpan="6" style={{textAlign:'center', padding: 24, color:'var(--text-muted)'}}>No exceptions generated by the engine yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODALS ── */}
      <Modal open={claimModal} onClose={() => setClaimModal(false)} title="New Claim">
        <div className="form-group"><label className="form-label">Category</label>
          <select className="form-input" value={claimForm.type} onChange={e => setClaimForm({...claimForm, type: e.target.value})}>
            <option value="Transport">Transport</option><option value="Education">Education</option><option value="Travel">Travel</option>
          </select>
        </div>
        <div className="form-group"><label className="form-label">Amount</label><input type="number" className="form-input" value={claimForm.amount} onChange={e => setClaimForm({...claimForm, amount: e.target.value})} /></div>
        <div className="form-group"><label className="form-label">Reason</label><textarea className="form-input" value={claimForm.reason} onChange={e => setClaimForm({...claimForm, reason: e.target.value})} rows={3} /></div>
        <button className="btn btn-primary w-full" onClick={handleSubmitClaim} disabled={saving}>Submit</button>
      </Modal>

      <Modal open={editPolicyModal} onClose={() => setEditPolicyModal(false)} title="Update Global Policies">
        <div className="form-group"><label className="form-label">Min Wage Limit</label><input type="number" className="form-input" value={configForm.minWage} onChange={e => setConfigForm({...configForm, minWage: e.target.value})} /></div>
        <div className="form-group"><label className="form-label">Working Days</label><input type="number" className="form-input" value={configForm.workDays} onChange={e => setConfigForm({...configForm, workDays: e.target.value})} /></div>
        <button className="btn btn-primary w-full" onClick={() => {toast.success("Policy Updated"); setEditPolicyModal(false)}}>Save</button>
      </Modal>

      <Modal open={editGradeModal} onClose={() => setEditGradeModal(false)} title="Edit Salary Band">
        <div className="form-group"><label className="form-label">Min Salary</label><input type="number" className="form-input" /></div>
        <div className="form-group"><label className="form-label">Max Salary</label><input type="number" className="form-input" /></div>
        <button className="btn btn-primary w-full" onClick={() => {toast.success("Grade Updated"); setEditGradeModal(false)}}>Save</button>
      </Modal>

      <Modal open={editTaxModal} onClose={() => setEditTaxModal(false)} title="Update Tax Slice">
        <div className="form-group"><label className="form-label">Rate (%)</label><input type="number" className="form-input" defaultValue="10" /></div>
        <button className="btn btn-primary w-full" onClick={() => {toast.success("Tax Updated"); setEditTaxModal(false)}}>Apply</button>
      </Modal>

      <Modal open={createRunModal} onClose={() => setCreateRunModal(false)} title="Create Payroll Run" footer={<><button className="btn btn-secondary" onClick={() => setCreateRunModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleCreateRun}>Create</button></>}>
        <div className="form-group"><label className="form-label">Policy ID</label><input className="form-input" type="number" value={runForm.PolicyID} onChange={e => setRunForm(f => ({ ...f, PolicyID: e.target.value }))} /></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Start Date</label><input className="form-input" type="date" value={runForm.PeriodStartDate} onChange={e => setRunForm(f => ({ ...f, PeriodStartDate: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">End Date</label><input className="form-input" type="date" value={runForm.PeriodEndDate} onChange={e => setRunForm(f => ({ ...f, PeriodEndDate: e.target.value }))} /></div>
        </div>
      </Modal>

      <PayslipModal payslip={selectedSlip} onClose={() => setSlip(null)} />
    </>
  );
}