// src/pages/Auth/LoginPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Eye, EyeOff, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { InlineSpinner } from '../../components/common';

export default function LoginPage() {
  const [form, setForm]       = useState({ email: '', password: '' });
  const [errors, setErrors]   = useState({});
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const validate = () => {
    const e = {};
    if (!form.email)                             e.email    = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email))  e.email    = 'Enter a valid email';
    if (!form.password)                          e.password = 'Password is required';
    return e;
  };

  // e.preventDefault() stops the browser from doing a hard page reload
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message        ||
        'Invalid email or password';
      toast.error(msg);
      setLoading(false);
    }
  };

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(er => ({ ...er, [k]: '' }));
  };

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Building2 size={24} color="var(--text-inverse)" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              University <span style={{ color: 'var(--gold)' }}>HR</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Human Resources System
            </div>
          </div>
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, marginBottom: 6 }}>
          Sign In
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 28 }}>
          Enter your credentials to access the portal
        </p>

        {/* Wrap inputs in a real <form> so Enter key and submit both call handleSubmit */}
        <form onSubmit={handleSubmit} noValidate>

          {/* Email */}
          <div className="form-group">
            <label htmlFor="login-email" className="form-label required">
              Email Address
            </label>
            <input
              id="login-email"
              name="email"
              className="form-input"
              type="email"
              autoComplete="email"
              placeholder="you@university.edu"
              value={form.email}
              onChange={e => set('email', e.target.value)}
            />
            {errors.email && <div className="form-error">{errors.email}</div>}
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="login-password" className="form-label required">
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                name="password"
                className="form-input"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <div className="form-error">{errors.password}</div>}
          </div>

          {/* Submit — type="submit" so Enter key inside the form triggers it */}
          <button
            type="submit"
            className="btn btn-primary w-full btn-lg"
            disabled={loading}
            style={{ marginTop: 8, justifyContent: 'center' }}
          >
            {loading ? <InlineSpinner /> : <><LogIn size={18} /> Sign In</>}
          </button>

        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Contact your HR administrator for account access
        </p>
      </div>
    </div>
  );
}