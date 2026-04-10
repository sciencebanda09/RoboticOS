# ⬡ RoboticOS — Personal Robotics OS

<img width="1919" height="1006" alt="RoboticsOs" src="https://github.com/user-attachments/assets/276ff305-2034-4347-864d-29e3f4e657d4" />

A fully personal **Robotics Operating System** that runs as a **regular Windows application**.
No rooting, no admin rights, no kernel modifications required.

Built on Electron + Node.js. Designed for autonomous systems control.

---

## Features

### Core OS Layer
| Component | What it does |
|-----------|-------------|
| **Boot screen** | Animated boot with subsystem health checks |
| **Animated wallpaper** | 3 themes: Circuit Board, Radar Sweep, Neural Net |
| **Window manager** | Drag, resize, minimize, maximize, close |
| **Taskbar** | App buttons, battery SOC tray, bus latency, live clock |
| **App launcher** | Search-enabled start menu |
| **Notifications** | Slide-in toast system with severity levels |

### Robotics Subsystems
| Subsystem | What it does |
|-----------|-------------|
| **Real-Time OS (RTOS)** | Sensor scheduler, task allocator, comm bus, watchdog |
| **Safety Kernel** | SIL-2 watchdog, E-Stop override, 4 built-in safety checks |
| **Sensor Hub** | IMU, LiDAR, GPS, Battery, Temperature, Ultrasonic — live data |
| **Actuator Manager** | 4x DC motors, 4x servos, manual slider control |
| **AI Task Allocator** | Priority queue, task registry, dependency resolution |
| **Communication Bus** | ROS2/DDS-style pub/sub, node graph visualization |
| **Navigation Map** | 2D occupancy grid, path trail, waypoints, LiDAR cone |
| **Mission Logs** | Structured logging with level filters (INFO/WARN/ERROR/OK) |
| **Mission Control** | Full-system dashboard with GPS, motors, tasks, bus stats |
| **Config Editor** | Robot identity, safety limits, sensor rates, AI settings |
| **Terminal** | Robot-aware shell with `sensors`, `actuators`, `estop` commands |

---

##  Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or newer
- Windows 10/11 (runs as a normal `.exe` — **no admin needed**)

### Install & Run

```bash
# 1. Go to the project folder
cd roboticos

# 2. Install dependencies
npm install

# 3. Run RoboticOS
npm start

# OR run in dev mode (with DevTools)
npm run dev
```

---

##  Build Standalone .exe

```bash
npm run build
```

The installer will be in `dist/`. No Node.js needed on target machine.

---

## Project Structure

```
roboticos/
├── src/
│   ├── main.js              ← Electron main process (OS host + IPC handlers)
│   └── preload.js           ← Secure IPC bridge
├── renderer/
│   ├── index.html           ← Desktop shell HTML
│   ├── css/
│   │   └── os.css           ← Full design system
│   └── js/
│       ├── core/
│       │   ├── kernel.js    ← Process table, event bus, VFS
│       │   ├── wm.js        ← Window manager
│       │   ├── wallpaper.js ← Animated wallpaper engine
│       │   ├── rtos.js      ← Real-time OS runtime (THE CORE)
│       │   └── os.js        ← Boot, app registry, launcher
│       └── apps/
│           ├── dashboard.js ← Mission Control dashboard
│           ├── sensors.js   ← Sensor Hub
│           ├── actuators.js ← Actuator Manager
│           ├── tasks.js     ← AI Task Allocator
│           ├── safety.js    ← Safety Kernel UI
│           ├── network.js   ← Comm Bus Monitor
│           ├── terminal.js  ← Robot terminal
│           ├── logs.js      ← Mission Logs
│           ├── map.js       ← Navigation Map
│           └── config.js    ← Config Editor
└── assets/
```

---

## ⬡ RTOS Architecture

The **Real-Time OS Runtime** (`rtos.js`) is the robotics heart of the OS:

### Sensor Scheduler
Polls sensors at configurable rates (IMU @ 50Hz, LiDAR @ 20Hz, GPS @ 1Hz, etc.)
```js
RTOS.onSensor('imu', (data) => { console.log(data.roll, data.pitch, data.yaw); });
```

### Actuator Priority Manager
Commands are queued by priority (SAFETY > EMERGENCY > HIGH > NORMAL > LOW):
```js
RTOS.queueActuatorCmd('DRIVE_ALL', { direction: 'forward', speed: 800 }, RTOS.PRIORITY_LEVELS.HIGH);
```

### AI Task Allocator
Register, queue, and execute tasks with dependency resolution:
```js
const id = RTOS.registerTask({ name: 'Patrol Route', fn: async () => { ... }, priority: 2 });
RTOS.runTask(id);
```

### Communication Bus
Pub/sub message bus modeled after ROS2/DDS:
```js
RTOS.busSubscribe('sensor/imu', (msg) => { ... });
RTOS.busPublish('actuator/cmd', { motor: 'FL', rpm: 900 });
```

### Safety Override Kernel
Register safety checks; critical failures trigger automatic E-STOP:
```js
RTOS.registerSafetyCheck('my_check', 'Custom Check', async () => {
  return { ok: true, msg: 'All clear' };
}, /* critical= */ true);
```

### Watchdog Timer
Auto E-STOP if watchdog isn't fed within timeout:
```js
RTOS.feedWatchdog(); // Call periodically to keep system alive
```

### Emergency Stop
```js
RTOS.triggerEStop('Obstacle detected');  // Triggers E-STOP overlay + logs
RTOS.resetEStop();                        // Resume after E-STOP
```

---

##  Adding Your Own App

1. Create `renderer/js/apps/myapp.js`:
```js
const MyApp = (() => {
  async function launch(pid) {
    WM.create({ id: `myapp-${pid}`, title: 'MY APP', icon: '🚀', width: 500, height: 400,
      content: `<div style="padding:20px;color:var(--text0)">Hello from My App!</div>`
    });
  }
  return { launch };
})();
window.MyApp = MyApp;
```

2. Add `<script src="js/apps/myapp.js"></script>` to `index.html` (before `os.js`)

3. Register in `os.js` APPS array:
```js
{ key: 'myapp', name: 'My App', icon: '🚀', launch: (p) => MyApp.launch(p) },
```

4. Add desktop icon in `index.html`.

---

## 🔌 Connecting Real Hardware

The sensor/actuator data is currently **simulated** in `src/main.js`.
To connect real hardware, replace the simulation functions:

- **Serial/UART**: Use the `serialport` npm package (already in dependencies)
- **ROS2**: Connect via WebSocket bridge (rosbridge_suite)
- **Arduino/ESP32**: Serial port via `ipcMain.handle('robot:getSensorData',...)`
- **MQTT**: Use `mqtt` npm package for IoT sensors

Example real sensor connection (in `main.js`):
```js
const SerialPort = require('serialport');
const port = new SerialPort.SerialPort({ path: 'COM3', baudRate: 115200 });
port.on('data', (data) => {
  // Parse and store sensor data
});
```

---

##  File Storage

RoboticOS stores files at:
```
C:\Users\<you>\RoboticOS\
  missions\
  maps\
  logs\
    mission.log
    commands.log
    safety.log
  models\
  configs\
    robot.json
  scripts\
  data\
```

---

## Terminal Commands

| Command | Description |
|---------|-------------|
| `robot status` | Full system status |
| `sensors` | All sensor readings snapshot |
| `actuators` | Actuator status |
| `tasks` | Task queue |
| `bus` | Comm bus node list |
| `estop` | Trigger emergency stop |
| `reset` | Reset after E-STOP |
| `log [n]` | Show last n mission log entries |
| `ls`, `cd`, `cat`, `mkdir`, `rm` | File system commands |

---

## 🗺 Roadmap

- **Phase 2**: Real serial/UART sensor integration, ROS2 WebSocket bridge
- **Phase 3**: SLAM map building with real LiDAR data
- **Phase 4**: Mission scripting language (plan files)
- **Phase 5**: Multi-robot coordination via mesh network
- **Phase 6**: Onboard ML inference (ONNX/TensorFlow Lite)
- **Phase 7**: Digital twin simulation mode

---

*RoboticOS runs entirely in userspace using Electron. It does not modify Windows, the registry, or system files.*
