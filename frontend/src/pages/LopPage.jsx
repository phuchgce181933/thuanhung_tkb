import { useState, useEffect } from 'react';
import { lopAPI, khoiAPI } from '../services/api';

const getPhanHieuOrder = (phanHieu) => {
  const value = (phanHieu || 'Chính').trim().toLowerCase();
  if (value === 'chính' || value === 'chinh') return 0;
  const number = Number(value.replace(/[^0-9]/g, ''));
  return Number.isNaN(number) ? 999 : number;
};

function LopPage() {
  const [lops, setLops] = useState([]);
  const [khois, setKhois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingLop, setEditingLop] = useState(null);
  const [filterKhoi, setFilterKhoi] = useState('');
  const [filterPhanHieu, setFilterPhanHieu] = useState('');
  const [formData, setFormData] = useState({
    tenLop: '',
    khoi: '',
    phanHieu: 'A',
    giaoVienChuNhiem: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchLops();
  }, [filterKhoi]);

  const fetchData = async () => {
    try {
      const [khoisRes, lopsRes] = await Promise.all([
        khoiAPI.getAll(),
        lopAPI.getAll()
      ]);
      setKhois(khoisRes.data.data);
      setLops(lopsRes.data.data);
      setError('');
    } catch (err) {
      setError('Không thể tải dữ liệu');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLops = async () => {
    try {
      setLoading(true);
      const response = await lopAPI.getAll(filterKhoi || null);
      setLops(response.data.data);
      setError('');
    } catch (err) {
      setError('Không thể tải danh sách lớp');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingLop) {
        await lopAPI.update(editingLop._id, formData);
      } else {
        await lopAPI.create(formData);
      }
      fetchLops();
      closeModal();
    } catch (err) {
      alert(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleEdit = (lop) => {
    setEditingLop(lop);
    setFormData({
      tenLop: lop.tenLop,
      khoi: typeof lop.khoi === 'object' ? lop.khoi._id : lop.khoi,
      phanHieu: lop.phanHieu || 'A',
      giaoVienChuNhiem: lop.giaoVienChuNhiem || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Bạn có chắc muốn xóa lớp này?')) {
      try {
        await lopAPI.delete(id);
        fetchLops();
      } catch (err) {
        alert(err.response?.data?.message || 'Không thể xóa lớp');
      }
    }
  };

  const openModal = () => {
    setEditingLop(null);
    setFormData({
      tenLop: '',
      khoi: khois.length > 0 ? khois[0]._id : '',
      phanHieu: 'A',
      giaoVienChuNhiem: ''
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingLop(null);
  };

  const sortedLops = [...lops].sort((first, second) => {
    const branchOrder = getPhanHieuOrder(first.phanHieu) - getPhanHieuOrder(second.phanHieu);
    if (branchOrder !== 0) return branchOrder;
    return first.tenLop.localeCompare(second.tenLop, 'vi', { numeric: true });
  });
  const phanHieuOptions = [...new Set(lops.map(lop => lop.phanHieu).filter(Boolean))]
    .sort((first, second) => getPhanHieuOrder(first) - getPhanHieuOrder(second));
  const visibleLops = sortedLops.filter(lop => !filterPhanHieu || lop.phanHieu === filterPhanHieu);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Quản Lý Lớp</h2>
        <div className="flex gap-4 items-center">
          <select
            value={filterKhoi}
            onChange={(e) => setFilterKhoi(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả các khối</option>
            {khois.map((khoi) => (
              <option key={khoi._id} value={khoi._id}>
                {khoi.tenKhoi}
              </option>
            ))}
          </select>
          <select
            value={filterPhanHieu}
            onChange={(e) => setFilterPhanHieu(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả phân hiệu</option>
            {phanHieuOptions.map(phanHieu => (
              <option key={phanHieu} value={phanHieu}>{phanHieu}</option>
            ))}
          </select>
          <button
            onClick={openModal}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <span>+ Thêm Lớp</span>
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
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  STT
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tên Lớp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Khối
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phân hiệu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  GV Chủ Nhiệm
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hành Động
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {lops.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    Chưa có lớp nào. Hãy thêm lớp mới!
                  </td>
                </tr>
              ) : (
                visibleLops.map((lop, index) => (
                  <tr key={lop._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {lop.tenLop}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {typeof lop.khoi === 'object' ? lop.khoi.tenKhoi : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {lop.phanHieu || 'A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {lop.giaoVienChuNhiem || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(lop)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDelete(lop._id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-800">
                {editingLop ? 'Sửa Lớp' : 'Thêm Lớp Mới'}
              </h3>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên Lớp *
                  </label>
                  <input
                    type="text"
                    value={formData.tenLop}
                    onChange={(e) => setFormData({ ...formData, tenLop: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="VD: 1A1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Khối *
                  </label>
                  <select
                    value={formData.khoi}
                    onChange={(e) => setFormData({ ...formData, khoi: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Chọn khối</option>
                    {khois.map((khoi) => (
                      <option key={khoi._id} value={khoi._id}>
                        {khoi.tenKhoi}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phân hiệu
                  </label>
                  <input
                    type="text"
                    value={formData.phanHieu}
                    onChange={(e) => setFormData({ ...formData, phanHieu: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="VD: A, B, C, H..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Giáo Viên Chủ Nhiệm
                  </label>
                  <input
                    type="text"
                    value={formData.giaoVienChuNhiem}
                    onChange={(e) => setFormData({ ...formData, giaoVienChuNhiem: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Tên giáo viên..."
                  />
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
                  {editingLop ? 'Cập Nhật' : 'Thêm Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default LopPage;
