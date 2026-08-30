import { useState, useEffect, useMemo } from 'react';
import { khoiAPI, lopAPI, giaoVienAPI } from '../services/api';

const DANH_SACH_MON = [
  'Toán', 'Tiếng Việt', 'Tiếng Anh', 'Đạo đức', 'Thể dục',
  'Giáo dục thể chất', 'Âm nhạc', 'Mỹ thuật', 'Tin học',
  'Khoa học', 'Lịch sử và Địa lý', 'Công nghệ', 'Tự nhiên và Xã hội'
];

function LopChuyenMonPage() {
  const [khois, setKhois] = useState([]);
  const [selectedKhoi, setSelectedKhoi] = useState('');
  const [lops, setLops] = useState([]);
  const [giaoViens, setGiaoViens] = useState([]);
  const [allLops, setAllLops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filter phân hiệu (mặc định "all")
  const [selectedPhanHieu, setSelectedPhanHieu] = useState('all');

  // State cho modal chỉnh sửa môn học
  const [showModal, setShowModal] = useState(false);
  const [editingLop, setEditingLop] = useState(null);
  const [selectedMonHoc, setSelectedMonHoc] = useState([]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedKhoi) {
      fetchLops();
    }
  }, [selectedKhoi]);

  const fetchInitialData = async () => {
    try {
      const [khoisRes, gvRes, lopRes] = await Promise.all([
        khoiAPI.getAll(),
        giaoVienAPI.getAll(),
        lopAPI.getAll()
      ]);
      setKhois(khoisRes.data.data);
      setGiaoViens(gvRes.data.data);
      setAllLops(lopRes.data.data || []);
      if (khoisRes.data.data.length > 0) {
        setSelectedKhoi(khoisRes.data.data[0]._id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLops = async () => {
    try {
      const res = await lopAPI.getByKhoi(selectedKhoi);
      setLops(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Danh sách phân hiệu có trong các lớp của khối đang chọn
  const phanHieuOptions = useMemo(() => {
    const set = new Set();
    lops.forEach(l => {
      const ph = (l.phanHieu || '').trim();
      if (ph) set.add(ph);
    });
    return [...set].sort();
  }, [lops]);

  // Lọc lớp theo phân hiệu (nếu chọn)
  const visibleLops = useMemo(() => {
    if (selectedPhanHieu === 'all') return lops;
    return lops.filter(l => (l.phanHieu || '').trim() === selectedPhanHieu);
  }, [lops, selectedPhanHieu]);

  const openEditModal = (lop) => {
    setEditingLop(lop);
    setSelectedMonHoc(lop.chuyenMons || []);
    setShowModal(true);
  };

  const toggleMonHoc = (mon) => {
    if (selectedMonHoc.some(m => m.tenChuyenMon === mon)) {
      setSelectedMonHoc(selectedMonHoc.filter(m => m.tenChuyenMon !== mon));
    } else {
      // Lấy số tiết từ giáo viên đầu tiên có môn này
      const gvCoMon = getGVByMon(mon);
      const soTiet = gvCoMon[0]?.chuyenMon?.find(c => c.tenChuyenMon === mon)?.soTietTuan || 1;
      setSelectedMonHoc([...selectedMonHoc, { tenChuyenMon: mon, soTietTuan: soTiet }]);
    }
  };

  const updateSoTiet = (mon, soTiet) => {
    setSelectedMonHoc(
      selectedMonHoc.map(m => 
        m.tenChuyenMon === mon ? { ...m, soTietTuan: parseInt(soTiet) || 1 } : m
      )
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await lopAPI.updateChuyenMons(editingLop._id, selectedMonHoc);
      setShowModal(false);
      fetchLops();
      alert('Cập nhật thành công!');
    } catch (err) {
      alert('Lỗi: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const getGVByMon = (mon) => {
    return giaoViens.filter(gv => 
      gv.chuyenMon?.some(c => c.tenChuyenMon === mon)
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Phân công Môn học cho Lớp</h1>
        <p className="text-gray-600 mt-1">
          Chọn môn học và số tiết/tuần cho từng lớp. Chỉ môn đã phân công mới được xếp vào thời khóa biểu.
        </p>
      </div>

      {/* Chọn khối + Phân hiệu */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Chọn Khối</label>
            <div className="flex flex-wrap gap-2">
              {khois.map(khoi => (
                <button
                  key={khoi._id}
                  onClick={() => setSelectedKhoi(khoi._id)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    selectedKhoi === khoi._id
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {khoi.tenKhoi}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Lọc theo Phân hiệu</label>
            <select
              value={selectedPhanHieu}
              onChange={(e) => setSelectedPhanHieu(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">— Tất cả phân hiệu —</option>
              {phanHieuOptions.map(ph => (
                <option key={ph} value={ph}>{ph}</option>
              ))}
              {phanHieuOptions.length === 0 && (
                <option value="" disabled>Khối này chưa có phân hiệu</option>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Tổng hợp toàn trường: ma trận Môn × Khối */}
      {allLops.length > 0 && (() => {
        // Lọc theo phân hiệu
        const filteredAll = selectedPhanHieu === 'all'
          ? allLops
          : allLops.filter(l => (l.phanHieu || '').trim() === selectedPhanHieu);

        // Gom theo khoi
        const khoiMap = new Map(); // khoiId -> { tenKhoi, lops: [] }
        filteredAll.forEach(lop => {
          const khoiId = lop.khoi?._id || lop.khoi || '';
          const tenKhoi = lop.khoi?.tenKhoi || 'Chưa xác định';
          if (!khoiMap.has(khoiId)) khoiMap.set(khoiId, { tenKhoi, lops: [] });
          khoiMap.get(khoiId).lops.push(lop);
        });
        const khoiList = [...khoiMap.entries()].sort((a, b) => {
          // Sắp xếp khối theo số (1, 2, 3, 4, 5)
          const na = parseInt(a[1].tenKhoi.match(/\d+/)?.[0] || '999');
          const nb = parseInt(b[1].tenKhoi.match(/\d+/)?.[0] || '999');
          return na - nb;
        });

        // Tập hợp môn
        const monSet = new Set();
        filteredAll.forEach(lop => (lop.chuyenMons || []).forEach(m => m.tenChuyenMon && monSet.add(m.tenChuyenMon)));
        const monList = [...monSet].sort();

        // Ma trận: mon -> khoiId -> soTiet
        const matrix = {};
        monList.forEach(m => { matrix[m] = {}; });
        khoiList.forEach(([khoiId, info]) => {
          info.lops.forEach(lop => {
            (lop.chuyenMons || []).forEach(mon => {
              const ten = mon.tenChuyenMon || '';
              if (!ten) return;
              matrix[ten][khoiId] = (matrix[ten][khoiId] || 0) + (mon.soTietTuan || 0);
            });
          });
        });

        // Tổng theo khối
        const tongKhoi = {};
        khoiList.forEach(([khoiId]) => {
          tongKhoi[khoiId] = monList.reduce((s, m) => s + (matrix[m][khoiId] || 0), 0);
        });
        // Tổng theo môn (sum tất cả các khối)
        const grandTotals = {};
        monList.forEach(m => {
          grandTotals[m] = khoiList.reduce((s, [khoiId]) => s + (matrix[m][khoiId] || 0), 0);
        });
        const grandTotal = monList.reduce((s, m) => s + grandTotals[m], 0);

        if (filteredAll.length === 0) return null;

        return (
          <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-semibold text-gray-700">
                🏫 Tổng hợp toàn trường — Ma trận Môn × Khối
              </h3>
              <div className="text-sm text-gray-600">
                <span className="font-bold text-blue-700 text-lg">{grandTotal}</span> tiết/tuần toàn trường
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-blue-100">
                    <th className="px-3 py-2 text-left font-medium text-gray-700 border border-blue-200">Môn học</th>
                    {khoiList.map(([khoiId, info]) => (
                      <th key={khoiId} className="px-3 py-2 text-center font-medium text-gray-700 border border-blue-200">
                        {info.tenKhoi}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-bold text-blue-800 border border-blue-200 bg-blue-200">Tổng môn</th>
                  </tr>
                </thead>
                <tbody>
                  {monList.map(mon => {
                    const tongMonRow = grandTotals[mon];
                    return (
                      <tr key={mon} className="hover:bg-blue-50">
                        <td className="px-3 py-2 font-medium text-gray-800 border border-gray-200">{mon}</td>
                        {khoiList.map(([khoiId]) => {
                          const v = matrix[mon][khoiId] || 0;
                          return (
                            <td key={khoiId} className={`px-3 py-2 text-center border border-gray-200 ${v > 0 ? 'font-semibold text-gray-700' : 'text-gray-300'}`}>
                              {v > 0 ? v : '—'}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center font-bold text-blue-700 border border-blue-200 bg-blue-50">
                          {tongMonRow > 0 ? tongMonRow : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-100 font-bold">
                    <td className="px-3 py-2 border border-blue-200">Tổng khối</td>
                    {khoiList.map(([khoiId]) => (
                      <td key={khoiId} className="px-3 py-2 text-center text-blue-800 border border-blue-200">
                        {tongKhoi[khoiId] > 0 ? tongKhoi[khoiId] : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center text-blue-900 bg-blue-300 border border-blue-300">
                      {grandTotal}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Lọc theo phân hiệu: <strong>{selectedPhanHieu === 'all' ? 'Tất cả' : selectedPhanHieu}</strong> · Số lớp: <strong>{filteredAll.length}</strong> · Số khối: <strong>{khoiList.length}</strong>
            </p>
          </div>
        );
      })()}

      {/* Thống kê số tiết cần dạy theo môn */}
      {visibleLops.length > 0 && (
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <h3 className="text-base font-semibold text-gray-700 mb-3">
            📊 Thống kê số tiết cần dạy theo môn
            {selectedPhanHieu !== 'all' && (
              <span className="ml-2 font-normal text-sm text-gray-500">
                — Lọc theo phân hiệu: {selectedPhanHieu}
              </span>
            )}
          </h3>
          {(() => {
            // Tổng hợp số tiết theo môn
            const monStats = {};
            visibleLops.forEach(lop => {
              (lop.chuyenMons || []).forEach(mon => {
                const ten = mon.tenChuyenMon || mon.mon || '';
                if (!ten) return;
                if (!monStats[ten]) monStats[ten] = { soTiet: 0, soLop: 0 };
                monStats[ten].soTiet += mon.soTietTuan || 0;
                monStats[ten].soLop += 1;
              });
            });
            const sorted = Object.entries(monStats).sort((a, b) => b[1].soTiet - a[1].soTiet);
            const tongTatCa = sorted.reduce((s, [, v]) => s + v.soTiet, 0);
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Môn học</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Số lớp dạy</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Tổng tiết cần dạy/tuần</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Tỷ trọng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sorted.map(([ten, { soTiet, soLop }]) => (
                      <tr key={ten} className="hover:bg-blue-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{ten}</td>
                        <td className="px-3 py-2 text-center">{soLop} lớp</td>
                        <td className="px-3 py-2 text-center font-bold text-blue-700">{soTiet} tiết</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-500 h-2 rounded-full"
                                style={{ width: `${tongTatCa > 0 ? (soTiet / tongTatCa) * 100 : 0}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">
                              {tongTatCa > 0 ? Math.round((soTiet / tongTatCa) * 100) : 0}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 font-semibold">
                      <td className="px-3 py-2">Tổng cộng</td>
                      <td className="px-3 py-2 text-center">{sorted.length} môn</td>
                      <td className="px-3 py-2 text-center text-blue-700">{tongTatCa} tiết</td>
                      <td className="px-3 py-2">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* Danh sách lớp */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            Danh sách Lớp - {khois.find(k => k._id === selectedKhoi)?.tenKhoi}
            {selectedPhanHieu !== 'all' && (
              <span className="ml-2 inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-sm">
                Phân hiệu: {selectedPhanHieu}
              </span>
            )}
          </h2>
          <span className="text-sm text-gray-500">
            Hiển thị {visibleLops.length}/{lops.length} lớp
          </span>
        </div>

        {visibleLops.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {lops.length === 0
              ? 'Chưa có lớp nào trong khối này'
              : `Không có lớp nào thuộc phân hiệu "${selectedPhanHieu}"`}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Lớp</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Phân hiệu</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Môn học đã phân công</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tổng tiết/tuần</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {visibleLops.map(lop => {
                const monCount = lop.chuyenMons?.length || 0;
                const tongTiet = lop.chuyenMons?.reduce((sum, m) => sum + m.soTietTuan, 0) || 0;

                return (
                  <tr key={lop._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{lop.tenLop}</td>
                    <td className="px-4 py-3">
                      {lop.phanHieu ? (
                        <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                          {lop.phanHieu}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {monCount === 0 ? (
                        <span className="text-gray-400 italic">Chưa phân công</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {lop.chuyenMons.map((m, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800"
                            >
                              {m.tenChuyenMon} ({m.soTietTuan}t)
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{tongTiet > 0 ? `${tongTiet} tiết` : '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openEditModal(lop)}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Phân công môn
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal phân công môn học */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-semibold">
                Phân công Môn học - Lớp {editingLop?.tenLop}
              </h3>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-600">
                  Chọn các môn học và số tiết mỗi tuần cho lớp này:
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Chọn tất cả môn có GV, lấy số tiết từ GV
                      const allMonWithGV = DANH_SACH_MON.filter(mon => getGVByMon(mon).length > 0);
                      setSelectedMonHoc(
                        allMonWithGV.map(mon => {
                          const gvCoMon = getGVByMon(mon);
                          const soTiet = gvCoMon[0]?.chuyenMon?.find(c => c.tenChuyenMon === mon)?.soTietTuan || 1;
                          return { tenChuyenMon: mon, soTietTuan: soTiet };
                        })
                      );
                    }}
                    className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    onClick={() => setSelectedMonHoc([])}
                    className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Bỏ chọn tất cả
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {DANH_SACH_MON.map(mon => {
                  const isSelected = selectedMonHoc.some(m => m.tenChuyenMon === mon);
                  const gvCoMon = getGVByMon(mon);
                  const hasGV = gvCoMon.length > 0;
                  // Lấy số tiết mặc định từ GV đầu tiên
                  const soTietMacDinh = gvCoMon[0]?.chuyenMon?.find(c => c.tenChuyenMon === mon)?.soTietTuan;

                  return (
                    <div
                      key={mon}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : hasGV
                            ? 'border-gray-200 hover:border-gray-300'
                            : 'border-gray-200 opacity-50 cursor-not-allowed'
                      }`}
                      onClick={() => hasGV && toggleMonHoc(mon)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => hasGV && toggleMonHoc(mon)}
                            disabled={!hasGV}
                            className="w-4 h-4"
                          />
                          <span className="font-medium">{mon}</span>
                          {soTietMacDinh && (
                            <span className="text-xs text-gray-500">({soTietMacDinh} tiết)</span>
                          )}
                        </div>
                        {hasGV && !isSelected && (
                          <span className="text-xs text-green-600">
                            {gvCoMon.length} GV
                          </span>
                        )}
                      </div>

                      {isSelected && (
                        <div className="mt-2 pl-6 flex items-center gap-2">
                          <label className="text-sm text-gray-600">Số tiết/tuần:</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={selectedMonHoc.find(m => m.tenChuyenMon === mon)?.soTietTuan || 1}
                            onChange={(e) => updateSoTiet(mon, e.target.value)}
                            className="w-16 px-2 py-1 border rounded text-center"
                          />
                          <span className="text-sm text-gray-500">
                            (GV: {gvCoMon.map(g => g.hoTen).join(', ')})
                          </span>
                        </div>
                      )}

                      {!hasGV && (
                        <div className="mt-1 text-xs text-red-500 pl-6">
                          Không có GV cho môn này
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {selectedMonHoc.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Tổng hợp:</h4>
                  <div className="text-sm text-gray-600">
                    <p>Tổng môn: {selectedMonHoc.length}</p>
                    <p>Tổng tiết/tuần: {selectedMonHoc.reduce((sum, m) => sum + m.soTietTuan, 0)} tiết</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded"
                disabled={saving}
              >
                Hủy
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LopChuyenMonPage;
