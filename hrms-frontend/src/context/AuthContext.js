// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/services';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);  // stays true until session is resolved

  // Restore session on mount — MUST finish before any route renders
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }
    authAPI.me()
      .then(({ data }) => {
        // Backend: { success, data: { employee } } or { success, data: employee }
        const payload = data?.data || data;
        const u = payload.employee || payload.user || payload;
        setUser(u);
      })
      .catch(() => {
        // Token invalid / expired and refresh failed — clear everything
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authAPI.login({ email, password });

    // Backend wraps response: { success, data: { accessToken, refreshToken, employee } }
    const payload = res.data?.data || res.data;

    const accessToken  = payload.accessToken;
    const refreshToken = payload.refreshToken || '';
    const profile      = payload.employee || payload.user || null;

    if (!accessToken) throw new Error('No access token returned from server.');

    localStorage.setItem('accessToken',  accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    setUser(profile || { email });
    return payload;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    toast.success('Logged out successfully');
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await authAPI.changePassword({ currentPassword, newPassword });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};