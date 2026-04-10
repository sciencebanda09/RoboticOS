/**
 * RoboticOS — OS Orchestrator
 * Boot sequence, app registry, launcher, taskbar, notifications, clock
 */
const OS = (() => {
  'use strict';

  let _pid = 0;
  let _launcherOpen = false;
  const _openApps = new Map();

  const APPS = [
    { key: 'dashboard', name: 'Mission Control',   icon: '📡', launch: (p) => DashboardApp.launch(p) },
    { key: 'sensors',   name: 'Sensor Hub',        icon: '🔬', launch: (p) => SensorsApp.launch(p) },
    { key: 'actuators', name: 'Actuator Mgr',      icon: '⚙️', launch: (p) => ActuatorsApp.launch(p) },
    { key: 'tasks',     name: 'AI Task Allocator', icon: '🤖', launch: (p) => TasksApp.launch(p) },
    { key: 'safety',    name: 'Safety Kernel',     icon: '🛡️', launch: (p) => SafetyApp.launch(p) },
    { key: 'network',   name: 'Comm Bus',          icon: '🌐', launch: (p) => NetworkApp.launch(p) },
    { key: 'terminal',  name: 'Terminal',          icon: '⌨️', launch: (p) => TerminalApp.launch(p) },
    { key: 'logs',      name: 'Mission Logs',      icon: '📋', launch: (p) => LogsApp.launch(p) },
    { key: 'map',       name: 'Navigation Map',    icon: '🗺️', launch: (p) => MapApp.launch(p) },
    { key: 'config',    name: 'Config Editor',     icon: '🔧', launch: (p) => ConfigApp.launch(p) },
  ];

  function nextPid() { return ++_pid; }

  async function launchApp(key) {
    closeLauncher();
    const appDef = APPS.find(a => a.key === key);
    if (!appDef) return;

    if (_openApps.has(key)) {
      const existingPid = _openApps.get(key);
      const winId = `${key}-${existingPid}`;
      if (WM.isOpen(winId)) {
        WM.focus(winId);
        const w = WM.getWindow(winId);
        if (w?.state === 'minimized') WM.minimize(winId);
        return;
      }
    }

    const pid = nextPid();
    _openApps.set(key, pid);
    const proc = Kernel.spawn(appDef.name, appDef);
    await appDef.launch(pid);
    _addTaskbarBtn(key, pid, appDef);

    Kernel.on('wm:close', (closedId) => {
      if (closedId === `${key}-${pid}`) {
        _openApps.delete(key);
        _removeTaskbarBtn(key, pid);
        Kernel.kill(proc.pid);
      }
    });
  }

  function _addTaskbarBtn(key, pid, appDef) {
    const bar = document.getElementById('taskbar-apps');
    const btn = document.createElement('button');
    btn.className = 'taskbar-btn';
    btn.id = `tbtn-${key}-${pid}`;
    btn.innerHTML = `<span>${appDef.icon}</span><span>${appDef.name}</span>`;
    btn.onclick = () => {
      const winId = `${key}-${pid}`;
      const w = WM.getWindow(winId);
      if (!w) return;
      if (w.state === 'minimized') WM.minimize(winId);
      else WM.focus(winId);
    };
    bar.appendChild(btn);
    Kernel.on('wm:focus', (id) => {
      btn.classList.toggle('active', id === `${key}-${pid}`);
    });
  }

  function _removeTaskbarBtn(key, pid) {
    document.getElementById(`tbtn-${key}-${pid}`)?.remove();
  }

  function toggleLauncher() { _launcherOpen ? closeLauncher() : openLauncher(); }

  function openLauncher() {
    const launcher = document.getElementById('launcher');
    launcher.classList.remove('hidden');
    _launcherOpen = true;
    _renderLauncherGrid(APPS);
    setTimeout(() => document.getElementById('launcher-search')?.focus(), 50);
  }

  function closeLauncher() {
    document.getElementById('launcher').classList.add('hidden');
    _launcherOpen = false;
  }

  function filterLauncher(q) {
    _renderLauncherGrid(APPS.filter(a => a.name.toLowerCase().includes(q.toLowerCase())));
  }

  function _renderLauncherGrid(apps) {
    document.getElementById('launcher-grid').innerHTML = apps.map(a => `
      <div class="launcher-item" onclick="OS.launchApp('${a.key}')">
        <div class="launcher-item-icon">${a.icon}</div>
        <div class="launcher-item-name">${a.name}</div>
      </div>
    `).join('');
  }

  // ── Clock ─────────────────────────────────────────────────────────────────
  function _startClock() {
    function tick() {
      const el = document.getElementById('tray-clock');
      if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Battery tray ──────────────────────────────────────────────────────────
  function _startBatteryTray() {
    async function tick() {
      const el = document.getElementById('tray-soc');
      if (!el) return;
      try {
        const s = await roboOS.robot.getSensorData();
        const soc = parseFloat(s.battery.soc).toFixed(0);
        el.textContent = `🔋 ${soc}%`;
        el.style.color = soc < 20 ? 'var(--danger)' : soc < 40 ? 'var(--warn)' : 'var(--text2)';
      } catch(e) {}
    }
    tick();
    setInterval(tick, 3000);
  }

  // ── Latency tray ──────────────────────────────────────────────────────────
  function _startLatencyTray() {
    Kernel.on('bus:message', () => {
      const el = document.getElementById('tray-latency');
      if (el) el.textContent = `⚡ ${(Math.random() * 3 + 1).toFixed(0)}ms`;
    });
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  function _initNotifications() {
    const container = document.getElementById('notif-container');
    Kernel.on('notify', (n) => {
      const el = document.createElement('div');
      el.className = `notif-item ${n.type || 'info'}`;
      el.innerHTML = `
        <div class="notif-head">
          <span class="notif-icon">${n.icon}</span>
          <strong class="notif-title">${n.title}</strong>
        </div>
        <div class="notif-body">${n.body}</div>
      `;
      container.appendChild(el);
      el.addEventListener('click', () => {
        el.style.opacity = '0'; el.style.transform = 'translateX(20px)';
        setTimeout(() => el.remove(), 300);
      });
      Kernel.on('notify:dismiss', (id) => {
        if (id === n.id) {
          el.style.opacity = '0'; el.style.transform = 'translateX(20px)';
          setTimeout(() => el.remove(), 300);
        }
      });
    });
  }

  // ── Context menu ──────────────────────────────────────────────────────────
  function _initContextMenu() {
    const surface = document.getElementById('desktop-surface');
    const menu = document.getElementById('ctx-menu');
    surface.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.app-window, .desk-icon')) return;
      e.preventDefault();
      const x = Math.min(e.clientX, surface.clientWidth - 210);
      const y = Math.min(e.clientY, surface.clientHeight - 200);
      menu.style.left = x + 'px'; menu.style.top = y + 'px';
      menu.classList.remove('hidden');
    });
    document.addEventListener('mousedown', (e) => {
      if (!menu.contains(e.target)) menu.classList.add('hidden');
    });
    document.addEventListener('mousedown', (e) => {
      const launcher = document.getElementById('launcher');
      const start = document.getElementById('taskbar-start');
      if (_launcherOpen && !launcher.contains(e.target) && !start.contains(e.target)) closeLauncher();
    });
  }

  function reloadDesktop() { location.reload(); }

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function boot() {
    const fill   = document.getElementById('boot-fill');
    const status = document.getElementById('boot-status');
    const checks = document.getElementById('boot-checks');

    // Animated boot canvas
    const bootCanvas = document.getElementById('boot-canvas');
    if (bootCanvas) {
      bootCanvas.width  = window.innerWidth;
      bootCanvas.height = window.innerHeight;
      const bctx = bootCanvas.getContext('2d');
      let bf = 0;
      const bootAnim = setInterval(() => {
        bf++;
        bctx.fillStyle = 'rgba(3,5,8,0.2)'; bctx.fillRect(0,0,bootCanvas.width,bootCanvas.height);
        for (let i = 0; i < 3; i++) {
          const x = Math.random() * bootCanvas.width, y = Math.random() * bootCanvas.height;
          bctx.fillStyle = `rgba(0,212,255,${Math.random()*0.05})`;
          bctx.fillRect(x - 20, y, 40, 1);
        }
      }, 50);
      setTimeout(() => clearInterval(bootAnim), 4000);
    }

    const steps = [
      [8,  'INITIALIZING KERNEL...'],
      [18, 'LOADING VIRTUAL FILE SYSTEM...'],
      [30, 'STARTING WINDOW MANAGER...'],
      [42, 'STARTING REAL-TIME RUNTIME (RTOS)...'],
      [55, 'INITIALIZING SENSOR SCHEDULER...'],
      [67, 'STARTING SAFETY KERNEL...'],
      [78, 'CONNECTING COMMUNICATION BUS...'],
      [88, 'LOADING AI TASK ALLOCATOR...'],
      [95, 'INITIALIZING DESKTOP...'],
      [100,'SYSTEM READY'],
    ];

    const checkItems = [
      ['Kernel', true], ['VFS', true], ['WM', true], ['RTOS', true],
      ['Sensor Scheduler', true], ['Safety Kernel', true],
      ['Watchdog', true], ['Comm Bus', true], ['AI Allocator', true],
    ];

    let checkIdx = 0;
    for (const [pct, msg] of steps) {
      fill.style.width = pct + '%';
      status.textContent = msg;
      await sleep(220 + Math.random() * 160);

      if (checkIdx < checkItems.length) {
        const [name, ok] = checkItems[checkIdx++];
        const div = document.createElement('div');
        div.className = `chk ${ok ? 'ok' : 'err'}`;
        div.textContent = `${ok ? '✓' : '✗'} ${name}`;
        checks.appendChild(div);
        if (checks.children.length > 6) checks.removeChild(checks.firstChild);
      }
    }

    await sleep(500);
    const bootScreen = document.getElementById('boot-screen');
    bootScreen.classList.add('fade-out');
    await sleep(600);
    bootScreen.classList.add('hidden');

    const desktop = document.getElementById('desktop');
    desktop.classList.remove('hidden');

    // Initialize all systems
    Wallpaper.init();
    RTOS.init();
    _startClock();
    _startBatteryTray();
    _startLatencyTray();
    _initNotifications();
    _initContextMenu();

    await sleep(400);
    Kernel.notify('RoboticOS', 'System ready. All modules online.', '⬡', 'ok');
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  document.addEventListener('DOMContentLoaded', () => boot());

  return { launchApp, toggleLauncher, closeLauncher, filterLauncher, reloadDesktop, nextPid };
})();
window.OS = OS;
