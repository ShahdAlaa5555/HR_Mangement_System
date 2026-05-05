// src/pages/Attendance/AttendanceReportsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { attendanceAPI, employeeAPI } from '../../api/services';
import { SkeletonCard, InlineSpinner, Modal } from '../../components/common';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { RefreshCw, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

const COLORS = ['var(--green)','var(--red)','var(--amber)','var(--purple)','var(--blue)'];
const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Try PascalCase then camelCase
const get = (obj, ...keys) => { for (const k of keys) if (obj?.[k] != null) return obj[k]; return null; };

export default function AttendanceReportsPage() {
  const [summary,        setSummary]        = useState(null);
  const [kpis,           setKpis]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [empId,          setEmpId]          = useState('');
  const [employees,      setEmployees]      = useState([]);
  const [generating,     setGenerating]     = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [genModal,       setGenModal]       = useState(false);
  const [genForm,        setGenForm]        = useState({
    employeeId: '',
    year:  new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  useEffect(() => {
    Promise.all([
      attendanceAPI.getDashboardKPIs(),
      employeeAPI.list({ limit: 100 }),
    ]).then(([k, e]) => {
      console.log('📊 KPI EXACT SHAPE:', JSON.stringify(k.data, null, 2));
      setKpis(k.data);
      const d = e.data;
      setEmployees(Array.isArray(d) ? d : d?.employees || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadSummary = useCallback((id, year, month) => {
    if (!id) return;
    setSummaryLoading(true);
    setSummary(null);
    const now = new Date();
    attendanceAPI.getSummary(id, { year: year || now.getFullYear(), month: month || now.getMonth() + 1 })
      .then(({ data }) => {
        console.log('📋 SUMMARY EXACT SHAPE:', JSON.stringify(data, null, 2));
        setSummary(data);
        setSummaryLoading(false);
      })
      .catch(err => {
        setSummaryLoading(false);
        const msg = err.response?.data?.error?.message || 'No summary found';
        toast.error(`${msg} — try generating one first`);
      });
  }, []);

  const handleGenerate = async () => {
    if (!genForm.employeeId) { toast.error('Select an employee'); return; }
    setGenerating(true);
    try {
      await attendanceAPI.generateSummary(genForm.employeeId, genForm.year, genForm.month);
      toast.success(`Summary generated for ${MONTHS[genForm.month - 1]} ${genForm.year}`);
      setGenModal(false);
      setEmpId(String(genForm.employeeId));
      loadSummary(genForm.employeeId, genForm.year, genForm.month);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to generate summary');
    } finally { setGenerating(false); }
  };

  // Build KPI cards — uses exact field names confirmed from your API
  const kpiCards = kpis ? [
    { label: 'This Week Hours',  value: get(kpis,'thisWeekHours','ThisWeekHours')    != null ? `${Number(get(kpis,'thisWeekHours','ThisWeekHours')).toFixed(1)}h` : '—', color: 'var(--blue)'   },
    { label: 'On-Time Rate',     value: get(kpis,'onTimeRate','OnTimeRate')          != null ? `${Number(get(kpis,'onTimeRate','OnTimeRate')).toFixed(0)}%`         : '—', color: 'var(--green)'  },
    { label: 'Pending Requests', value: get(kpis,'pendingRequests','PendingRequests') ?? '—',                                                                             color: 'var(--amber)'  },
    { label: 'Days to Payroll',  value: get(kpis,'daysToPayroll','DaysToPayroll')    != null ? `${get(kpis,'daysToPayroll','DaysToPayroll')} days`                 : '—', color: 'var(--purple)' },
  ] : [];

  const summaryChartData = summary ? [
    { name: 'Present',  value: Number(get(summary,'PresentDays', 'presentDays')  || 0) },
    { name: 'Absent',   value: Number(get(summary,'AbsentDays',  'absentDays')   || 0) },
    { name: 'Leave',    value: Number(get(summary,'LeaveDays',   'leaveDays')    || 0) },
    { name: 'Holiday',  value: Number(get(summary,'HolidayDays', 'holidayDays')  || 0) },
  ].filter(d => d.value > 0) : [];

  const periodMonth = get(summary,'PeriodMonth','periodMonth');
  const periodYear  = get(summary,'PeriodYear', 'periodYear');

  return (
    <>
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Reports & Analytics</h1>
          <p>Attendance KPIs and employee monthly summaries</p>
        </div>
        <button className="btn btn-primary" onClick={() => setGenModal(true)}>
          <Plus size={15} /> Generate Summary
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid-4" style={{ margin: '24px 0' }}>
        {loading
          ? [1,2,3,4].map(i => <SkeletonCard key={i} />)
          : kpiCards.map(({ label, value, color }) => (
            <div key={label} className="stat-card">
              <div className="stat-card-accent" style={{ background: color }} />
              <div className="stat-card-value" style={{ color }}>{value}</div>
              <div className="stat-card-label">{label}</div>
            </div>
          ))
        }
      </div>

      {/* Employee Summary */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Employee Monthly Summary</div>
            <div className="card-subtitle">View or generate attendance summaries per employee</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select
              className="form-select"
              style={{ width: 220 }}
              value={empId}
              onChange={e => { const id = e.target.value; setEmpId(id); if (id) loadSummary(id); }}
            >
              <option value="">Select employee...</option>
              {employees.map(emp => {
                const id   = emp.EmployeeID || emp.employeeID || emp.id;
                const name = emp.FullName   || emp.fullName   || `${emp.FirstName || ''} ${emp.LastName || ''}`.trim();
                return <option key={id} value={id}>{name}</option>;
              })}
            </select>
            {empId && (
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => loadSummary(empId)} disabled={summaryLoading} title="Refresh">
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        </div>

        {summaryLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
            <div className="spinner" />
          </div>
        ) : summary ? (
          <>
            {/* Period header */}
            {periodMonth && periodYear && (
              <div style={{
                padding: '8px 14px', marginBottom: 16,
                background: 'var(--gold-glow)', border: '1px solid rgba(240,180,41,0.2)',
                borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--gold-text)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>📅 Showing summary for <strong>{MONTHS[periodMonth - 1]} {periodYear}</strong></span>
                <button className="btn btn-secondary btn-sm" onClick={() => { setGenForm(f => ({ ...f, employeeId: empId })); setGenModal(true); }}>
                  <RefreshCw size={13} /> Regenerate
                </button>
              </div>
            )}

            <div className="grid-2">
              {/* Pie chart */}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 12, color: 'var(--text-secondary)' }}>Day Distribution</div>
                {summaryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={summaryChartData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                        {summaryChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '0.85rem' }}>No day distribution data</div>
                )}
              </div>

              {/* Detail rows */}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 12, color: 'var(--text-secondary)' }}>Summary Details</div>
                {[
                  { label: 'Total Working Days', value: get(summary,'TotalWorkingDays','totalWorkingDays') },
                  { label: 'Present Days',       value: get(summary,'PresentDays',     'presentDays')      },
                  { label: 'Absent Days',        value: get(summary,'AbsentDays',      'absentDays')       },
                  { label: 'Leave Days',         value: get(summary,'LeaveDays',       'leaveDays')        },
                  { label: 'Holiday Days',       value: get(summary,'HolidayDays',     'holidayDays')      },
                  { label: 'Total Hours',        value: get(summary,'TotalWorkedHours','totalWorkedHours')  != null
                      ? `${Number(get(summary,'TotalWorkedHours','totalWorkedHours')).toFixed(1)}h`  : null },
                  { label: 'Overtime Hours',     value: get(summary,'TotalOvertimeHrs','totalOvertimeHrs') != null
                      ? `${Number(get(summary,'TotalOvertimeHrs','totalOvertimeHrs')).toFixed(1)}h`  : null },
                  { label: 'Late Minutes',       value: get(summary,'TotalLatenessMins','totalLatenessMins') != null
                      ? `${get(summary,'TotalLatenessMins','totalLatenessMins')} min`                : null },
                  { label: 'On-Time Rate',       value: get(summary,'OnTimeRate','onTimeRate') != null
                      ? `${Number(get(summary,'OnTimeRate','onTimeRate')).toFixed(1)}%`              : null },
                ].map(({ label, value }) => (
                  <div className="info-row" key={label}>
                    <span className="info-row-label">{label}</span>
                    <span className="info-row-value">{value ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : empId ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
              No summary found for this employee this month
            </div>
            <button className="btn btn-primary" onClick={() => { setGenForm(f => ({ ...f, employeeId: empId })); setGenModal(true); }}>
              <Plus size={15} /> Generate Summary Now
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
            Select an employee above to view their monthly summary
          </div>
        )}
      </div>

      {/* Generate Modal */}
      <Modal
        open={genModal}
        onClose={() => setGenModal(false)}
        title="Generate Attendance Summary"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setGenModal(false)} disabled={generating}>Cancel</button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? <InlineSpinner /> : <><RefreshCw size={14} /> Generate</>}
            </button>
          </>
        }
      >
        <div style={{
          padding: '10px 14px', marginBottom: 16,
          background: 'var(--blue-dim)', border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--blue)',
        }}>
          Calculates and stores the attendance summary for the selected employee and period.
          Existing summaries will be recalculated.
        </div>

        <div className="form-group">
          <label className="form-label required">Employee</label>
          <select className="form-select" value={genForm.employeeId} onChange={e => setGenForm(f => ({ ...f, employeeId: e.target.value }))}>
            <option value="">Select employee...</option>
            {employees.map(emp => {
              const id   = emp.EmployeeID || emp.employeeID || emp.id;
              const name = emp.FullName   || emp.fullName   || `${emp.FirstName || ''} ${emp.LastName || ''}`.trim();
              return <option key={id} value={id}>{name}</option>;
            })}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label required">Year</label>
            <select className="form-select" value={genForm.year} onChange={e => setGenForm(f => ({ ...f, year: Number(e.target.value) }))}>
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Month</label>
            <select className="form-select" value={genForm.month} onChange={e => setGenForm(f => ({ ...f, month: Number(e.target.value) }))}>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </>
  );
}