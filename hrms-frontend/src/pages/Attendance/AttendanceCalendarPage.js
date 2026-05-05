// src/pages/Attendance/AttendanceCalendarPage.js
import React, { useState, useEffect } from 'react';
import { attendanceAPI } from '../../api/services';
import { leaveAPI } from '../../api/services';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS = {
  Present: 'var(--green)',
  Absent:  'var(--red)',
  Leave:   'var(--amber)',
  Holiday: 'var(--purple)',
  Weekend: '#484f58',
  NoRecord:null,
};

export default function AttendanceCalendarPage() {
  const [month,    setMonth]    = useState(new Date());
  const [calData,  setCalData]  = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const navigate = useNavigate();

  const year = month.getFullYear();
  const mon  = month.getMonth();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      attendanceAPI.getCalendarMe({ year, month: mon + 1 }),
      leaveAPI.getHolidays(),
    ]).then(([cal, hol]) => {
      const calArr = (() => {
        const d = cal.data;
        return Array.isArray(d) ? d : d?.records || d?.attendances || [];
      })();
      const holArr = (() => {
        const d = hol.data;
        return Array.isArray(d) ? d : d?.holidays || [];
      })();
      setCalData(calArr);
      setHolidays(holArr);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [year, mon]);

  const first = new Date(year, mon, 1).getDay();
  const days  = new Date(year, mon + 1, 0).getDate();

  // Get attendance record for a day
  const getRecord = (d) => calData.find(r => {
    const rd = new Date(r.date || r.attendanceDate || r.AttendanceDate);
    return rd.getDate() === d && rd.getMonth() === mon && rd.getFullYear() === year;
  });

  // Get holiday for a day
  const getHoliday = (d) => holidays.find(h => {
    const hd = new Date(h.HolidayDate || h.holidayDate || h.date);
    return hd.getDate() === d && hd.getMonth() === mon && hd.getFullYear() === year;
  });

  const fmtT = (v) => {
    if (!v) return null;
    try { const d = new Date(v); return isNaN(d) ? null : d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); }
    catch { return null; }
  };

  return (
    <>
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Attendance Calendar</h1>
          <p>Monthly attendance overview with holidays</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/attendance')}>
          ← Back to Today
        </button>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setMonth(new Date(year, mon - 1, 1))}>← Prev</button>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>
            {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => setMonth(new Date(year, mon + 1, 1))}>Next →</button>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 400 }} />
        ) : (
          <>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 8 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
              {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: days }).map((_, i) => {
                const d        = i + 1;
                const rec      = getRecord(d);
                const holiday  = getHoliday(d);
                const recStatus= rec?.status || rec?.Status;

                // Holiday takes priority over attendance status
                const status   = holiday ? 'Holiday' : (recStatus !== 'NoRecord' ? recStatus : null);
                const color    = STATUS_COLORS[status] || null;
                const isToday  = new Date().getDate() === d && new Date().getMonth() === mon && new Date().getFullYear() === year;
                const checkIn  = rec?.checkInTime  || rec?.CheckInTime;
                const checkOut = rec?.checkOutTime || rec?.CheckOutTime;
                const holName  = holiday?.HolidayName || holiday?.holidayName || holiday?.name;

                return (
                  <div key={d} style={{
                    minHeight: 72, padding: '6px 8px',
                    borderRadius: 'var(--radius-md)',
                    background: isToday
                      ? 'var(--gold-glow)'
                      : color
                        ? `${color}15`
                        : 'var(--bg-elevated)',
                    border: `1px solid ${isToday ? 'var(--gold)' : color ? `${color}40` : 'var(--border)'}`,
                    position: 'relative',
                  }}>
                    {/* Day number */}
                    <div style={{
                      fontSize: '0.82rem', fontWeight: isToday ? 700 : 400,
                      color: isToday ? 'var(--gold)' : 'var(--text-secondary)',
                      marginBottom: 3,
                    }}>{d}</div>

                    {/* Holiday name */}
                    {holiday && (
                      <div style={{
                        fontSize: '0.62rem', fontWeight: 600,
                        color: STATUS_COLORS.Holiday,
                        lineHeight: 1.2, marginBottom: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }} title={holName}>
                        🎉 {holName}
                      </div>
                    )}

                    {/* Attendance status (only if not holiday) */}
                    {!holiday && status && (
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, color, marginBottom: 2 }}>
                        {status}
                      </div>
                    )}

                    {/* Check-in time */}
                    {fmtT(checkIn) && !holiday && (
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                        In: {fmtT(checkIn)}
                      </div>
                    )}

                    {/* Check-out time */}
                    {fmtT(checkOut) && !holiday && (
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                        Out: {fmtT(checkOut)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {Object.entries(STATUS_COLORS)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: v }} />
                {k}
              </div>
            ))}
        </div>

        {/* Holidays this month */}
        {holidays.filter(h => {
          const hd = new Date(h.HolidayDate || h.holidayDate);
          return hd.getMonth() === mon && hd.getFullYear() === year;
        }).length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Holidays This Month
            </div>
            {holidays
              .filter(h => {
                const hd = new Date(h.HolidayDate || h.holidayDate);
                return hd.getMonth() === mon && hd.getFullYear() === year;
              })
              .map((h, i) => {
                const hd   = new Date(h.HolidayDate || h.holidayDate);
                const name = h.HolidayName || h.holidayName || '—';
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '6px 0', borderBottom: '1px solid var(--border-light)',
                    fontSize: '0.85rem',
                  }}>
                    <span style={{ color: STATUS_COLORS.Holiday, fontWeight: 500 }}>🎉 {name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {isNaN(hd) ? '—' : hd.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
                    </span>
                  </div>
                );
              })
            }
          </div>
        )}
      </div>
    </>
  );
}