require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Import routes
const khoiRoutes = require('./routes/khoiRoutes');
const lopRoutes = require('./routes/lopRoutes');
const giaoVienRoutes = require('./routes/giaoVienRoutes');
const thoiKhoaBieuRoutes = require('./routes/thoiKhoaBieuRoutes');

const app = express();

// Connect Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/khoi', khoiRoutes);
app.use('/api/lop', lopRoutes);
app.use('/api/giao-vien', giaoVienRoutes);
app.use('/api/thoi-khoa-bieu', thoiKhoaBieuRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
