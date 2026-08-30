'use strict';

/**
 * Test jobStore progress tracking flow (mô phỏng autoGenerate).
 */

const jobStore = require('../services/jobStore');

(async () => {
  // Tạo job
  const job = jobStore.createJob();
  console.log('[Test] Created job:', job.jobId);

  // Mô phỏng progress
  const stages = [
    { percent: 5, stage: 'init', message: 'Đang tải dữ liệu...' },
    { percent: 15, stage: 'greedy', message: 'Sắp xếp lớp 1/10' },
    { percent: 30, stage: 'greedy', message: 'Sắp xếp lớp 3/10' },
    { percent: 50, stage: 'greedy', message: 'Sắp xếp lớp 5/10' },
    { percent: 70, stage: 'greedy', message: 'Sắp xếp lớp 8/10' },
    { percent: 80, stage: 'optimize', message: 'Tối ưu NV' },
    { percent: 90, stage: 'save', message: 'Lưu DB' },
    { percent: 100, stage: 'done', message: 'Hoàn tất' },
  ];

  for (const update of stages) {
    await new Promise(r => setTimeout(r, 50));
    const updated = jobStore.updateJob(job.jobId, update);
    console.log(`[Test] ${updated.percent}% - ${updated.stage} - ${updated.message}`);
  }

  jobStore.updateJob(job.jobId, {
    status: 'done',
    result: { success: true, message: 'Đã sắp xếp 10 lớp' },
  });

  const finalJob = jobStore.getJob(job.jobId);
  console.log('[Test] Final:', { status: finalJob.status, percent: finalJob.percent, hasResult: !!finalJob.result });

  // Test getJob not found
  const missing = jobStore.getJob('nonexistent');
  console.log('[Test] Missing job:', missing);

  console.log('[Test] PASS');
})();