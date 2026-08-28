import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Khoi API
export const khoiAPI = {
  getAll: () => api.get('/khoi'),
  getById: (id) => api.get(`/khoi/${id}`),
  create: (data) => api.post('/khoi', data),
  update: (id, data) => api.put(`/khoi/${id}`, data),
  delete: (id) => api.delete(`/khoi/${id}`),
};

// Lop API
export const lopAPI = {
  getAll: (khoiId) => api.get('/lop', { params: khoiId ? { khoiId } : {} }),
  getById: (id) => api.get(`/lop/${id}`),
  getByKhoi: (khoiId) => api.get(`/lop/khoi/${khoiId}`),
  create: (data) => api.post('/lop', data),
  update: (id, data) => api.put(`/lop/${id}`, data),
  updateChuyenMons: (id, chuyenMons) => api.put(`/lop/${id}/chuyenmons`, { chuyenMons }),
  setChuyenMonsByKhoi: (khoiId, chuyenMons) => api.post('/lop/chuyenmons/by-khoi', { khoiId, chuyenMons }),
  delete: (id) => api.delete(`/lop/${id}`),
};

// GiaoVien API
export const giaoVienAPI = {
  getAll: (params) => api.get('/giao-vien', { params }),
  getById: (id) => api.get(`/giao-vien/${id}`),
  create: (data) => api.post('/giao-vien', data),
  update: (id, data) => api.put(`/giao-vien/${id}`, data),
  delete: (id) => api.delete(`/giao-vien/${id}`),
};

// ThoiKhoaBieu API
export const tkbAPI = {
  getAll: (params) => api.get('/thoi-khoa-bieu', { params }),
  getByLop: (lopId, namHoc) => api.get('/thoi-khoa-bieu/lop', { params: { lopId, namHoc } }),
  getByGiaoVien: (giaoVienId, namHoc) => api.get('/thoi-khoa-bieu/giao-vien', { params: { giaoVienId, namHoc } }),
  getStats: (namHoc) => api.get('/thoi-khoa-bieu/stats', { params: { namHoc } }),
  autoGenerate: (namHoc) => api.post('/thoi-khoa-bieu/auto-generate', { namHoc }),
  updateTiet: (data) => api.put('/thoi-khoa-bieu/tiet', data),
  moveTiet: (data) => api.post('/thoi-khoa-bieu/move-tiet', data),
  swapTiet: (data) => api.post('/thoi-khoa-bieu/swap-tiet', data),
  rearrangeAfterLock: (data) => api.post('/thoi-khoa-bieu/rearrange-after-lock', data),
  applyBatch: (data) => api.post('/thoi-khoa-bieu/apply-batch', data),
  exportExcel: async (namHoc) => {
    const response = await api.get('/thoi-khoa-bieu/export-excel', {
      params: { namHoc },
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `TKB_${namHoc.replace('/', '-')}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default api;
