// src/api/axios.js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: attach JWT token ──────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: TWO jobs ─────────────────────────────────────────────────────
// 1. Unwrap the backend envelope  { success, data: <payload> }
//    so every caller gets res.data = <payload> directly — no more res.data.data
// 2. Handle 401 → auto-refresh token → retry original request
api.interceptors.response.use(
  (res) => {
    // If the response body has the shape { success: true, data: X }
    // unwrap it so res.data becomes X directly.
    const body = res.data;
    if (
      body &&
      typeof body === 'object' &&
      'success' in body &&
      'data'    in body
    ) {
      res.data = body.data;   // ← THE FIX: peel the envelope once, globally
    }
    return res;
  },
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(
          `${process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1'}/auth/refresh`,
          { refreshToken }
        );
        // refresh response is also enveloped — unwrap it too
        const newToken = data?.data?.accessToken || data?.accessToken;
        localStorage.setItem('accessToken', newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;