import { useState, useEffect } from 'react';
import { giaoVienAPI, lopAPI } from '../services/api';

const CHUYEN_MON_LIST = [
  'Toán', 'Tiếng Việt', 'Tiếng Anh', 'Khoa học', 
  'Lịch sử và Địa lý', 'Đạo đức', 'Thể dục', 'Giáo dục thể chất',
  'Âm nhạc', 'Mỹ thuật', 'Tự nhiên và Xã hội',
  'Tin học', 'Công nghệ'
];

const normalizeText = (value) => String(value || '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function GiaoVienPage() {
  const [giaoViens, setGiaoViens] = useState([]);
  const [lopList, setLopList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingGV, setEditingGV] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPhanHieu, setFilterPhanHieu] = useState('');
  const [formData, setFormData] = useState({
    hoTen: '',
    phanHieu: '',
    phanHieuDieuChuyen: '',
    chuyenMon: [],
    trangThai: 'active',
    nguyenVong: {
      soBuoiToiDa: null,
      buoiUuTien: 'ca_hai',
      thuNghi: []
    },
    phanCong: {
      phanCongKiemNhiem: '',
      soTietKiemNhiem: 0,
      soTietDinhMuc: 0,
      soTietDuocPhanCong: 0,
      soTietDieuChuyen: 0,
      lopDieuChuyen: [],
      tongSoTietDuThieu: 0
    }
  });

  useEffect(() => {
    fetchGiaoViens();
    fetchLops();
  }, []);

  const fetchGiaoViens = async () => {
    try {
      setLoading(true);
      const response = await giaoVienAPI.getAll();
      setGiaoViens(response.data.data);
      setError('');
    } catch (err) {
      setError('Không thể tải danh sách giáo viên');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLops = async () => {
    try {
      const response = await lopAPI.getAll();
      setLopList(response.data.data || []);
    } catch (err) {
      console.error('Không thể tải danh sách lớp:', err);
      setLopList([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const eligibleClassIds = new Set(lopPhuHop.map(lop => String(lop._id)));
      const selectedClassIds = (formData.phanCong.lopDieuChuyen || [])
        .filter(lopId => eligibleClassIds.has(String(lopId)));
      const submitData = {
        ...formData,
        phanCong: { ...formData.phanCong, lopDieuChuyen: selectedClassIds }
      };
      if (editingGV) {
        await giaoVienAPI.update(editingGV._id, submitData);
      } else {
        await giaoVienAPI.create(submitData);
      }
      fetchGiaoViens();
      closeModal();
    } catch (err) {
      alert(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const emptyNguyenVong = () => ({
    soBuoiToiDa: null,
    buoiUuTien: 'ca_hai',
    thuNghi: []
  });

  const emptyPhanCong = () => ({
    phanCongKiemNhiem: '',
    soTietKiemNhiem: 0,
    soTietDinhMuc: 0,
    soTietDuocPhanCong: 0,
    soTietDieuChuyen: 0,
    lopDieuChuyen: [],
    tongSoTietDuThieu: 0
  });

  const calculatePhanCongDinhMuc = (phanCong = {}) => {
    const soTietKiemNhiem = Number(phanCong.soTietKiemNhiem || 0);
    const soTietDinhMuc = Number(phanCong.soTietDinhMuc || 0);
    return Math.max(0, soTietDinhMuc - soTietKiemNhiem);
  };

  const calculateDuThieu = (phanCong = {}) => {
    const soTietDuocPhanCong = Number(phanCong.soTietDuocPhanCong || 0);
    const soTietKiemNhiem = Number(phanCong.soTietKiemNhiem || 0);
    const soTietDieuChuyen = Number(phanCong.soTietDieuChuyen || 0);
    const soTietDinhMuc = Number(phanCong.soTietDinhMuc || 0);
    return soTietDuocPhanCong + soTietKiemNhiem + soTietDieuChuyen - soTietDinhMuc;
  };

  const handleEdit = (gv) => {
    setEditingGV(gv);
    setFormData({
      hoTen: gv.hoTen,
      phanHieu: gv.phanHieu || '',
      phanHieuDieuChuyen: gv.phanHieuDieuChuyen || '',
      chuyenMon: gv.chuyenMon || [],
      trangThai: gv.trangThai || 'active',
      nguyenVong: gv.nguyenVong
        ? {
            soBuoiToiDa: gv.nguyenVong.soBuoiToiDa ?? null,
            buoiUuTien: gv.nguyenVong.buoiUuTien || 'ca_hai',
            thuNghi: gv.nguyenVong.thuNghi || []
          }
        : emptyNguyenVong(),
      phanCong: gv.phanCong
        ? {
            phanCongKiemNhiem: gv.phanCong.phanCongKiemNhiem || '',
            soTietKiemNhiem: Number(gv.phanCong.soTietKiemNhiem || 0),
            soTietDinhMuc: Number(gv.phanCong.soTietDinhMuc || 0),
            soTietDuocPhanCong: Number(gv.phanCong.soTietDuocPhanCong || 0),
            soTietDieuChuyen: Number(gv.phanCong.soTietDieuChuyen || 0),
            lopDieuChuyen: gv.phanCong.lopDieuChuyen || [],
            tongSoTietDuThieu: Number(gv.phanCong.tongSoTietDuThieu || calculateDuThieu(gv.phanCong))
          }
        : emptyPhanCong()
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Bạn có chắc muốn xóa giáo viên này?')) {
      try {
        await giaoVienAPI.delete(id);
        fetchGiaoViens();
      } catch (err) {
        alert(err.response?.data?.message || 'Không thể xóa giáo viên');
      }
    }
  };

  const openModal = () => {
    setEditingGV(null);
    setFormData({
      hoTen: '',
      phanHieu: '',
      phanHieuDieuChuyen: '',
      chuyenMon: [],
      trangThai: 'active',
      nguyenVong: emptyNguyenVong(),
      phanCong: emptyPhanCong()
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingGV(null);
  };

  const phanHieuOptions = [...new Set([
    ...lopList.map(lop => lop.phanHieu).filter(Boolean),
    formData.phanHieu
  ])].sort((first, second) => first.localeCompare(second, 'vi', { numeric: true }));

  // Lọc lớp theo chuyên môn VÀ phân hiệu.
  // Mặc định: chỉ hiển thị lớp thuộc phân hiệu của GV (nếu GV có phanHieu).
  // Lớp thuộc phân hiệu khác = lớp "điều chuyển" tiềm năng (đánh dấu badge).
  const lopPhuHop = lopList.filter(lop => {
    const teacherSubjects = formData.chuyenMon.map(cm => normalizeText(cm.tenChuyenMon));
    const hasAssignedSubject = (lop.chuyenMons || []).some(cm =>
      teacherSubjects.includes(normalizeText(cm.tenChuyenMon))
    );
    if (!hasAssignedSubject) return false;
    // Nếu GV chưa có phân hiệu → hiển thị tất cả
    if (!formData.phanHieu) return true;
    // Ưu tiên lớp cùng phân hiệu; vẫn hiển thị lớp khác phân hiệu (để user chọn điều chuyển)
    return true;
  });
  const lopChinh = lopPhuHop.filter(lop => !formData.phanHieu || lop.phanHieu === formData.phanHieu);
  const lopDieuChuyen = lopPhuHop.filter(lop => formData.phanHieu && lop.phanHieu !== formData.phanHieu);

  const addChuyenMon = () => {
    setFormData({
      ...formData,
      chuyenMon: [...formData.chuyenMon, { tenChuyenMon: '', soTietTuan: 1 }]
    });
  };

  const removeChuyenMon = (index) => {
    setFormData({
      ...formData,
      chuyenMon: formData.chuyenMon.filter((_, i) => i !== index)
    });
  };

  const updateChuyenMon = (index, field, value) => {
    const newChuyenMon = [...formData.chuyenMon];
    newChuyenMon[index] = { ...newChuyenMon[index], [field]: value };
    setFormData({ ...formData, chuyenMon: newChuyenMon });
  };

  const updateNguyenVong = (field, value) => {
    setFormData({
      ...formData,
      nguyenVong: { ...formData.nguyenVong, [field]: value }
    });
  };

  const updatePhanCong = (field, value) => {
    const nextPhanCong = { ...formData.phanCong, [field]: value };
    if (field !== 'tongSoTietDuThieu') {
      nextPhanCong.tongSoTietDuThieu = calculateDuThieu(nextPhanCong);
    }
    setFormData({
      ...formData,
      phanCong: nextPhanCong
    });
  };

  const toggleLopDieuChuyen = (lopId) => {
    const current = formData.phanCong.lopDieuChuyen || [];
    const normalizedId = String(lopId);
    const next = current.some(id => String(id) === normalizedId)
      ? current.filter(id => String(id) !== normalizedId)
      : [...current, normalizedId];
    updatePhanCong('lopDieuChuyen', next);
  };

  const toggleThuNghi = (thu) => {
    const current = formData.nguyenVong.thuNghi || [];
    const next = current.includes(thu)
      ? current.filter(t => t !== thu)
      : [...current, thu].sort((a, b) => a - b);
    updateNguyenVong('thuNghi', next);
  };

  const phanHieuFilterOptions = [...new Set([
    ...lopList.map(lop => lop.phanHieu).filter(Boolean),
    ...giaoViens.map(gv => gv.phanHieu).filter(Boolean)
  ])].sort((first, second) => first.localeCompare(second, 'vi', { numeric: true }));

  const filteredGVs = giaoViens.filter(gv => {
    const matchesName = gv.hoTen.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPhanHieu = !filterPhanHieu || gv.phanHieu === filterPhanHieu;
    return matchesName && matchesPhanHieu;
  });

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Quản Lý Giáo Viên</h2>
        <div className="flex gap-4 items-center">
          <input
            type="text"
            placeholder="Tìm kiếm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterPhanHieu}
            onChange={(e) => setFilterPhanHieu(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả phân hiệu</option>
            {phanHieuFilterOptions.map(phanHieu => (
              <option key={phanHieu} value={phanHieu}>{phanHieu}</option>
            ))}
          </select>
          <button
            onClick={openModal}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Thêm Giáo Viên
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-2 text-gray-600">Đang tải...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          {filteredGVs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Chưa có giáo viên nào.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">STT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Họ tên giáo viên</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phân hiệu</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chuyên môn</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phân công</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nguyện vọng</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredGVs.map((gv, index) => (
                  <tr key={gv._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{gv.hoTen}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      <div>{gv.phanHieu || 'Tất cả'}</div>
                      {gv.phanHieuDieuChuyen && (
                        <div className="text-xs text-orange-600 mt-0.5">
                          → Điều chuyển: <b>{gv.phanHieuDieuChuyen}</b>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div className="flex flex-wrap gap-1">
                        {(gv.chuyenMon || []).map((cm, idx) => (
                          <span key={idx} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs whitespace-nowrap">
                            {cm.tenChuyenMon} ({cm.soTietTuan})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      Phân công định mức: {calculatePhanCongDinhMuc(gv.phanCong)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div className="space-y-1 whitespace-nowrap">
                        {gv.nguyenVong?.soBuoiToiDa && <div>Tối đa {gv.nguyenVong.soBuoiToiDa} buổi</div>}
                        {gv.nguyenVong?.buoiUuTien && gv.nguyenVong.buoiUuTien !== 'ca_hai' && (
                          <div>Ưu tiên {gv.nguyenVong.buoiUuTien === 'sang' ? 'sáng' : 'chiều'}</div>
                        )}
                        {gv.nguyenVong?.thuNghi?.length > 0 && (
                          <div>Nghỉ: {gv.nguyenVong.thuNghi.map(thu => `T${thu}`).join(', ')}</div>
                        )}
                        {!gv.nguyenVong?.soBuoiToiDa && (!gv.nguyenVong?.buoiUuTien || gv.nguyenVong.buoiUuTien === 'ca_hai') && !gv.nguyenVong?.thuNghi?.length && (
                          <span className="text-gray-400">Chưa thiết lập</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs ${
                        gv.trangThai === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {gv.trangThai === 'active' ? 'Hoạt động' : 'Không hoạt động'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium whitespace-nowrap">
                      <button onClick={() => handleEdit(gv)} className="text-blue-600 hover:text-blue-900 mr-4">Sửa</button>
                      <button onClick={() => handleDelete(gv._id)} className="text-red-600 hover:text-red-900">Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-800">
                {editingGV ? 'Sửa Giáo Viên' : 'Thêm Giáo Viên Mới'}
              </h3>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Họ Tên *
                  </label>
                  <input
                    type="text"
                    value={formData.hoTen}
                    onChange={(e) => setFormData({ ...formData, hoTen: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nhập họ tên giáo viên"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phân hiệu
                  </label>
                  <select
                    value={formData.phanHieu}
                    onChange={(e) => setFormData({ ...formData, phanHieu: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Tất cả phân hiệu</option>
                    {phanHieuOptions.map(phanHieu => (
                      <option key={phanHieu} value={phanHieu}>{phanHieu}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phân hiệu ưu tiên điều chuyển
                  </label>
                  <select
                    value={formData.phanHieuDieuChuyen || ''}
                    onChange={(e) => setFormData({ ...formData, phanHieuDieuChuyen: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Không điều chuyển --</option>
                    {phanHieuOptions
                      .filter(ph => ph !== formData.phanHieu)
                      .map(phanHieu => (
                        <option key={phanHieu} value={phanHieu}>{phanHieu}</option>
                      ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Khi đã dạy đủ định mức tại phân hiệu chính, GV sẽ được ưu tiên điều chuyển sang phân hiệu này (nếu phân hiệu đó đang thiếu).
                  </p>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Chuyên Môn *
                    </label>
                    <button
                      type="button"
                      onClick={addChuyenMon}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      + Thêm chuyên môn
                    </button>
                  </div>
                  
                  {formData.chuyenMon.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">Chưa có chuyên môn nào</p>
                  ) : (
                    <div className="space-y-2">
                      {formData.chuyenMon.map((cm, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <select
                            value={cm.tenChuyenMon}
                            onChange={(e) => updateChuyenMon(index, 'tenChuyenMon', e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          >
                            <option value="">Chọn chuyên môn</option>
                            {CHUYEN_MON_LIST.map(cmName => (
                              <option key={cmName} value={cmName}>{cmName}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={cm.soTietTuan}
                            onChange={(e) => updateChuyenMon(index, 'soTietTuan', parseInt(e.target.value) || 1)}
                            className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min="1"
                            max="20"
                          />
                          <span className="text-sm text-gray-500">tiết</span>
                          <button
                            type="button"
                            onClick={() => removeChuyenMon(index)}
                            className="text-red-600 hover:text-red-800 px-2"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trạng Thái
                  </label>
                  <select
                    value={formData.trangThai}
                    onChange={(e) => setFormData({ ...formData, trangThai: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Hoạt động</option>
                    <option value="inactive">Không hoạt động</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">
                    Phân công
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phân công kiêm nhiệm
                      </label>
                      <input
                        type="text"
                        value={formData.phanCong.phanCongKiemNhiem}
                        onChange={(e) => updatePhanCong('phanCongKiemNhiem', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ví dụ: Dạy thay 1A2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Số tiết kiêm nhiệm
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.phanCong.soTietKiemNhiem}
                        onChange={(e) => updatePhanCong('soTietKiemNhiem', Number(e.target.value || 0))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Số tiết định mức
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.phanCong.soTietDinhMuc}
                        onChange={(e) => updatePhanCong('soTietDinhMuc', Number(e.target.value || 0))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tổng số tiết Dư-Thiếu
                      </label>
                      <input
                        type="number"
                        value={formData.phanCong.tongSoTietDuThieu}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-semibold"
                      />
                    </div>
                  </div>

                </div>

                <div className="pt-3 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">
                    Nguyện vọng <span className="text-xs font-normal text-gray-500">(tùy chọn)</span>
                  </h4>

                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Số buổi tối đa trong tuần
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.nguyenVong.soBuoiToiDa ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateNguyenVong('soBuoiToiDa', v === '' ? null : parseInt(v, 10));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Để trống = không giới hạn (1 buổi = 1 thứ × 1 ca sáng/chiều)"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      VD: 4 = dạy tối đa 4 buổi/tuần (hệ thống sẽ gom sáng+chiều cùng ngày).
                    </p>
                  </div>

                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Buổi ưu tiên
                    </label>
                    <select
                      value={formData.nguyenVong.buoiUuTien}
                      onChange={(e) => updateNguyenVong('buoiUuTien', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ca_hai">Cả hai</option>
                      <option value="sang">Sáng</option>
                      <option value="chieu">Chiều</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Thứ nghỉ cố định
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[2, 3, 4, 5, 6].map(thu => (
                        <label
                          key={thu}
                          className={`cursor-pointer px-3 py-1.5 border rounded-lg text-sm select-none transition-colors ${
                            formData.nguyenVong.thuNghi.includes(thu)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={formData.nguyenVong.thuNghi.includes(thu)}
                            onChange={() => toggleThuNghi(thu)}
                          />
                          Thứ {thu}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Tick các thứ giáo viên không muốn dạy (hệ thống sẽ ưu tiên tránh).
                    </p>
                  </div>
                </div>

                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Lớp theo chuyên môn
                    </label>
                    {!formData.phanHieu && (
                      <p className="text-xs text-gray-500 italic mb-2">
                        💡 GV chưa có phân hiệu → hiển thị tất cả lớp có môn phù hợp.
                      </p>
                    )}

                    {/* Lớp phân hiệu chính */}
                    {lopChinh.length > 0 && (
                      <div className="mb-2">
                        <div className="text-xs font-semibold text-green-700 uppercase mb-1">
                          Phân hiệu chính ({formData.phanHieu || 'chưa rõ'}):
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {lopChinh.map(lop => (
                            <label key={lop._id} className="inline-flex items-center gap-2 px-2 py-1 border border-green-300 rounded-lg text-sm bg-green-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(formData.phanCong.lopDieuChuyen || []).some(id => String(id) === String(lop._id))}
                                onChange={() => toggleLopDieuChuyen(lop._id)}
                              />
                              {lop.tenLop} <span className="text-xs text-green-700">(chính)</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lớp phân hiệu khác (điều chuyển) */}
                    {lopDieuChuyen.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-orange-700 uppercase mb-1">
                          Phân hiệu khác (điều chuyển):
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {lopDieuChuyen.map(lop => (
                            <label key={lop._id} className="inline-flex items-center gap-2 px-2 py-1 border border-orange-300 rounded-lg text-sm bg-orange-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(formData.phanCong.lopDieuChuyen || []).some(id => String(id) === String(lop._id))}
                                onChange={() => toggleLopDieuChuyen(lop._id)}
                              />
                              {lop.tenLop} ({lop.phanHieu || 'N/A'}) <span className="text-xs text-orange-700">(điều chuyển)</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {lopChinh.length === 0 && lopDieuChuyen.length === 0 && (
                      <p className="text-sm text-gray-500 italic">
                        Chưa có lớp có môn đã phân công phù hợp.
                      </p>
                    )}
                  </div>
              </div>
              
              <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingGV ? 'Cập Nhật' : 'Thêm Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default GiaoVienPage;
