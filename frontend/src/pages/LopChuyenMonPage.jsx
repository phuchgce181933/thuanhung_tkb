import { useState, useEffect } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      const [khoisRes, gvRes] = await Promise.all([
        khoiAPI.getAll(),
        giaoVienAPI.getAll()
      ]);
      setKhois(khoisRes.data.data);
      setGiaoViens(gvRes.data.data);
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

      {/* Chọn khối */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Chọn Khối</label>
        <div className="flex gap-2">
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

      {/* Danh sách lớp */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">
            Danh sách Lớp - {khois.find(k => k._id === selectedKhoi)?.tenKhoi}
          </h2>
        </div>

        {lops.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Chưa có lớp nào trong khối này
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Lớp</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Sĩ số</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Môn học đã phân công</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tổng tiết/tuần</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {lops.map(lop => {
                const monCount = lop.chuyenMons?.length || 0;
                const tongTiet = lop.chuyenMons?.reduce((sum, m) => sum + m.soTietTuan, 0) || 0;
                
                return (
                  <tr key={lop._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{lop.tenLop}</td>
                    <td className="px-4 py-3 text-gray-600">{lop.siSo || '-'}</td>
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
