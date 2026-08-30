const { spawn } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, '..');

const env = {
  ...process.env,
  NODE_ENV: 'development',
  MONGO_URI: process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb+srv://phuchgce181933_db_user:rzXiuGvPnrJCJgLU@cluster0.rcyfijm.mongodb.net/saplich?retryWrites=true&w=majority',
  MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb+srv://phuchgce181933_db_user:rzXiuGvPnrJCJgLU@cluster0.rcyfijm.mongodb.net/saplich?retryWrites=true&w=majority'
};

const child = spawn(process.execPath, ['server.js'], {
  cwd: backendDir,
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to start backend in local mode:', error);
  process.exit(1);
});
