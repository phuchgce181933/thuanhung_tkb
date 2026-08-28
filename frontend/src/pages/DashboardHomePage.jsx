import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { giaoVienAPI, khoiAPI, lopAPI, tkbAPI } from '../services/api';

const INITIAL_STATS = [
  { label: 'Khối học', value: '-', icon: '▦', tone: 'blue', link: '/khoi' },
  { label: 'Lớp học', value: '-', icon: '▤', tone: 'amber', link: '/lop' },
  { label: 'Giáo viên', value: '-', icon: '♙', tone: 'green', link: '/giao-vien' },
  { label: 'Thời khóa biểu', value: '-', icon: '▣', tone: 'coral', link: '/thoi-khoa-bieu' }
];

function DashboardHomePage() {
  const [stats, setStats] = useState(INITIAL_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([khoiAPI.getAll(), lopAPI.getAll(), giaoVienAPI.getAll(), tkbAPI.getAll({ namHoc: '2024-2025' })])
      .then(([khoiRes, lopRes, giaoVienRes, tkbRes]) => {
        if (!active) return;
        setStats([
          { ...INITIAL_STATS[0], value: khoiRes.data?.data?.length || 0 },
          { ...INITIAL_STATS[1], value: lopRes.data?.data?.length || 0 },
          { ...INITIAL_STATS[2], value: giaoVienRes.data?.data?.length || 0 },
          { ...INITIAL_STATS[3], value: tkbRes.data?.data?.length || 0 }
        ]);
      })
      .catch(() => active && setError('Không thể tải số liệu tổng quan'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return (
    <div className="overview-page">
      <div className="overview-hero">
        <div>
          <p className="overview-kicker">TỔNG QUAN HỆ THỐNG</p>
          <h1>Chào mừng trở lại.</h1>
          <p>Theo dõi nhanh tình hình lớp học và lịch giảng dạy trong năm học hiện tại.</p>
        </div>
        <div className="overview-date"><span>HÔM NAY</span><strong>{new Date().toLocaleDateString('vi-VN')}</strong></div>
      </div>

      {error && <div className="overview-error">{error}</div>}

      <div className="overview-stats">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.link} className={`overview-stat stat-${stat.tone}`}>
            <span className="stat-icon">{stat.icon}</span>
            <span className="stat-copy"><small>{stat.label}</small><strong>{loading ? '...' : stat.value}</strong></span>
            <span className="stat-arrow">↗</span>
          </Link>
        ))}
      </div>

      <div className="overview-grid">
        <section className="overview-panel overview-quick-panel">
          <div className="panel-heading"><div><span className="panel-eyebrow">THAO TÁC NHANH</span><h2>Công việc thường dùng</h2></div></div>
          <div className="quick-actions">
            <Link to="/bang-phan-cong"><span className="quick-icon blue">▥</span><span><strong>Xem bảng phân công</strong><small>Kiểm tra lịch theo giáo viên</small></span><b>→</b></Link>
            <Link to="/thoi-khoa-bieu"><span className="quick-icon amber">▣</span><span><strong>Quản lý thời khóa biểu</strong><small>Xếp lịch và xử lý thay đổi</small></span><b>→</b></Link>
            <Link to="/lop-chuyen-mon"><span className="quick-icon green">◈</span><span><strong>Phân công môn học</strong><small>Gán môn cho từng lớp</small></span><b>→</b></Link>
          </div>
        </section>
        <section className="overview-panel overview-note-panel">
          <div className="panel-heading"><div><span className="panel-eyebrow">TRẠNG THÁI</span><h2>Năm học hiện tại</h2></div><span className="status-badge">Đang hoạt động</span></div>
          <div className="year-display"><strong>2024</strong><span>—</span><strong>2025</strong></div>
          <p>Dữ liệu được đồng bộ trực tiếp từ hệ thống. Các thay đổi trên lịch sẽ cập nhật cho toàn bộ màn hình quản lý.</p>
          <Link to="/giao-vien" className="text-link">Xem danh sách giáo viên <span>→</span></Link>
        </section>
      </div>
    </div>
  );
}

export default DashboardHomePage;
