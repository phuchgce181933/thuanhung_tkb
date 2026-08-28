const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

let backendProcess;
const backendPort = process.env.PORT || 5000;
let logFile;

function writeLog(message) {
  if (!logFile) return;
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}

function getProjectPath(...parts) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...parts)
    : path.join(__dirname, '..', ...parts);
}

function startBackend() {
  const backendPath = getProjectPath('backend', 'server.js');
  const backendDirectory = path.dirname(backendPath);

  backendProcess = spawn(process.execPath, [backendPath], {
    cwd: backendDirectory,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(backendPort),
      ELECTRON_RUN_AS_NODE: '1'
    }
  });

  backendProcess.stdout?.on('data', (data) => writeLog(`BACKEND: ${data.toString().trim()}`));
  backendProcess.stderr?.on('data', (data) => writeLog(`BACKEND ERROR: ${data.toString().trim()}`));
  backendProcess.on('error', (error) => {
    writeLog(`BACKEND PROCESS ERROR: ${error.stack || error.message}`);
    dialog.showErrorBox('Không thể khởi động máy chủ', error.message);
  });
  backendProcess.on('exit', (code, signal) => writeLog(`BACKEND EXIT: code=${code}, signal=${signal}`));
}

function waitForBackend(attempt = 0) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${backendPort}/api/health`, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', () => {
      if (attempt >= 120) {
        resolve(false);
        return;
      }
      setTimeout(() => resolve(waitForBackend(attempt + 1)), 1000);
    });
    request.setTimeout(500, () => request.destroy());
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeLog(`RENDERER LOAD ERROR: ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeLog(`RENDERER CONSOLE [${level}]: ${message} (${sourceId}:${line})`);
  });

  if (app.isPackaged) {
    const indexPath = getProjectPath('frontend', 'dist', 'index.html');
    writeLog(`LOADING: ${indexPath}`);
    window.loadFile(indexPath).catch((error) => {
      writeLog(`RENDERER LOAD EXCEPTION: ${error.stack || error.message}`);
      dialog.showErrorBox('Không thể tải giao diện', `${error.message}\n\nLog: ${logFile}`);
    });
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    window.loadURL('http://localhost:3000');
  }
}

app.whenReady().then(async () => {
  logFile = path.join(app.getPath('userData'), 'saplich-debug.log');
  writeLog(`APP STARTED, packaged=${app.isPackaged}`);
  startBackend();
  const backendReady = await waitForBackend();
  writeLog(`BACKEND HEALTH CHECK: ${backendReady ? 'OK' : 'FAILED'}`);
  if (!backendReady) {
    dialog.showErrorBox(
      'Backend chưa khởi động',
      `Không thể kết nối tới API tại cổng ${backendPort}.\n\nXem log tại:\n${logFile}`
    );
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
});
