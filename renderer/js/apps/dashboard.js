/**
 * RoboticOS — Mission Control Dashboard
 */
const DashboardApp = (() => {
  'use strict';
  let _intervals = {};

  async function launch(pid) {
    const id = `dashboard-${pid}`;
    const content = `
      <div style="padding:12px;height:100%;overflow:auto;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto auto;gap:10px">

        <!-- Status Overview -->
        <div class="dash-section" style="grid-column:1/-1">
          <div class="dash-title">MISSION STATUS <span id="dd-status-${pid}" class="pill ok">OPERATIONAL</span></div>
          <div class="stat-grid">
            <div class="stat-box">
              <div class="stat-label">BATTERY SOC</div>
              <div class="stat-value" id="dd-soc-${pid}">--%</div>
              <div class="stat-unit">STATE OF CHARGE</div>
              <div class="prog-bar"><div class="prog-fill" id="dd-soc-bar-${pid}" style="width:80%"></div></div>
            </div>
            <div class="stat-box">
              <div class="stat-label">CPU TEMP</div>
              <div class="stat-value" id="dd-temp-${pid}">--°C</div>
              <div class="stat-unit">MAIN PROCESSOR</div>
              <div class="prog-bar"><div class="prog-fill warn" id="dd-temp-bar-${pid}" style="width:60%"></div></div>
            </div>
            <div class="stat-box">
              <div class="stat-label">FRONT OBSTACLE</div>
              <div class="stat-value" id="dd-prox-${pid}">-- m</div>
              <div class="stat-unit">ULTRASONIC SENSOR</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">IMU YAW</div>
              <div class="stat-value" id="dd-yaw-${pid}">--°</div>
              <div class="stat-unit">HEADING</div>
            </div>
          </div>
        </div>

        <!-- GPS + Position -->
        <div class="dash-section">
          <div class="dash-title">POSITION / GPS</div>
          <div class="data-row"><span class="data-row-key">Latitude</span> <span class="data-row-val" id="dd-lat-${pid}">--</span></div>
          <div class="data-row"><span class="data-row-key">Longitude</span><span class="data-row-val" id="dd-lon-${pid}">--</span></div>
          <div class="data-row"><span class="data-row-key">Altitude</span> <span class="data-row-val" id="dd-alt-${pid}">-- m</span></div>
          <div class="data-row"><span class="data-row-key">Fix Type</span> <span class="data-row-val" id="dd-fix-${pid}">--</span></div>
          <div class="data-row"><span class="data-row-key">Satellites</span><span class="data-row-val" id="dd-sat-${pid}">--</span></div>
        </div>

        <!-- Actuator Summary -->
        <div class="dash-section">
          <div class="dash-title">DRIVE MOTORS</div>
          <div id="dd-motors-${pid}"></div>
        </div>

        <!-- Tasks -->
        <div class="dash-section">
          <div class="dash-title">ACTIVE TASKS</div>
          <div id="dd-tasks-${pid}"></div>
        </div>

        <!-- Bus Stats -->
        <div class="dash-section">
          <div class="dash-title">COMM BUS</div>
          <div class="data-row"><span class="data-row-key">Messages</span><span class="data-row-val" id="dd-msgs-${pid}">--</span></div>
          <div class="data-row"><span class="data-row-key">Topics</span>  <span class="data-row-val" id="dd-topics-${pid}">--</span></div>
          <div class="data-row"><span class="data-row-key">Protocol</span><span class="data-row-val">ROS2/DDS</span></div>
          <div class="data-row"><span class="data-row-key">RX</span>      <span class="data-row-val" id="dd-rx-${pid}">-- MB/s</span></div>
          <div class="data-row"><span class="data-row-key">TX</span>      <span class="data-row-val" id="dd-tx-${pid}">-- MB/s</span></div>
        </div>

      </div>
    `;

    WM.create({ id, title: 'MISSION CONTROL', icon: '📡', width: 860, height: 580, content });
    await nextFrame();
    _startUpdates(pid);

    Kernel.on('wm:close', (cid) => {
      if (cid === id) { clearInterval(_intervals[pid]); delete _intervals[pid]; }
    });
  }

  function _startUpdates(pid) {
    const update = async () => {
      try {
        const [sensors, actuators, tasks, bus] = await Promise.all([
          roboOS.robot.getSensorData(),
          roboOS.robot.getActuatorStatus(),
          roboOS.robot.getTaskQueue(),
          roboOS.robot.getNetworkBus(),
        ]);

        _set(`dd-soc-${pid}`, `${sensors.battery.soc}%`);
        _set(`dd-temp-${pid}`, `${sensors.temperature.cpu}°C`);
        _set(`dd-prox-${pid}`, `${sensors.ultrasonic.front} m`);
        _set(`dd-yaw-${pid}`, `${sensors.imu.yaw}°`);
        _set(`dd-lat-${pid}`, sensors.gps.lat);
        _set(`dd-lon-${pid}`, sensors.gps.lon);
        _set(`dd-alt-${pid}`, `${sensors.gps.alt} m`);
        _set(`dd-fix-${pid}`, sensors.gps.fix);
        _set(`dd-sat-${pid}`, sensors.gps.satellites);

        const socPct = parseFloat(sensors.battery.soc);
        _width(`dd-soc-bar-${pid}`, `${socPct}%`);
        _class(`dd-soc-bar-${pid}`, 'prog-fill' + (socPct < 20 ? ' danger' : socPct < 40 ? ' warn' : ' ok'));

        const tempPct = Math.min(100, (parseFloat(sensors.temperature.cpu) / 100) * 100);
        _width(`dd-temp-bar-${pid}`, `${tempPct}%`);
        _class(`dd-temp-bar-${pid}`, 'prog-fill' + (tempPct > 85 ? ' danger' : tempPct > 70 ? ' warn' : ''));

        const motorsEl = document.getElementById(`dd-motors-${pid}`);
        if (motorsEl) {
          motorsEl.innerHTML = actuators.motors.map(m => `
            <div class="data-row">
              <span class="data-row-key">${m.id}</span>
              <span class="data-row-val">${m.rpm} RPM · ${m.temp}°C</span>
            </div>
          `).join('');
        }

        const tasksEl = document.getElementById(`dd-tasks-${pid}`);
        if (tasksEl) {
          tasksEl.innerHTML = tasks.tasks.map(t => `
            <div class="data-row">
              <span class="data-row-key">${t.name}</span>
              <span class="pill ${t.status === 'running' ? 'ok' : 'info'}">${t.status.toUpperCase()}</span>
            </div>
          `).join('');
        }

        const stats = RTOS.getBusStats();
        _set(`dd-msgs-${pid}`, stats.messageCount.toLocaleString());
        _set(`dd-topics-${pid}`, stats.topicCount);
        _set(`dd-rx-${pid}`, `${bus.bandwidth.rx} MB/s`);
        _set(`dd-tx-${pid}`, `${bus.bandwidth.tx} MB/s`);

      } catch(e) { console.error('[Dashboard]', e); }
    };

    update();
    _intervals[pid] = setInterval(update, 1500);
  }

  function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
  function _width(id, val) { const el = document.getElementById(id); if (el) el.style.width = val; }
  function _class(id, cls) { const el = document.getElementById(id); if (el) el.className = cls; }
  function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }

  return { launch };
})();
window.DashboardApp = DashboardApp;
