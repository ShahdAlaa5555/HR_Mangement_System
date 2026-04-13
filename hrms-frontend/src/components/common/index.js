// src/components/common/index.js
import React from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

/* ── Modal ─────────────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, children, footer, size = '' }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────────────────────────── */
const BADGE_MAP = {
  Pending:       'badge-pending',
  pending:       'badge-pending',
  PENDING:       'badge-pending',
  Approved:      'badge-approved',
  approved:      'badge-approved',
  APPROVED:      'badge-approved',
  Active:        'badge-active',
  active:        'badge-active',
  ACTIVE:        'badge-active',
  Rejected:      'badge-rejected',
  rejected:      'badge-rejected',
  REJECTED:      'badge-rejected',
  Cancelled:     'badge-rejected',
  cancelled:     'badge-rejected',
  Inactive:      'badge-rejected',
  inactive:      'badge-rejected',
  Processing:    'badge-info',
  processing:    'badge-info',
  Finalized:     'badge-purple',
  finalized:     'badge-purple',
  Draft:         'badge-gold',
  draft:         'badge-gold',
};

export function Badge({ status, children, className = '' }) {
  const cls = BADGE_MAP[status] || BADGE_MAP[children] || 'badge-info';
  return <span className={`badge ${cls} ${className}`}>{children || status}</span>;
}

/* ── Spinner ────────────────────────────────────────────────────────────────── */
export function Spinner({ size = '' }) {
  return (
    <div className="loading-center">
      <div className={`spinner ${size}`} />
    </div>
  );
}

export function InlineSpinner() {
  return <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />;
}

/* ── Skeleton ───────────────────────────────────────────────────────────────── */
export function SkeletonCard() {
  return (
    <div className="card">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-text w-60" />
      <div className="skeleton skeleton-text w-40" />
      <div className="skeleton" style={{ height: 80, marginTop: 12 }} />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {[1,2,3,4,5].map(i => (
              <th key={i}><div className="skeleton skeleton-text" style={{ width: '80%' }} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              {[1,2,3,4,5].map(j => (
                <td key={j}><div className="skeleton skeleton-text" style={{ width: `${50+Math.random()*40}%` }} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Empty State ─────────────────────────────────────────────────────────────── */
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={28} />
        </div>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/* ── Confirm Dialog ─────────────────────────────────────────────────────────── */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, variant = 'danger', loading = false }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className={`btn btn-${variant}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <InlineSpinner /> : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Stat Card ──────────────────────────────────────────────────────────────── */
export function StatCard({ title, value, label, icon: Icon, color, progress, progressMax, meta }) {
  const pct = progressMax ? Math.round((progress / progressMax) * 100) : null;
  return (
    <div className="stat-card">
      <div className="stat-card-accent" style={{ background: color }} />
      {Icon && (
        <div className="stat-card-icon" style={{ background: `${color}22` }}>
          <Icon size={20} style={{ color }} />
        </div>
      )}
      <div className="stat-card-value">{value ?? '—'}</div>
      <div className="stat-card-label">{title}</div>
      {pct !== null && (
        <>
          <div className="stat-card-progress">
            <div className="stat-card-progress-bar" style={{ width: `${pct}%`, background: color }} />
          </div>
          <div className="stat-card-meta">
            <span>{label}</span>
            <span>{pct}%</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Info Row ────────────────────────────────────────────────────────────────── */
export function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-row-label">{label}</span>
      <span className="info-row-value">{value ?? '—'}</span>
    </div>
  );
}

/* ── Alert Banner ────────────────────────────────────────────────────────────── */
export function Alert({ type = 'info', children }) {
  const map = {
    info:    { cls: 'badge-info',     Icon: Info,         bg: 'var(--cyan-dim)',   border: 'rgba(6,182,212,0.3)'   },
    success: { cls: 'badge-approved', Icon: CheckCircle,  bg: 'var(--green-dim)',  border: 'rgba(34,197,94,0.3)'   },
    error:   { cls: 'badge-rejected', Icon: AlertCircle,  bg: 'var(--red-dim)',    border: 'rgba(239,68,68,0.3)'   },
    warning: { cls: 'badge-pending',  Icon: AlertCircle,  bg: 'var(--amber-dim)',  border: 'rgba(245,158,11,0.3)'  },
  };
  const { Icon, bg, border } = map[type] || map.info;
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '12px 16px',
      background: bg, border: `1px solid ${border}`,
      borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
      color: 'var(--text-primary)',
    }}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{children}</span>
    </div>
  );
}
