import { useState, useEffect } from 'react';
import { giaoVienAPI } from '../services/api';

const CHUYEN_MON_LIST = [
  'Toán', 'Tiếng Việt', 'Tiếng Anh', 'Khoa học', 
  'Lịch sử và Địa lý', 'Đạo đức', 'Thể dục', 'Giáo dục thể chất',
  'Âm nhạc', 'Mỹ thuật', 'Tự nhiên và Xã hội',
  'Tin học', 'Công nghệ'
];

function GiaoVienPage() {
  const [giaoViens, setGiaoViens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingGV, setEditingGV] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    hoTen: '',
    email: '',
    soDienThoai: '',
    chuyenMon: [],
    trangThai: 'active',
    nguyenVong: {
      soBuoiToiDa: null,
      buoiUuTien: 'ca_hai',
      thuNghi: []
    }
  });

  useEffect(() => {
    fetchGiaoViens();
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingGV) {
        await giaoVienAPI.update(editingGV._id, formData);
      } else {
        await giaoVienAPI.create(formData);
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

  const handleEdit = (gv) => {
    setEditingGV(gv);
    setFormData({
      hoTen: gv.hoTen,
      email: gv.email || '',
      soDienThoai: gv.soDienThoai || '',
      chuyenMon: gv.chuyenMon || [],
      trangThai: gv.trangThai || 'active',
      nguyenVong: gv.nguyenVong
        ? {
            soBuoiToiDa: gv.nguyenVong.soBuoiToiDa ?? null,
            buoiUuTien: gv.nguyenVong.buoiUuTien || 'ca_hai',
            thuNghi: gv.nguyenVong.thuNghi || []
          }
        : emptyNguyenVong()
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
      email: '',
      soDienThoai: '',
      chuyenMon: [],
      trangThai: 'active',
      nguyenVong: emptyNguyenVong()
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingGV(null);
  };

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

  const toggleThuNghi = (thu) => {
    const current = formData.nguyenVong.thuNghi || [];
    const next = current.includes(thu)
      ? current.filter(t => t !== thu)
      : [...current, thu].sort((a, b) => a - b);
    updateNguyenVong('thuNghi', next);
  };

  const filteredGVs = giaoViens.filter(gv =>
    gv.hoTen.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredGVs.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-500">
              Chưa có giáo viên nào.
            </div>
          ) : (
            filteredGVs.map((gv) => (
              <div key={gv._id} className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg text-gray-800">{gv.hoTen}</h3>
                    <p className="text-sm text-gray-500">{gv.email || 'Chưa có email'}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    gv.trangThai === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {gv.trangThai === 'active' ? 'Hoạt động' : 'Không hoạt động'}
                  </span>
                </div>
                
                <div className="mb-3">
                  <p className="text-sm text-gray-600 mb-2">Chuyên môn:</p>
                  <div className="flex flex-wrap gap-2">
                    {gv.chuyenMon.map((cm, idx) => (
                      <span key={idx} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">
                        {cm.tenChuyenMon} ({cm.soTietTuan} tiết)
                      </span>
                    ))}
                  </div>
                </div>

                {gv.nguyenVong && (
                  (gv.nguyenVong.soBuoiToiDa || (gv.nguyenVong.buoiUuTien && gv.nguyenVong.buoiUuTien !== 'ca_hai') || (gv.nguyenVong.thuNghi && gv.nguyenVong.thuNghi.length > 0))
                ) && (
                  <div className="mb-3 pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-600 mb-2">Nguyện vọng:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {gv.nguyenVong.soBuoiToiDa && (
                        <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">
                          Tối đa {gv.nguyenVong.soBuoiToiDa} buổi/tuần
                        </span>
                      )}
                      {gv.nguyenVong.buoiUuTien && gv.nguyenVong.buoiUuTien !== 'ca_hai' && (
                        <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs">
                          Ưu tiên: {gv.nguyenVong.buoiUuTien === 'sang' ? 'Sáng' : 'Chiều'}
                        </span>
                      )}
                      {gv.nguyenVong.thuNghi && gv.nguyenVong.thuNghi.length > 0 && (
                        <span className="bg-pink-100 text-pink-700 px-2 py-0.5 rounded text-xs">
                          Nghỉ: {gv.nguyenVong.thuNghi.map(t => `T${t}`).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                  <button
                    onClick={() => handleEdit(gv)}
                    className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                  >
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(gv._id)}
                    className="text-red-600 hover:text-red-900 text-sm font-medium"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))
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
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@example.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Số Điện Thoại
                  </label>
                  <input
                    type="text"
                    value={formData.soDienThoai}
                    onChange={(e) => setFormData({ ...formData, soDienThoai: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0xxx xxx xxx"
                  />
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
