import { useState } from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import KhoiPage from './pages/KhoiPage';
import LopPage from './pages/LopPage';
import LopChuyenMonPage from './pages/LopChuyenMonPage';
import GiaoVienPage from './pages/GiaoVienPage';
import ThoiKhoaBieuPage from './pages/ThoiKhoaBieuPage';
import BangPhanCongPage from './pages/BangPhanCongPage';
import DashboardHomePage from './pages/DashboardHomePage';
import './App.css';

const NAV_ITEMS = [
  { to: '/', label: 'Tổng quan', icon: '⌂', end: true },
  { to: '/khoi', label: 'Khối', icon: '▦' },
  { to: '/lop', label: 'Lớp học', icon: '▤' },
  { to: '/lop-chuyen-mon', label: 'Phân công môn', icon: '◈' },
  { to: '/giao-vien', label: 'Giáo viên', icon: '♙' },
  { to: '/thoi-khoa-bieu', label: 'Thời khóa biểu', icon: '▣' },
  { to: '/bang-phan-cong', label: 'Bảng phân công', icon: '▥' }
];

function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const currentItem = NAV_ITEMS.find((item) => item.end
    ? location.pathname === item.to
    : location.pathname.startsWith(item.to)) || NAV_ITEMS[0];

  return (
    <div className={`dashboard-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className="dashboard-sidebar">
        <div className="brand-block">
          <div className="brand-mark">S</div>
          <div>
            <strong>Sắp Lịch</strong>
            <span>School workspace</span>
          </div>
        </div>

        <div className="sidebar-section-label">QUẢN LÝ</div>
        <nav className="dashboard-nav" aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => isActive ? 'dashboard-nav-link active' : 'dashboard-nav-link'}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="connection-pill"><span /> Atlas database</div>
          <span className="sidebar-version">v1.0.3</span>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <button type="button" className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Mở menu">
            ☰
          </button>
          <div className="topbar-context">
            <span className="topbar-eyebrow">TRƯỜNG TIỂU HỌC</span>
            <span className="topbar-title">{currentItem.label}</span>
          </div>
          <div className="topbar-actions">
            <span className="today-label">Năm học 2024 - 2025</span>
            <div className="profile-chip"><span className="profile-avatar">QT</span><span>Quản trị viên</span></div>
          </div>
        </header>

        <main className="dashboard-content">
          <Routes>
            <Route path="/" element={<DashboardHomePage />} />
            <Route path="/khoi" element={<KhoiPage />} />
            <Route path="/lop" element={<LopPage />} />
            <Route path="/lop-chuyen-mon" element={<LopChuyenMonPage />} />
            <Route path="/giao-vien" element={<GiaoVienPage />} />
            <Route path="/thoi-khoa-bieu" element={<ThoiKhoaBieuPage />} />
            <Route path="/bang-phan-cong" element={<BangPhanCongPage />} />
          </Routes>
        </main>

        <footer className="dashboard-footer">Sắp Lịch <span>•</span> Nền tảng quản lý thời khóa biểu</footer>
      </div>
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <DashboardLayout />
    </HashRouter>
  );
}

export default App;
