import { useEffect, useMemo, useState } from 'react';
import { giaoVienAPI, tkbAPI } from '../services/api';
import './BangPhanCongPage.css';

const DAYS = [2, 3, 4, 5, 6];
const DAY_LABELS = { 2: 'Thứ hai', 3: 'Thứ ba', 4: 'Thứ tư', 5: 'Thứ năm', 6: 'Thứ sáu' };
const LESSONS = [1, 2, 3, 4];

const SAMPLE_TEACHERS = [
  { _id: 'sample-kim', hoTen: 'Nguyễn Thị Thu Kim', chuyenMon: 'Tin học - Công nghệ' },
  { _id: 'sample-thu', hoTen: 'Nguyễn Lê Anh Thư', chuyenMon: 'Tiếng Anh' },
  { _id: 'sample-nan', hoTen: 'Nguyễn Thế Nân', chuyenMon: 'Thể dục' },
  { _id: 'sample-trinh', hoTen: 'Huỳnh Tú Trinh', chuyenMon: 'Mĩ thuật' },
  { _id: 'sample-tram', hoTen: 'Nguyễn Thị Bích Trâm', chuyenMon: 'Âm nhạc' }
];

const SAMPLE_SLOTS = {
  'sample-kim-3-sang-1': '4A6',
  'sample-kim-4-sang-2': '4B6',
  'sample-kim-5-sang-3': '5A6',
  'sample-kim-2-chieu-5': '5C6',
  'sample-thu-2-sang-1': '5A6',
  'sample-thu-3-sang-2': '5B6',
  'sample-thu-4-sang-3': '4A6',
  'sample-thu-5-chieu-5': '3A6',
  'sample-nan-2-sang-2': '3A6',
  'sample-nan-3-sang-3': '3B6',
  'sample-nan-4-chieu-5': '4B6',
  'sample-trinh-2-chieu-5': '4A6',
  'sample-trinh-3-sang-3': '1B6',
  'sample-tram-2-sang-1': '5B6',
  'sample-tram-3-sang-2': '2A6',
  'sample-tram-5-sang-1': '4B6'
};

function getTeacherName(teacher) {
  return teacher?.hoTen || teacher?.ten || teacher?.name || 'Chưa đặt tên';
}

function getTeacherSubject(teacher) {
  const value = teacher?.chuyenMon || teacher?.monDay || teacher?.boMon;
  if (Array.isArray(value)) {
    return value.map((item) => getSubjectName(item)).filter(Boolean).join(', ') || 'Chưa phân công';
  }
  return getSubjectName(value) || 'Chưa phân công';
}

function getSubjectName(value) {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value.tenChuyenMon || value.tenMon || value.name || value.ten || '';
}

function getSlotKey(teacherId, day, session, lesson) {
  return `${teacherId}-${day}-${session}-${lesson}`;
}

function normalizeSlots(tkbs) {
  const slots = {};
  (tkbs || []).forEach((tkb) => {
    const className = tkb.lop?.tenLop || tkb.lop?.name || tkb.tenLop || '';
    (tkb.ngayTrongTuan || []).forEach((day) => {
      (day.tiets || []).forEach((lesson) => {
        const teacherId = typeof lesson.giaoVien === 'object'
          ? lesson.giaoVien?._id
          : lesson.giaoVien;
        if (!teacherId || !day.thu) return;
        const session = day.buoi || (lesson.tiet <= 4 ? 'sang' : 'chieu');
        slots[getSlotKey(String(teacherId), day.thu, session, lesson.tiet)] = {
          className,
          subject: lesson.chuyenMon || ''
        };
      });
    });
  });
  return slots;
}

function BangPhanCongPage() {
  const [teachers, setTeachers] = useState(SAMPLE_TEACHERS);
  const [slots, setSlots] = useState(SAMPLE_SLOTS);
  const [year, setYear] = useState('2024-2025');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('all');
  const [branch, setBranch] = useState('all');
  const [loading, setLoading] = useState(false);
  const [usingSample, setUsingSample] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([giaoVienAPI.getAll(), tkbAPI.getAll({ namHoc: year })])
      .then(([teacherResponse, tkbResponse]) => {
        if (!active) return;
        const nextTeachers = teacherResponse.data?.data || [];
        const nextSlots = normalizeSlots(tkbResponse.data?.data || []);
        setTeachers(nextTeachers.length ? nextTeachers : SAMPLE_TEACHERS);
        setSlots(nextTeachers.length ? nextSlots : SAMPLE_SLOTS);
        setUsingSample(!nextTeachers.length);
      })
      .catch(() => {
        if (active) setUsingSample(true);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [year]);

  const subjects = useMemo(() => [...new Set(teachers.map(getTeacherSubject))].sort(), [teachers]);

  // Danh sách phân hiệu có trong data
  const branches = useMemo(() => {
    const set = new Set();
    teachers.forEach(t => {
      const ph = (t?.phanHieu || '').trim();
      if (ph) set.add(ph);
    });
    return [...set].sort();
  }, [teachers]);

  const visibleTeachers = useMemo(() => teachers.filter((teacher) => {
    const name = getTeacherName(teacher).toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase());
    const matchesSubject = subject === 'all' || getTeacherSubject(teacher) === subject;
    const matchesBranch = branch === 'all' || (teacher?.phanHieu || '').trim() === branch;
    return matchesSearch && matchesSubject && matchesBranch;
  }), [search, subject, branch, teachers]);

  const getCell = (teacher, day, lesson) => {
    const teacherId = String(teacher._id);
    const session = lesson <= 4 ? 'sang' : 'chieu';
    return slots[getSlotKey(teacherId, day, session, lesson)] || null;
  };

  const getTeacherSummary = (teacher) => {
    const phanCong = teacher?.phanCong || {};
    const soTietKiemNhiem = Number(phanCong.soTietKiemNhiem || 0);
    const soTietDinhMuc = Number(phanCong.soTietDinhMuc || 0);

    // Đếm số tiết thực tế từ TKB (slots chứa tất cả tiết đã xếp)
    const teacherId = String(teacher._id);
    const soTietDuocPhanCong = Object.keys(slots).filter(key => key.startsWith(teacherId + '-')).length;

    const duThieu = soTietDuocPhanCong + soTietKiemNhiem - soTietDinhMuc;

    return {
      phanHieu: teacher?.phanHieu || 'Chính',
      phanCongKiemNhiem: phanCong.phanCongKiemNhiem || '-',
      soTietKiemNhiem,
      soTietDinhMuc,
      soTietDuocPhanCong,
      duThieu
    };
  };

  const handlePrint = () => window.print();

  return (
    <div className="assignment-page">
      <div className="assignment-heading">
        <div>
          <p className="assignment-kicker">Bảng điều hành lịch dạy</p>
          <h2>Phân công giáo viên</h2>
          <p className="assignment-caption">Theo dõi lịch giảng dạy từ Thứ hai đến Thứ sáu</p>
        </div>
        <div className="assignment-heading-actions">
          <span className={`data-status ${usingSample ? 'sample' : 'live'}`}>
            <span className="status-dot" /> {usingSample ? 'Dữ liệu mẫu' : 'Đã đồng bộ'}
          </span>
          <button type="button" className="print-button" onClick={handlePrint}>In bảng</button>
        </div>
      </div>

      <div className="assignment-toolbar">
        <label>
          Năm học
          <select value={year} onChange={(event) => setYear(event.target.value)}>
            <option value="2024-2025">2024 - 2025</option>
            <option value="2025-2026">2025 - 2026</option>
            <option value="2026-2027">2026 - 2027</option>
          </select>
        </label>
        <label className="search-field">
          Tìm giáo viên
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nhập tên giáo viên..." />
        </label>
        <label>
          Môn dạy
          <select value={subject} onChange={(event) => setSubject(event.target.value)}>
            <option value="all">Tất cả môn</option>
            {subjects.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Phân hiệu
          <select value={branch} onChange={(event) => setBranch(event.target.value)}>
            <option value="all">Tất cả phân hiệu</option>
            {branches.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <div className="toolbar-summary"><strong>{visibleTeachers.length}</strong> giáo viên</div>
      </div>

      {loading && <div className="loading-bar" />}

      <div className="table-shell">
        <table className="assignment-table">
          <thead>
            <tr>
              <th rowSpan="2" className="number-column">TT</th>
              <th rowSpan="2" className="teacher-column">Họ tên giáo viên</th>
              <th rowSpan="2" className="branch-column">Phân hiệu</th>
              <th rowSpan="2" className="subject-column">Môn dạy</th>
              <th rowSpan="2" className="stat-column">Phân công kiêm nhiệm</th>
              <th rowSpan="2" className="stat-column">Số tiết kiêm nhiệm</th>
              <th rowSpan="2" className="stat-column">Số tiết định mức</th>
              <th rowSpan="2" className="stat-column">Số tiết được phân công</th>
              <th rowSpan="2" className="stat-column">Tổng số tiết Dư-Thiếu</th>
              <th rowSpan="2" className="lesson-column">Tiết</th>
              {DAYS.map((day) => <th key={day} colSpan="2" className="day-header">{DAY_LABELS[day]}</th>)}
            </tr>
            <tr>
              {DAYS.flatMap((day) => [
                <th key={`${day}-morning`} className="session-header">Sáng</th>,
                <th key={`${day}-afternoon`} className="session-header">Chiều</th>
              ])}
            </tr>
          </thead>
          <tbody>
            {visibleTeachers.flatMap((teacher, teacherIndex) => LESSONS.map((lesson, lessonIndex) => {
              const summary = getTeacherSummary(teacher);

              return (
                <tr key={`${teacher._id || teacherIndex}-${lesson}`}>
                  {lessonIndex === 0 && <td rowSpan={LESSONS.length} className="number-cell">{teacherIndex + 1}</td>}
                  {lessonIndex === 0 && <td rowSpan={LESSONS.length} className="teacher-cell"><strong>{getTeacherName(teacher)}</strong></td>}
                  {lessonIndex === 0 && <td rowSpan={LESSONS.length} className="branch-cell">{summary.phanHieu}</td>}
                  {lessonIndex === 0 && <td rowSpan={LESSONS.length} className="subject-cell">{getTeacherSubject(teacher)}</td>}
                  {lessonIndex === 0 && <td rowSpan={LESSONS.length} className="stat-cell">{summary.phanCongKiemNhiem}</td>}
                  {lessonIndex === 0 && <td rowSpan={LESSONS.length} className="stat-cell">{summary.soTietKiemNhiem}</td>}
                  {lessonIndex === 0 && <td rowSpan={LESSONS.length} className="stat-cell">{summary.soTietDinhMuc}</td>}
                  {lessonIndex === 0 && <td rowSpan={LESSONS.length} className="stat-cell">{summary.soTietDuocPhanCong}</td>}
                  {lessonIndex === 0 && <td rowSpan={LESSONS.length} className={`stat-cell du-thieu ${summary.duThieu >= 0 ? 'positive' : 'negative'}`}>{summary.duThieu}</td>}
                  <td className="lesson-cell">{lesson}</td>
                  {DAYS.flatMap((day) => [lesson, lesson + 4].map((actualLesson) => {
                    const cell = getCell(teacher, day, actualLesson);
                    const isHighlighted = (day === 2 && actualLesson === lesson && lesson === 1)
                      || (actualLesson === lesson + 4 && lesson === 4);
                    return <td key={`${day}-${actualLesson}`} className={`schedule-cell${isHighlighted ? ' highlighted' : ''}`}>{cell?.className || ''}</td>;
                  }))}
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      <p className="table-note"><span className="legend-empty" /> Ô xanh đánh dấu tiết 1 sáng Thứ hai và tiết 4 buổi chiều.</p>
    </div>
  );
}

export default BangPhanCongPage;