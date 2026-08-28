// Test HTTP API trực tiếp
const http = require('http');

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  try {
    // Lấy GV Kim ID trước (hardcode từ debug trước)
    const kimId = '6a90537e55de4a03531f07fd';
    const url = `http://localhost:5000/api/thoi-khoa-bieu/giao-vien?giaoVienId=${kimId}&namHoc=2024-2025`;
    console.log(`Fetching: ${url}`);
    const data = await fetch(url);
    const json = JSON.parse(data);
    console.log(`\nsuccess: ${json.success}`);
    console.log(`Total items: ${json.data?.length}`);
    if (json.data && json.data.length > 0) {
      // Đếm theo buổi
      const sang = json.data.filter(s => s.buoi === 'sang');
      const chieu = json.data.filter(s => s.buoi === 'chieu');
      console.log(`Sáng: ${sang.length}, Chiều: ${chieu.length}`);
      console.log('\nDanh sách:');
      for (const s of json.data) {
        console.log(`  T${s.thu} ${s.buoi} tiết ${s.tiet} | ${s.lop?.tenLop} | ${s.chuyenMon}`);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
