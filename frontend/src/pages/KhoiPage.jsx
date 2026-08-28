import { useState, useEffect } from 'react';
import { khoiAPI } from '../services/api';

function KhoiPage() {
  const [khois, setKhois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingKhoi, setEditingKhoi] = useState(null);
  const [formData, setFormData] = useState({
    tenKhoi: ''
  });

  useEffect(() => {
    fetchKhois();
  }, []);

  const fetchKhois = async () => {
    try {
      setLoading(true);
      const response = await khoiAPI.getAll();
      setKhois(response.data.data);
      setError('');
    } catch (err) {
      setError('Không thể tải danh sách khối');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingKhoi) {
        await khoiAPI.update(editingKhoi._id, formData);
      } else {
        await khoiAPI.create(formData);
      }
      fetchKhois();
      closeModal();
    } catch (err) {
      alert(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleEdit = (khoi) => {
    setEditingKhoi(khoi);
    setFormData({
      tenKhoi: khoi.tenKhoi
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Bạn có chắc muốn xóa khối này?')) {
      try {
        await khoiAPI.delete(id);
        fetchKhois();
      } catch (err) {
        alert(err.response?.data?.message || 'Không thể xóa khối');
      }
    }
  };

  const openModal = () => {
    setEditingKhoi(null);
    setFormData({ tenKhoi: '' });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingKhoi(null);
    setFormData({ tenKhoi: '' });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Quản Lý Khối</h2>
        <button
          onClick={openModal}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span>+ Thêm Khối</span>
        </button>
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
                  Tên Khối
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hành Động
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {khois.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-6 py-4 text-center text-gray-500">
                    Chưa có khối nào. Hãy thêm khối mới!
                  </td>
                </tr>
              ) : (
                khois.map((khoi, index) => (
                  <tr key={khoi._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {khoi.tenKhoi}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(khoi)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDelete(khoi._id)}
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
                {editingKhoi ? 'Sửa Khối' : 'Thêm Khối Mới'}
              </h3>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên Khối *
                  </label>
                  <input
                    type="text"
                    value={formData.tenKhoi}
                    onChange={(e) => setFormData({ ...formData, tenKhoi: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="VD: Khối 1"
                    required
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
                  {editingKhoi ? 'Cập Nhật' : 'Thêm Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default KhoiPage;
