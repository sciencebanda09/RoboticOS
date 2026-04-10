/**
 * RoboticOS — Main Process (Electron Entry Point)
 * Runs as a normal Windows user process. No admin/root required.
 * Provides kernel-level IPC for robotics subsystems.
 */

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { EventEmitter } = require('events');

const isDev = process.argv.includes('--dev');

// ── Global state ─────────────────────────────────────────────────────────────
let mainWindow = null;

// Simulated sensor data streams (real hardware would use serialport/WebSocket)
const sensorBus = new EventEmitter();
let sensorIntervals = {};
let busMessages = [];

// ── Desktop window ────────────────────────────────────────────────────────────
function createDesktop() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#050810',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('closed', () => {
    // Stop all sensor simulations
    Object.values(sensorIntervals).forEach(clearInterval);
    mainWindow = null;
  });
}

// ── File System IPC ───────────────────────────────────────────────────────────
ipcMain.handle('fs:readdir', async (_, dirPath) => {
  try {
    const resolved = resolvePath(dirPath);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
      path: path.join(resolved, e.name),
    }));
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:readfile', async (_, filePath) => {
  try { return fs.readFileSync(resolvePath(filePath), 'utf8'); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:writefile', async (_, filePath, content) => {
  try { fs.writeFileSync(resolvePath(filePath), content, 'utf8'); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:mkdir', async (_, dirPath) => {
  try { fs.mkdirSync(resolvePath(dirPath), { recursive: true }); return { ok: true }; }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:delete', async (_, filePath) => {
  try {
    const r = resolvePath(filePath);
    if (fs.statSync(r).isDirectory()) fs.rmdirSync(r, { recursive: true });
    else fs.unlinkSync(r);
    return { ok: true };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:stat', async (_, filePath) => {
  try {
    const s = fs.statSync(resolvePath(filePath));
    return { size: s.size, mtime: s.mtimeMs, isDir: s.isDirectory() };
  } catch (err) { return { error: err.message }; }
});

// ── System Info IPC ───────────────────────────────────────────────────────────
ipcMain.handle('sys:info', async () => ({
  platform: process.platform,
  hostname: os.hostname(),
  username: os.userInfo().username,
  homedir: os.homedir(),
  cpus: os.cpus().length,
  cpuModel: os.cpus()[0]?.model || 'Unknown',
  totalMem: os.totalmem(),
  freeMem: os.freemem(),
  uptime: os.uptime(),
  arch: os.arch(),
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
}));

ipcMain.handle('sys:meminfo', async () => ({
  total: os.totalmem(),
  free: os.freemem(),
  used: os.totalmem() - os.freemem(),
}));

// ── Robotics Sensor Bus IPC ───────────────────────────────────────────────────
// Simulated real-time sensor data. In production, replace with serialport/WebSocket reads.

ipcMain.handle('robot:getSensorData', async () => {
  return generateSensorSnapshot();
});

ipcMain.handle('robot:getActuatorStatus', async () => {
  return generateActuatorStatus();
});

ipcMain.handle('robot:sendCommand', async (_, cmd) => {
  // Log command to mission log
  const logPath = path.join(os.homedir(), 'RoboticOS', 'logs', 'commands.log');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] CMD: ${JSON.stringify(cmd)}\n`);
  } catch(e) {}
  return { ok: true, timestamp: Date.now(), echo: cmd };
});

ipcMain.handle('robot:getTaskQueue', async () => {
  return {
    tasks: [
      { id: 't1', name: 'Patrol Route A', priority: 1, status: 'running', progress: 67, eta: 23 },
      { id: 't2', name: 'Obstacle Mapping', priority: 2, status: 'queued', progress: 0, eta: 45 },
      { id: 't3', name: 'Battery Check', priority: 0, status: 'scheduled', progress: 0, eta: 120 },
      { id: 't4', name: 'Data Sync', priority: 3, status: 'queued', progress: 0, eta: 200 },
    ]
  };
});

ipcMain.handle('robot:getMissionLog', async () => {
  const logPath = path.join(os.homedir(), 'RoboticOS', 'logs', 'mission.log');
  try {
    if (!fs.existsSync(logPath)) return { lines: [] };
    const content = fs.readFileSync(logPath, 'utf8');
    return { lines: content.split('\n').filter(Boolean).slice(-200) };
  } catch(e) { return { lines: [] }; }
});

ipcMain.handle('robot:writeMissionLog', async (_, line) => {
  const logPath = path.join(os.homedir(), 'RoboticOS', 'logs', 'mission.log');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`);
    return { ok: true };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('robot:getSafetyStatus', async () => {
  return {
    eStop: false,
    watchdog: true,
    collisionGuard: true,
    powerOk: true,
    tempOk: true,
    overrides: [],
    faultLog: [],
  };
});

ipcMain.handle('robot:triggerEStop', async (_, reason) => {
  const logPath = path.join(os.homedir(), 'RoboticOS', 'logs', 'safety.log');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] E-STOP TRIGGERED: ${reason}\n`);
  } catch(e) {}
  return { ok: true, timestamp: Date.now(), reason };
});

ipcMain.handle('robot:getNetworkBus', async () => {
  return {
    nodes: [
      { id: 'master', type: 'controller', ip: '192.168.1.1', latency: 0, status: 'online' },
      { id: 'arm-ctrl', type: 'actuator', ip: '192.168.1.11', latency: 2, status: 'online' },
      { id: 'lidar-1', type: 'sensor', ip: '192.168.1.21', latency: 1, status: 'online' },
      { id: 'cam-stereo', type: 'sensor', ip: '192.168.1.22', latency: 3, status: 'online' },
      { id: 'imu-1', type: 'sensor', ip: '192.168.1.23', latency: 1, status: 'online' },
      { id: 'base-drive', type: 'actuator', ip: '192.168.1.12', latency: 2, status: 'warning' },
      { id: 'power-mgr', type: 'system', ip: '192.168.1.5', latency: 4, status: 'online' },
      { id: 'ai-coprocessor', type: 'compute', ip: '192.168.1.100', latency: 8, status: 'online' },
    ],
    bandwidth: { rx: 2.4, tx: 0.8 },
    protocol: 'ROS2/DDS',
  };
});

// ── Window Controls ───────────────────────────────────────────────────────────
ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('win:close', () => mainWindow?.close());

ipcMain.handle('shell:openExternal', async (_, url) => { await shell.openExternal(url); });
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] });
  return result.filePaths;
});

// ── Sensor Simulation Helpers ─────────────────────────────────────────────────
let _simTime = 0;

function generateSensorSnapshot() {
  _simTime += 0.05;
  const t = _simTime;
  return {
    timestamp: Date.now(),
    imu: {
      roll:  (Math.sin(t * 0.7) * 8 + Math.random() * 0.5).toFixed(2),
      pitch: (Math.cos(t * 0.5) * 5 + Math.random() * 0.5).toFixed(2),
      yaw:   ((t * 12) % 360).toFixed(1),
      ax: (Math.sin(t) * 0.3 + Math.random() * 0.1 - 0.05).toFixed(3),
      ay: (Math.cos(t * 1.3) * 0.2 + Math.random() * 0.1 - 0.05).toFixed(3),
      az: (9.81 + Math.sin(t * 0.2) * 0.1).toFixed(3),
      gx: (Math.sin(t * 2) * 5 + Math.random() * 0.5).toFixed(2),
      gy: (Math.cos(t * 1.7) * 3 + Math.random() * 0.5).toFixed(2),
      gz: (Math.sin(t * 0.9) * 2 + Math.random() * 0.3).toFixed(2),
    },
    lidar: {
      points: 96000 + Math.floor(Math.random() * 4000),
      range: (3.2 + Math.sin(t * 0.3) * 0.8 + Math.random() * 0.2).toFixed(2),
      hz: 20,
      obstacleCount: Math.floor(2 + Math.abs(Math.sin(t * 0.4)) * 4),
    },
    camera: {
      fps: 30,
      resolution: '1920x1080',
      objectsDetected: Math.floor(1 + Math.abs(Math.sin(t * 0.3)) * 5),
      confidence: (0.82 + Math.sin(t * 0.2) * 0.1).toFixed(2),
    },
    gps: {
      lat: (28.6139 + Math.sin(t * 0.01) * 0.001).toFixed(6),
      lon: (77.2090 + Math.cos(t * 0.008) * 0.001).toFixed(6),
      alt: (220 + Math.sin(t * 0.05) * 2).toFixed(1),
      fix: 'RTK',
      satellites: 14,
    },
    battery: {
      voltage: (24.1 - t * 0.001 + Math.sin(t * 0.3) * 0.05).toFixed(2),
      current: (8.4 + Math.sin(t) * 1.2 + Math.random() * 0.3).toFixed(2),
      soc: Math.max(10, 87 - t * 0.05).toFixed(1),
      temp: (38.5 + Math.sin(t * 0.2) * 2).toFixed(1),
      health: 'GOOD',
    },
    temperature: {
      cpu: (62 + Math.sin(t * 0.3) * 5 + Math.random()).toFixed(1),
      motor1: (45 + Math.sin(t * 0.5) * 8).toFixed(1),
      motor2: (47 + Math.cos(t * 0.4) * 7).toFixed(1),
      ambient: (28 + Math.sin(t * 0.1) * 2).toFixed(1),
    },
    ultrasonic: {
      front: (0.45 + Math.abs(Math.sin(t * 0.8)) * 0.9 + Math.random() * 0.05).toFixed(3),
      rear:  (1.2 + Math.abs(Math.cos(t * 0.6)) * 0.5 + Math.random() * 0.05).toFixed(3),
      left:  (0.8 + Math.abs(Math.sin(t * 1.1)) * 0.4 + Math.random() * 0.05).toFixed(3),
      right: (0.6 + Math.abs(Math.cos(t * 0.9)) * 0.6 + Math.random() * 0.05).toFixed(3),
    },
  };
}

function generateActuatorStatus() {
  const t = _simTime;
  return {
    timestamp: Date.now(),
    motors: [
      { id: 'FL', name: 'Front-Left Drive', rpm: Math.floor(800 + Math.sin(t) * 200), torque: (2.1 + Math.sin(t * 0.7) * 0.3).toFixed(2), temp: (44 + Math.sin(t * 0.4) * 5).toFixed(1), current: (3.2 + Math.sin(t) * 0.5).toFixed(2), status: 'running' },
      { id: 'FR', name: 'Front-Right Drive', rpm: Math.floor(820 + Math.cos(t) * 190), torque: (2.0 + Math.cos(t * 0.6) * 0.3).toFixed(2), temp: (43 + Math.cos(t * 0.5) * 4).toFixed(1), current: (3.1 + Math.cos(t) * 0.4).toFixed(2), status: 'running' },
      { id: 'RL', name: 'Rear-Left Drive', rpm: Math.floor(780 + Math.sin(t * 1.1) * 210), torque: (2.2 + Math.sin(t * 0.8) * 0.25).toFixed(2), temp: (46 + Math.sin(t * 0.3) * 6).toFixed(1), current: (3.3 + Math.sin(t * 1.1) * 0.5).toFixed(2), status: 'running' },
      { id: 'RR', name: 'Rear-Right Drive', rpm: Math.floor(790 + Math.cos(t * 1.2) * 200), torque: (2.1 + Math.cos(t * 0.9) * 0.28).toFixed(2), temp: (45 + Math.cos(t * 0.4) * 5).toFixed(1), current: (3.2 + Math.cos(t * 1.2) * 0.45).toFixed(2), status: 'running' },
    ],
    servos: [
      { id: 'ARM_BASE', name: 'Arm Base', angle: (90 + Math.sin(t * 0.4) * 45).toFixed(1), load: (35 + Math.sin(t * 0.4) * 20).toFixed(0), status: 'active' },
      { id: 'ARM_ELBOW', name: 'Arm Elbow', angle: (60 + Math.cos(t * 0.5) * 30).toFixed(1), load: (28 + Math.cos(t * 0.5) * 15).toFixed(0), status: 'active' },
      { id: 'ARM_WRIST', name: 'Arm Wrist', angle: (0 + Math.sin(t * 1.2) * 90).toFixed(1), load: (12 + Math.sin(t * 1.2) * 8).toFixed(0), status: 'active' },
      { id: 'GRIPPER', name: 'Gripper', angle: (Math.abs(Math.sin(t * 0.2)) * 45).toFixed(1), load: (5 + Math.abs(Math.sin(t * 0.2)) * 40).toFixed(0), status: 'active' },
    ],
    pneumatics: [
      { id: 'P1', name: 'Brake Cylinder', pressure: (4.5 + Math.sin(t * 0.3) * 0.5).toFixed(2), status: 'pressurized' },
      { id: 'P2', name: 'Lift Cylinder', pressure: (6.2 + Math.cos(t * 0.4) * 0.8).toFixed(2), status: 'active' },
    ],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolvePath(p) {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  if (!path.isAbsolute(p)) return path.join(os.homedir(), 'RoboticOS', p);
  return p;
}

function ensureRoboticOSHome() {
  const base = path.join(os.homedir(), 'RoboticOS');
  ['missions', 'maps', 'logs', 'models', 'configs', 'scripts', 'data'].forEach(d => {
    fs.mkdirSync(path.join(base, d), { recursive: true });
  });
  // Write default robot config
  const cfgPath = path.join(base, 'configs', 'robot.json');
  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(cfgPath, JSON.stringify({
      name: 'AROS-1',
      type: 'Differential Drive + Arm',
      dof: 6,
      sensors: ['IMU', 'LiDAR', 'Stereo Camera', 'GPS', 'Ultrasonic x4'],
      actuators: ['4x DC Motor', '4x Servo', '2x Pneumatic'],
      safetyLevel: 'SIL-2',
      maxSpeed: 1.2,
      maxPayload: 5.0,
    }, null, 2));
  }
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ensureRoboticOSHome();
  createDesktop();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createDesktop();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
