import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import KhoiPage from './pages/KhoiPage';
import LopPage from './pages/LopPage';
import LopChuyenMonPage from './pages/LopChuyenMonPage';
import GiaoVienPage from './pages/GiaoVienPage';
import ThoiKhoaBieuPage from './pages/ThoiKhoaBieuPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-blue-600 text-white shadow-lg">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold">Quản Lý Trường Học</h1>
          </div>
        </header>

        {/* Navigation */}
        <nav className="bg-blue-500 shadow-sm">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap space-x-6">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `px-4 py-3 font-medium transition-colors ${
                    isActive
                      ? 'text-white border-b-2 border-white'
                      : 'text-blue-100 hover:text-white'
                  }`
                }
              >
                Khối
              </NavLink>
              <NavLink
                to="/lop"
                className={({ isActive }) =>
                  `px-4 py-3 font-medium transition-colors ${
                    isActive
                      ? 'text-white border-b-2 border-white'
                      : 'text-blue-100 hover:text-white'
                  }`
                }
              >
                Lớp
              </NavLink>
              <NavLink
                to="/lop-chuyen-mon"
                className={({ isActive }) =>
                  `px-4 py-3 font-medium transition-colors ${
                    isActive
                      ? 'text-white border-b-2 border-white'
                      : 'text-blue-100 hover:text-white'
                  }`
                }
              >
                Phân công Môn học
              </NavLink>
              <NavLink
                to="/giao-vien"
                className={({ isActive }) =>
                  `px-4 py-3 font-medium transition-colors ${
                    isActive
                      ? 'text-white border-b-2 border-white'
                      : 'text-blue-100 hover:text-white'
                  }`
                }
              >
                Giáo Viên
              </NavLink>
              <NavLink
                to="/thoi-khoa-bieu"
                className={({ isActive }) =>
                  `px-4 py-3 font-medium transition-colors ${
                    isActive
                      ? 'text-white border-b-2 border-white'
                      : 'text-blue-100 hover:text-white'
                  }`
                }
              >
                Thời Khóa Biểu
              </NavLink>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<KhoiPage />} />
            <Route path="/lop" element={<LopPage />} />
            <Route path="/lop-chuyen-mon" element={<LopChuyenMonPage />} />
            <Route path="/giao-vien" element={<GiaoVienPage />} />
            <Route path="/thoi-khoa-bieu" element={<ThoiKhoaBieuPage />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-gray-800 text-white py-4 mt-8">
          <div className="container mx-auto px-4 text-center">
            <p className="text-gray-400">© 2024 Quản Lý Trường Học</p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
