// src/components/layout/AppShell.js
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell({ children, onSearch }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="app-shell">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      <div className="main-area">
        <Header onSearch={onSearch} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
