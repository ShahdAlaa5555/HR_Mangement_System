// src/pages/Attendance/HolidaysPage.js
import React, { useState, useEffect } from 'react';
import { leaveAPI } from '../../api/services';
import { Badge, SkeletonTable, Modal, InlineSpinner } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { Plus, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';

export default function HolidaysPage() {
  const { user }    = useAuth();
  const isHR        = ['HR','Admin'].includes(user?.role || user?.Role);
  const [holidays,  setHolidays]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [addModal,  setAddModal]  = useState(false);
  const [form,      setForm]      = useState({ HolidayName: '', HolidayDate: '', IsRecurringYearly: false });
  const [saving,    setSaving]    = useState(false);

  const load = () => {
    leaveAPI.getHolidays().then(res => {
      const p = res.data?.data || res.data;
      setHolidays(Array.isArray(p) ? p : p?.holidays || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.HolidayName || !form.HolidayDate) { toast.error('Name and date are required'); return; }
    setSaving(true);
    try {
      await leaveAPI.createHoliday(form);
      toast.success('Holiday added');
      setAddModal(false);
      setForm({ HolidayName: '', HolidayDate: '', IsRecurringYearly: false });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to add holiday');
    } finally { setSaving(false); }
  };

  const upcoming = holidays.filter(h => new Date(h.HolidayDate || h.holidayDate) >= new Date())
    .sort((a, b) => new Date(a.HolidayDate || a.holidayDate) - new Date(b.HolidayDate || b.holidayDate));
  const past = holidays.filter(h => new Date(h.HolidayDate || h.holidayDate) < new Date());

  return (
    <>
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Calendar & Holidays</h1>
          <p>{holidays.length} holidays total · {upcoming.length} upcoming</p>
        </div>
        {isHR && (
          <button className="btn btn-primary" onClick={() => setAddModal(true)}>
            <Plus size={15} /> Add Holiday
          </button>
        )}
      </div>

      {/* Upcoming */}
      <div className="card" style={{ marginTop: 20, marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Upcoming Holidays</div>
          <span className="badge badge-gold">{upcoming.length}</span>
        </div>
        {loading ? <SkeletonTable rows={3} /> : upcoming.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No upcoming holidays</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Holiday</th><th>Date</th><th>Day</th><th>Recurring</th><th>Pay Multiplier</th></tr></thead>
              <tbody>
                {upcoming.map((h, i) => {
                  const date = new Date(h.HolidayDate || h.holidayDate);
                  return (
                    <tr key={h.HolidayID || i}>
                      <td style={{ fontWeight: 500 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CalendarDays size={15} style={{ color: 'var(--gold)' }} />
                          {h.HolidayName || h.holidayName}
                        </div>
                      </td>
                      <td>{isNaN(date) ? '—' : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{isNaN(date) ? '—' : date.toLocaleDateString('en-US', { weekday: 'long' })}</td>
                      <td><Badge status={(h.IsRecurringYearly || h.isRecurringYearly) ? 'Active' : 'Inactive'}>{(h.IsRecurringYearly || h.isRecurringYearly) ? 'Yearly' : 'One-time'}</Badge></td>
                      <td style={{ color: 'var(--gold)', fontWeight: 600 }}>×{h.PayMultiplier || h.payMultiplier || 1}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Past Holidays</div>
            <span className="badge badge-info">{past.length}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Holiday</th><th>Date</th><th>Recurring</th></tr></thead>
              <tbody>
                {past.slice(0, 10).map((h, i) => {
                  const date = new Date(h.HolidayDate || h.holidayDate);
                  return (
                    <tr key={h.HolidayID || i} style={{ opacity: 0.6 }}>
                      <td>{h.HolidayName || h.holidayName}</td>
                      <td>{isNaN(date) ? '—' : date.toLocaleDateString()}</td>
                      <td><Badge status={(h.IsRecurringYearly || h.isRecurringYearly) ? 'Active' : 'Inactive'}>{(h.IsRecurringYearly || h.isRecurringYearly) ? 'Yearly' : 'One-time'}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Holiday Modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="Add Holiday"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAddModal(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
              {saving ? <InlineSpinner /> : 'Add Holiday'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label required">Holiday Name</label>
          <input className="form-input" value={form.HolidayName} onChange={e => setForm(f => ({ ...f, HolidayName: e.target.value }))} placeholder="e.g. Eid Al-Fitr" />
        </div>
        <div className="form-group">
          <label className="form-label required">Date</label>
          <input className="form-input" type="date" value={form.HolidayDate} onChange={e => setForm(f => ({ ...f, HolidayDate: e.target.value }))} />
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.IsRecurringYearly} onChange={e => setForm(f => ({ ...f, IsRecurringYearly: e.target.checked }))} />
            <span className="form-label" style={{ marginBottom: 0 }}>Recurring every year</span>
          </label>
        </div>
      </Modal>
    </>
  );
}
