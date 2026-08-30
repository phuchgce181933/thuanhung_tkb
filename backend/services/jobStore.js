'use strict';

/**
 * Job store - lưu progress của các job chạy background.
 * Đơn giản: in-memory Map. Production nên dùng Redis.
 */

const jobs = new Map();

function createJob() {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  jobs.set(jobId, {
    jobId,
    status: 'running',     // 'running' | 'done' | 'error'
    percent: 0,            // 1-100
    stage: 'init',         // mô tả stage hiện tại
    message: '',
    result: null,          // kết quả khi status='done'
    error: null,           // error khi status='error'
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
  return jobs.get(jobId);
}

function updateJob(jobId, update) {
  const job = jobs.get(jobId);
  if (!job) return null;
  Object.assign(job, update, { updatedAt: Date.now() });
  return job;
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function deleteJob(jobId) {
  return jobs.delete(jobId);
}

// Auto-cleanup: xóa job done/error sau 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if ((job.status === 'done' || job.status === 'error') && now - job.updatedAt > 5 * 60 * 1000) {
      jobs.delete(jobId);
    }
  }
}, 60 * 1000);

module.exports = { createJob, updateJob, getJob, deleteJob };