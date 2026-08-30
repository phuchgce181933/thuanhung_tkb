// Đọc file Excel GV bộ môn
const XLSX = require('xlsx');
const path = 'C:\\Users\\ADMIN\\Downloads\\Lần 2-Tổng hợp-TKB GV bộ môn năm 26-27  .xlsx';

try {
  const wb = XLSX.readFile(path);
  console.log('Sheets:', wb.SheetNames);

  for (const sheetName of wb.SheetNames) {
    console.log('\n=== Sheet:', sheetName, '===');
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
    console.log('Rows:', data.length);
    if (data.length > 0) {
      console.log('Header (first row):', JSON.stringify(data[0]));
      console.log('---');
      // In 10 dòng đầu
      for (let i = 0; i < Math.min(15, data.length); i++) {
        console.log(`Row ${i}:`, JSON.stringify(data[i]));
      }
    }
  }
} catch (e) {
  console.error('Lỗi:', e.message);
}
