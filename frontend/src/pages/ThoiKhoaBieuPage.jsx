import { Fragment, useState, useEffect } from 'react';
import { lopAPI, khoiAPI, tkbAPI, giaoVienAPI } from '../services/api';

const THU_NAMES = ['', '', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];
const BUOI_CONFIG = {
  sang: { label: 'Sáng', tiets: [1, 2, 3, 4], moTa: ['Chào cờ', 'Tiết 2', 'Tiết 3', 'Tiết 4'] },
  chieu: { label: 'Chiều', tiets: [5, 6, 7], moTa: ['Tiết 5', 'Tiết 6', 'Tiết 7'] }
};

const QUY_TAC_TKB = [
  { icon: '🚫', text: 'Giáo viên không dạy 2 lớp cùng một tiết' },
  { icon: '📚', text: 'Mỗi buổi (sáng/chiều) chỉ xếp tối đa 1 tiết cho mỗi môn' },
  { icon: '🌅', text: 'Buổi sáng: 4 tiết (tiết 1 = chào cờ)' },
  { icon: '🌇', text: 'Buổi chiều: 3 tiết' },
  { icon: '📅', text: 'Học từ Thứ 2 đến Thứ 6' },
  { icon: '🎯', text: 'Tôn trọng nguyện vọng giáo viên (số buổi tối đa, thứ nghỉ, thứ ưu tiên)' },
  { icon: '⚖️', text: 'Cân bằng số tiết giữa các giáo viên cùng chuyên môn' }
];

function ThoiKhoaBieuPage() {
  const [lops, setLops] = useState([]);
  const [khois, setKhois] = useState([]);
  const [tkb, setTkb] = useState(null);
  const [giaoViens, setGiaoViens] = useState([]);
  const [viPhamNV, setViPhamNV] = useState(null); // {tongSoTiet, danhSachGV} khi có vi phạm
  const [thongKeBuoi, setThongKeBuoi] = useState(null); // mảng thống kê desired/actual per GV
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedLop, setSelectedLop] = useState('');
  const [selectedKhoi, setSelectedKhoi] = useState('');
  const [namHoc, setNamHoc] = useState('2024-2025');
  const [viewMode, setViewMode] = useState('lop'); // 'lop' or 'giao-vien'
  const [selectedGV, setSelectedGV] = useState('');
  const [gvSchedule, setGvSchedule] = useState([]);
  const [expandedGV, setExpandedGV] = useState(null); // GV đang mở rộng chi tiết
  const [showConfirmModal, setShowConfirmModal] = useState(false); // modal xác nhận sắp xếp TKB

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedLop && namHoc) {
      fetchTKB();
    }
  }, [selectedLop, namHoc]);

  useEffect(() => {
    if (selectedGV && namHoc) {
      fetchGVSchedule();
    }
  }, [selectedGV, namHoc]);

  const fetchInitialData = async () => {
    try {
      const [khoisRes, lopsRes, gvRes] = await Promise.all([
        khoiAPI.getAll(),
        lopAPI.getAll(),
        giaoVienAPI.getAll()
      ]);
      setKhois(khoisRes.data.data);
      setLops(lopsRes.data.data);
      setGiaoViens(gvRes.data.data);
      
      if (lopsRes.data.data.length > 0) {
        setSelectedLop(lopsRes.data.data[0]._id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTKB = async () => {
    try {
      setLoading(true);
      const response = await tkbAPI.getByLop(selectedLop, namHoc);
      if (response.data.success) {
        setTkb(response.data.data);
      } else {
        setTkb(null);
      }
    } catch (err) {
      setTkb(null);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGVSchedule = async () => {
    try {
      setLoading(true);
      const response = await tkbAPI.getByGiaoVien(selectedGV, namHoc);
      if (response.data.success) {
        setGvSchedule(response.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTKB = async () => {
    setShowConfirmModal(true);
  };

  const confirmGenerateTKB = async () => {
    setShowConfirmModal(false);

    try {
      setGenerating(true);
      setViPhamNV(null);
      setThongKeBuoi(null);
      const result = await tkbAPI.autoGenerate(namHoc);

      if (result.data.success) {
        // Lưu thống kê buổi để hiển thị
        if (result.data.thongKeBuoi) {
          setThongKeBuoi(result.data.thongKeBuoi);
        }
        // Hiện modal vi phạm NV nếu có
        if (result.data.viPhamNV && result.data.viPhamNV.tongSoTiet > 0) {
          setViPhamNV(result.data.viPhamNV);
        } else if (result.data.warnings && result.data.warnings.length > 0) {
          let message = result.data.message + '\n\nCảnh báo:\n' + result.data.warnings.slice(0, 10).join('\n');
          if (result.data.warnings.length > 10) {
            message += `\n... và ${result.data.warnings.length - 10} cảnh báo khác`;
          }
          alert(message);
        } else {
          alert(result.data.message);
        }
      } else {
        alert('Lỗi: ' + result.data.message);
      }

      if (selectedLop) fetchTKB();
      if (selectedGV) fetchGVSchedule();
    } catch (err) {
      alert('Lỗi khi sắp xếp TKB: ' + (err.response?.data?.message || err.message));
    } finally {
      setGenerating(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      await tkbAPI.exportExcel(namHoc);
    } catch (err) {
      alert('Lỗi khi xuất Excel: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleKhoiChange = (khoiId) => {
    setSelectedKhoi(khoiId);
    const filteredLops = khoiId 
      ? lops.filter(l => l.khoi === khoiId || l.khoi?._id === khoiId)
      : lops;
    
    setSelectedLop(filteredLops.length > 0 ? filteredLops[0]._id : '');
  };

  const filteredLops = selectedKhoi
    ? lops.filter(l => l.khoi === selectedKhoi || l.khoi?._id === selectedKhoi)
    : lops;

  // Tạo grid TKB
  const renderTKBGrid = () => {
    if (!tkb || !tkb.ngayTrongTuan) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">Chưa có thời khóa biểu</p>
          <p className="text-sm mt-2">Nhấn "Sắp xếp TKB tự động" để tạo</p>
        </div>
      );
    }

    const weekdays = [2, 3, 4, 5, 6]; // Thứ 2 - Thứ 6

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-center font-medium w-24">Buổi</th>
              {weekdays.map(thu => (
                <th key={thu} className="border border-gray-300 px-4 py-3 text-center font-medium min-w-32">
                  {THU_NAMES[thu]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(BUOI_CONFIG).map(([buoi, config]) => (
              <Fragment key={`grid-${buoi}`}>
                <tr className="bg-blue-50">
                  <td colSpan={6} className="border border-gray-300 px-4 py-2 font-semibold text-blue-800">
                    Buổi {config.label}
                  </td>
                </tr>
                {config.tiets.map((tiet, idx) => (
                  <tr key={`${buoi}-${tiet}`} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2 text-center bg-gray-50">
                      <div className="font-medium">{tiet}</div>
                      <div className="text-xs text-gray-500">{config.moTa[idx]}</div>
                    </td>
                    {weekdays.map(thu => {
                      const ngay = tkb.ngayTrongTuan.find(
                        n => n.thu === thu && n.buoi === buoi
                      );
                      const tietHoc = ngay?.tiets.find(t => t.tiet === tiet);
                      const isChaoCo = buoi === 'sang' && tiet === 1 && thu === 2;

                      return (
                        <td key={`${thu}-${buoi}-${tiet}`} 
                            className={`border border-gray-300 px-2 py-2 text-center min-h-16 ${
                              isChaoCo ? 'bg-yellow-100' : ''
                            }`}>
                          {isChaoCo ? (
                            <div className="text-yellow-700 font-medium">📢 Chào cờ</div>
                          ) : tietHoc ? (
                            <div>
                              <div className="font-medium text-blue-700">{tietHoc.chuyenMon}</div>
                              <div className="text-sm text-gray-600">
                                {tietHoc.giaoVien?.hoTen || 'GV'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // TKB theo giáo viên
  const renderGVSchedule = () => {
    if (!selectedGV) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p>Chọn giáo viên để xem lịch dạy</p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      );
    }

    if (gvSchedule.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p>Giáo viên chưa có lịch dạy</p>
        </div>
      );
    }

    const weekdays = [2, 3, 4, 5, 6];
    const buois = ['sang', 'chieu'];

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-3 text-center w-24">Buổi/Tiết</th>
              {weekdays.map(thu => (
                <th key={thu} className="border border-gray-300 px-4 py-3 text-center">
                  {THU_NAMES[thu]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buois.map(buoi => (
              <Fragment key={`gv-${buoi}`}>
                <tr className="bg-blue-50">
                  <td colSpan={6} className="border border-gray-300 px-4 py-2 font-semibold text-blue-800">
                    Buổi {BUOI_CONFIG[buoi].label}
                  </td>
                </tr>
                {BUOI_CONFIG[buoi].tiets.map(tiet => (
                  <tr key={`${buoi}-${tiet}`} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2 text-center bg-gray-50 font-medium">
                      Tiết {tiet}
                    </td>
                    {weekdays.map(thu => {
                      const tietHocs = gvSchedule.filter(
                        s => s.thu === thu && s.buoi === buoi && s.tiet === tiet
                      );
                      return (
                        <td key={`${thu}-${buoi}-${tiet}`}
                            className="border border-gray-300 px-2 py-2 text-center min-h-16">
                          {tietHocs.length > 0 ? (
                            <div className="space-y-1">
                              {tietHocs.map((tietHoc, idx) => (
                                <div key={`${thu}-${buoi}-${tiet}-${idx}`} className="bg-green-100 rounded p-1">
                                  <div className="font-medium text-green-800 text-sm">{tietHoc.lop?.tenLop}</div>
                                  <div className="text-xs text-green-600">{tietHoc.chuyenMon}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading && lops.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Thời Khóa Biểu</h2>
        <div className="flex gap-4 items-center">
          <select
            value={namHoc}
            onChange={(e) => setNamHoc(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="2024-2025">2024-2025</option>
            <option value="2025-2026">2025-2026</option>
            <option value="2026-2027">2026-2027</option>
          </select>
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            📥 Xuất Excel
          </button>
          <button
            onClick={handleGenerateTKB}
            disabled={generating}
            className={`px-4 py-2 rounded-lg text-white transition-colors ${
              generating 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {generating ? 'Đang sắp xếp...' : '🔄 Sắp xếp TKB tự động'}
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setViewMode('lop')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'lop'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Theo Lớp
        </button>
        <button
          onClick={() => setViewMode('giao-vien')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'giao-vien'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Theo Giáo Viên
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        {viewMode === 'lop' ? (
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Khối</label>
              <select
                value={selectedKhoi}
                onChange={(e) => handleKhoiChange(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tất cả các khối</option>
                {khois.map(k => (
                  <option key={k._id} value={k._id}>{k.tenKhoi}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Lớp</label>
              <select
                value={selectedLop}
                onChange={(e) => setSelectedLop(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-32"
              >
                {filteredLops.map(l => (
                  <option key={l._id} value={l._id}>{l.tenLop}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Giáo Viên</label>
              <select
                value={selectedGV}
                onChange={(e) => setSelectedGV(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-48"
              >
                <option value="">Chọn giáo viên</option>
                {giaoViens.filter(g => g.trangThai === 'active').map(gv => (
                  <option key={gv._id} value={gv._id}>
                    {gv.hoTen} ({gv.chuyenMon.map(c => c.tenChuyenMon).join(', ')})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* TKB Info */}
      {viewMode === 'lop' && tkb && (
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-lg text-blue-800">
            {tkb.lop?.tenLop} - {tkb.lop?.khoi?.tenKhoi}
          </h3>
          <p className="text-blue-600">Năm học: {tkb.namHoc}</p>
        </div>
      )}

      {/* TKB Content */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-600">Đang tải...</p>
          </div>
        ) : (
          viewMode === 'lop' ? renderTKBGrid() : renderGVSchedule()
        )}
      </div>

      {/* Thống kê nguyện vọng buổi */}
      {thongKeBuoi && thongKeBuoi.length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Thống kê nguyện vọng số buổi của giáo viên</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left">Giáo viên</th>
                  <th className="px-3 py-2 text-center">Nguyện vọng</th>
                  <th className="px-3 py-2 text-center">Thực tế</th>
                  <th className="px-3 py-2 text-center">Trạng thái</th>
                  <th className="px-3 py-2 text-left">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {thongKeBuoi.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{row.gv}</td>
                    <td className="px-3 py-2 text-center">{row.desired ?? '—'}</td>
                    <td className="px-3 py-2 text-center">{row.actual}</td>
                    <td className="px-3 py-2 text-center">
                      {row.satisfied === null ? (
                        <span className="text-gray-500">—</span>
                      ) : row.satisfied ? (
                        <span className="text-green-700">✓ Đạt</span>
                      ) : (
                        <span className="text-orange-700">⚠ Không đạt</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 text-sm text-gray-600">
        <h4 className="font-medium mb-2">Ghi chú:</h4>
        <ul className="list-disc list-inside space-y-1">
          <li><span className="bg-yellow-100 px-2 py-1 rounded">Tiết 1 buổi sáng</span>: Luôn là Chào cờ</li>
          <li>Sáng: 4 tiết (1-4), Chiều: 3 tiết (5-7)</li>
          <li>Học từ Thứ 2 đến Thứ 6</li>
        </ul>
      </div>

      {/* Modal xác nhận sắp xếp TKB - chuyên nghiệp */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !generating && setShowConfirmModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 my-8 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header gradient */}
            <div className="px-6 py-5 bg-gradient-to-r from-green-600 to-emerald-600 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-2xl">
                    🔄
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Sắp xếp Thời Khóa Biểu tự động</h3>
                    <p className="text-sm text-green-50 mt-0.5">Năm học {namHoc}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={generating}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1.5 transition-colors disabled:opacity-50"
                  title="Đóng"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                  📋 Quy tắc sắp xếp
                </h4>
                <ul className="space-y-2.5">
                  {QUY_TAC_TKB.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-700">
                      <span className="text-lg leading-none mt-0.5">{rule.icon}</span>
                      <span className="flex-1">{rule.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-2">
                <div className="flex items-start gap-3">
                  <span className="text-amber-600 text-xl">⚠️</span>
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-amber-900 mb-1">Lưu ý quan trọng</p>
                    <p className="text-amber-800">
                      <b>Dữ liệu TKB cũ</b> của tất cả các lớp trong năm học <b>{namHoc}</b> sẽ bị
                      <b className="text-red-700"> thay thế hoàn toàn</b>. Hành động này không thể hoàn tác.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="text-blue-600 text-xl">ℹ️</span>
                  <div className="flex-1 text-sm text-blue-800">
                    <p>
                      Hệ thống sẽ <b>đảm bảo đủ số tiết</b> cho mỗi lớp theo phân công chuyên môn.
                      Nếu không thể xếp đủ, hệ thống sẽ thông báo lỗi cụ thể để bạn bổ sung giáo viên
                      hoặc điều chỉnh nguyện vọng.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={generating}
                className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={confirmGenerateTKB}
                disabled={generating}
                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang sắp xếp...
                  </>
                ) : (
                  <>🚀 Bắt đầu sắp xếp</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cảnh báo vi phạm nguyện vọng */}
      {viPhamNV && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 my-8 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b bg-orange-50">
              <h3 className="text-lg font-semibold text-orange-800">
                ⚠️ Giáo viên có nguyện vọng - hệ thống không tìm được hướng giải quyết
              </h3>
              <p className="text-sm text-orange-700 mt-1">
                Đã phải xếp <b>{viPhamNV.tongSoTiet} tiết</b> vi phạm nguyện vọng giáo viên (do không tìm được phương án khác):
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-3">
                {viPhamNV.danhSachGV.map((gv, idx) => (
                  <div key={idx} className="border border-orange-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedGV(expandedGV === idx ? null : idx)}
                      className="w-full px-4 py-3 bg-orange-50 hover:bg-orange-100 flex justify-between items-center text-left"
                    >
                      <div>
                        <div className="font-semibold text-gray-800">{gv.tenGV}</div>
                        <div className="text-sm text-orange-700 mt-0.5">{gv.lyDo}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-orange-600 text-white text-xs px-2 py-1 rounded">
                          {gv.soTiet} tiết vi phạm
                        </span>
                        <span className="text-gray-500">
                          {expandedGV === idx ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>

                    {expandedGV === idx && (
                      <div className="px-4 py-3 bg-white border-t border-orange-200">
                        <p className="text-sm font-medium text-gray-700 mb-2">Chi tiết các tiết bị ảnh hưởng:</p>
                        <div className="space-y-1 text-sm">
                          {gv.chiTiet.map((line, i) => (
                            <div key={i} className="px-2 py-1 bg-gray-50 rounded font-mono text-xs">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-5 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                💡 <b>Gợi ý xử lý:</b>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Tăng "Số buổi tối đa" cho giáo viên, hoặc</li>
                  <li>Bỏ/bớt "Thứ nghỉ" trong nguyện vọng, hoặc</li>
                  <li>Thêm giáo viên khác cùng chuyên môn để phân bổ tiết</li>
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setViPhamNV(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThoiKhoaBieuPage;
