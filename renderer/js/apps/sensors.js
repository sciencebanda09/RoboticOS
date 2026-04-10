/**
 * RoboticOS — Sensor Hub
 * Real-time display of all sensor data with mini waveforms
 */
const SensorsApp = (() => {
  'use strict';
  let _intervals = {};
  const _histories = {};

  async function launch(pid) {
    const id = `sensors-${pid}`;
    const content = `
      <div class="sensors-wrap" id="sw-${pid}">
        <div class="sensor-tabs">
          ${['IMU','LiDAR','GPS','Battery','Temperature','Ultrasonic'].map((t,i) =>
            `<div class="sensor-tab${i===0?' active':''}" onclick="SensorsApp._tab(${pid},'${t.toLowerCase()}',this)">${t}</div>`
          ).join('')}
        </div>
        <div class="sensor-panel" id="sp-${pid}"></div>
      </div>
    `;

    WM.create({ id, title: 'SENSOR HUB', icon: '🔬', width: 760, height: 480, content });
    await nextFrame();

    _histories[pid] = {};
    SensorsApp._tab(pid, 'imu', document.querySelector(`#content-${id} .sensor-tab`));
    _startUpdates(pid);

    Kernel.on('wm:close', (cid) => {
      if (cid === id) { clearInterval(_intervals[pid]); delete _intervals[pid]; delete _histories[pid]; }
    });
  }

  function _tab(pid, tab, el) {
    const wrap = el?.closest('.sensors-wrap');
    wrap?.querySelectorAll('.sensor-tab').forEach(t => t.classList.remove('active'));
    el?.classList.add('active');
    _renderTab(pid, tab);
  }

  function _renderTab(pid, tab) {
    const panel = document.getElementById(`sp-${pid}`);
    if (!panel) return;
    const templates = {
      imu: () => `
        <div class="data-card">
          <div class="data-card-title">ORIENTATION (DEG)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:6px">
            ${['Roll','Pitch','Yaw'].map(k => `
              <div style="text-align:center">
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--text2)">${k}</div>
                <div class="sensor-val-big" id="imu-${k.toLowerCase()}-${pid}">--</div>
                <div class="sensor-unit">°</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="data-card">
          <div class="data-card-title">LINEAR ACCELERATION (m/s²)</div>
          ${['ax','ay','az'].map(k => `
            <div class="data-row">
              <span class="data-row-key">${k.toUpperCase()}</span>
              <span class="data-row-val" id="imu-${k}-${pid}">--</span>
            </div>
          `).join('')}
        </div>
        <div class="data-card" style="grid-column:1/-1">
          <div class="data-card-title">ANGULAR VELOCITY (°/s)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            ${['gx','gy','gz'].map(k => `
              <div>
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--text2)">ω${k[1].toUpperCase()}</div>
                <div class="sensor-val-big" id="imu-${k}-${pid}" style="font-size:20px">--</div>
              </div>
            `).join('')}
          </div>
        </div>
      `,
      lidar: () => `
        <div class="data-card">
          <div class="data-card-title">POINT CLOUD</div>
          <div class="sensor-val-big" id="lidar-pts-${pid}">--</div>
          <div class="sensor-unit">POINTS/FRAME</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">RANGE</div>
          <div class="sensor-val-big" id="lidar-range-${pid}">--</div>
          <div class="sensor-unit">METERS (nearest)</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">OBSTACLES DETECTED</div>
          <div class="sensor-val-big" id="lidar-obs-${pid}">--</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">SCAN RATE</div>
          <div class="sensor-val-big" id="lidar-hz-${pid}">--</div>
          <div class="sensor-unit">Hz</div>
        </div>
        <div class="data-card" style="grid-column:1/-1">
          <div class="data-card-title">CAMERA</div>
          <div class="data-row"><span class="data-row-key">FPS</span><span class="data-row-val" id="cam-fps-${pid}">--</span></div>
          <div class="data-row"><span class="data-row-key">Resolution</span><span class="data-row-val" id="cam-res-${pid}">--</span></div>
          <div class="data-row"><span class="data-row-key">Objects Detected</span><span class="data-row-val" id="cam-obj-${pid}">--</span></div>
          <div class="data-row"><span class="data-row-key">Confidence</span><span class="data-row-val" id="cam-conf-${pid}">--</span></div>
        </div>
      `,
      gps: () => `
        <div class="data-card">
          <div class="data-card-title">LATITUDE</div>
          <div class="sensor-val-big" id="gps-lat-${pid}" style="font-size:18px">--</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">LONGITUDE</div>
          <div class="sensor-val-big" id="gps-lon-${pid}" style="font-size:18px">--</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">ALTITUDE</div>
          <div class="sensor-val-big" id="gps-alt-${pid}">--</div>
          <div class="sensor-unit">m ASL</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">FIX TYPE</div>
          <div class="sensor-val-big" id="gps-fix-${pid}" style="font-size:20px">--</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">SATELLITES</div>
          <div class="sensor-val-big" id="gps-sat-${pid}">--</div>
        </div>
      `,
      battery: () => `
        <div class="data-card" style="grid-column:1/-1">
          <div class="data-card-title">STATE OF CHARGE</div>
          <div class="sensor-val-big" id="bat-soc-${pid}">--%</div>
          <div class="prog-bar" style="margin-top:10px;height:8px">
            <div class="prog-fill ok" id="bat-soc-bar-${pid}" style="width:80%"></div>
          </div>
        </div>
        <div class="data-card">
          <div class="data-card-title">VOLTAGE</div>
          <div class="sensor-val-big" id="bat-v-${pid}">-- V</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">CURRENT</div>
          <div class="sensor-val-big" id="bat-a-${pid}">-- A</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">TEMP</div>
          <div class="sensor-val-big" id="bat-t-${pid}">--°C</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">HEALTH</div>
          <div class="sensor-val-big" id="bat-h-${pid}" style="font-size:18px">--</div>
        </div>
      `,
      temperature: () => `
        ${['CPU','Motor 1','Motor 2','Ambient'].map((name, i) => {
          const key = ['cpu','motor1','motor2','ambient'][i];
          return `
            <div class="data-card">
              <div class="data-card-title">${name}</div>
              <div class="sensor-val-big" id="tmp-${key}-${pid}">--</div>
              <div class="sensor-unit">°C</div>
              <div class="prog-bar" style="margin-top:8px">
                <div class="prog-fill" id="tmp-${key}-bar-${pid}" style="width:50%"></div>
              </div>
            </div>
          `;
        }).join('')}
      `,
      ultrasonic: () => `
        ${['front','rear','left','right'].map(dir => `
          <div class="data-card" style="text-align:center">
            <div class="data-card-title">${dir.toUpperCase()}</div>
            <div class="sensor-val-big" id="us-${dir}-${pid}">--</div>
            <div class="sensor-unit">meters</div>
            <div class="prog-bar" style="margin-top:8px">
              <div class="prog-fill" id="us-${dir}-bar-${pid}" style="width:50%"></div>
            </div>
          </div>
        `).join('')}
      `,
    };
    const tpl = templates[tab];
    panel.innerHTML = tpl ? tpl() : '<div style="padding:16px;color:var(--text2)">No data</div>';
    panel.dataset.tab = tab;
  }

  function _startUpdates(pid) {
    const update = async () => {
      try {
        const s = await roboOS.robot.getSensorData();
        const panel = document.getElementById(`sp-${pid}`);
        if (!panel) return;
        const tab = panel.dataset.tab || 'imu';

        if (tab === 'imu') {
          _s(`imu-roll-${pid}`,  s.imu.roll);
          _s(`imu-pitch-${pid}`, s.imu.pitch);
          _s(`imu-yaw-${pid}`,   s.imu.yaw);
          _s(`imu-ax-${pid}`,    s.imu.ax);
          _s(`imu-ay-${pid}`,    s.imu.ay);
          _s(`imu-az-${pid}`,    s.imu.az);
          _s(`imu-gx-${pid}`,    s.imu.gx);
          _s(`imu-gy-${pid}`,    s.imu.gy);
          _s(`imu-gz-${pid}`,    s.imu.gz);
        } else if (tab === 'lidar') {
          _s(`lidar-pts-${pid}`,   s.lidar.points.toLocaleString());
          _s(`lidar-range-${pid}`, s.lidar.range);
          _s(`lidar-obs-${pid}`,   s.lidar.obstacleCount);
          _s(`lidar-hz-${pid}`,    s.lidar.hz);
          _s(`cam-fps-${pid}`,     s.camera.fps);
          _s(`cam-res-${pid}`,     s.camera.resolution);
          _s(`cam-obj-${pid}`,     s.camera.objectsDetected);
          _s(`cam-conf-${pid}`,    s.camera.confidence);
        } else if (tab === 'gps') {
          _s(`gps-lat-${pid}`, s.gps.lat);
          _s(`gps-lon-${pid}`, s.gps.lon);
          _s(`gps-alt-${pid}`, s.gps.alt);
          _s(`gps-fix-${pid}`, s.gps.fix);
          _s(`gps-sat-${pid}`, s.gps.satellites);
        } else if (tab === 'battery') {
          const soc = parseFloat(s.battery.soc);
          _s(`bat-soc-${pid}`, `${soc}%`);
          _s(`bat-v-${pid}`,   `${s.battery.voltage} V`);
          _s(`bat-a-${pid}`,   `${s.battery.current} A`);
          _s(`bat-t-${pid}`,   `${s.battery.temp}°C`);
          _s(`bat-h-${pid}`,   s.battery.health);
          const bar = document.getElementById(`bat-soc-bar-${pid}`);
          if (bar) { bar.style.width = `${soc}%`; bar.className = `prog-fill ${soc < 20 ? 'danger' : soc < 40 ? 'warn' : 'ok'}`; }
        } else if (tab === 'temperature') {
          [['cpu','CPU'],['motor1','Motor 1'],['motor2','Motor 2'],['ambient','Ambient']].forEach(([k]) => {
            const val = parseFloat(s.temperature[k]);
            _s(`tmp-${k}-${pid}`, `${val}°C`);
            const bar = document.getElementById(`tmp-${k}-bar-${pid}`);
            if (bar) {
              const pct = Math.min(100, (val / 100) * 100);
              bar.style.width = `${pct}%`;
              bar.className = `prog-fill ${pct > 85 ? 'danger' : pct > 65 ? 'warn' : ''}`;
            }
          });
        } else if (tab === 'ultrasonic') {
          ['front','rear','left','right'].forEach(dir => {
            const val = parseFloat(s.ultrasonic[dir]);
            _s(`us-${dir}-${pid}`, val.toFixed(2));
            const bar = document.getElementById(`us-${dir}-bar-${pid}`);
            if (bar) {
              const pct = Math.min(100, (val / 2) * 100);
              bar.style.width = `${pct}%`;
              bar.className = `prog-fill ${val < 0.2 ? 'danger' : val < 0.5 ? 'warn' : 'ok'}`;
            }
          });
        }
      } catch(e) {}
    };
    update();
    _intervals[pid] = setInterval(update, 200);
  }

  function _s(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
  function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }

  return { launch, _tab };
})();
window.SensorsApp = SensorsApp;
