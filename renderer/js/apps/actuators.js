/**
 * RoboticOS — Actuator Manager
 */
const ActuatorsApp = (() => {
  'use strict';
  let _intervals = {};

  async function launch(pid) {
    const id = `actuators-${pid}`;
    const content = `
      <div class="actuator-wrap" style="overflow:auto;padding:12px;gap:10px;display:flex;flex-direction:column">
        <div class="sec-header">DRIVE MOTORS <span class="badge">4 UNITS</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="act-motors-${pid}"></div>
        <div class="sec-header" style="margin-top:4px">SERVO JOINTS <span class="badge">ARM + GRIPPER</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="act-servos-${pid}"></div>
        <div class="sec-header" style="margin-top:4px">MANUAL CONTROL</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="data-card">
            <div class="data-card-title">DRIVE SPEED</div>
            <div class="slider-ctrl" style="margin-top:8px">
              <label>Speed: <span id="act-speed-val-${pid}">0</span> RPM</label>
              <input type="range" min="0" max="1200" value="0" oninput="ActuatorsApp._setSpeed(${pid},this.value)"/>
            </div>
            <div style="display:flex;gap:6px;margin-top:10px">
              <button class="btn primary" onclick="ActuatorsApp._cmd(${pid},'forward')">▲ FWD</button>
              <button class="btn" onclick="ActuatorsApp._cmd(${pid},'stop')">■ STOP</button>
              <button class="btn" onclick="ActuatorsApp._cmd(${pid},'backward')">▼ REV</button>
            </div>
          </div>
          <div class="data-card">
            <div class="data-card-title">ARM JOINT CONTROL</div>
            ${['ARM_BASE','ARM_ELBOW','ARM_WRIST'].map(j => `
              <div class="slider-ctrl" style="margin-top:6px">
                <label>${j.replace('ARM_','')}: <span id="act-${j}-${pid}">90</span>°</label>
                <input type="range" min="0" max="180" value="90" oninput="ActuatorsApp._setJoint(${pid},'${j}',this.value)"/>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    WM.create({ id, title: 'ACTUATOR MANAGER', icon: '⚙️', width: 760, height: 560, content });
    await nextFrame();
    _startUpdates(pid);

    Kernel.on('wm:close', (cid) => {
      if (cid === id) { clearInterval(_intervals[pid]); delete _intervals[pid]; }
    });
  }

  function _startUpdates(pid) {
    const update = async () => {
      try {
        const act = await roboOS.robot.getActuatorStatus();
        const motorsEl = document.getElementById(`act-motors-${pid}`);
        if (motorsEl) {
          motorsEl.innerHTML = act.motors.map(m => `
            <div class="motor-card active">
              <div class="motor-id">${m.id}</div>
              <div class="motor-name">${m.name}</div>
              <div class="motor-metrics">
                <div><div class="motor-metric-key">RPM</div><div class="motor-metric-val">${m.rpm}</div></div>
                <div><div class="motor-metric-key">TORQUE</div><div class="motor-metric-val">${m.torque} Nm</div></div>
                <div><div class="motor-metric-key">TEMP</div><div class="motor-metric-val">${m.temp}°C</div></div>
                <div><div class="motor-metric-key">CURRENT</div><div class="motor-metric-val">${m.current} A</div></div>
                <div><div class="motor-metric-key">STATUS</div><div class="motor-metric-val"><span class="pill ok">${m.status.toUpperCase()}</span></div></div>
              </div>
              <div class="prog-bar" style="margin-top:8px">
                <div class="prog-fill ok" style="width:${Math.min(100,(m.rpm/1200)*100).toFixed(0)}%"></div>
              </div>
            </div>
          `).join('');
        }

        const servosEl = document.getElementById(`act-servos-${pid}`);
        if (servosEl) {
          servosEl.innerHTML = act.servos.map(s => `
            <div class="motor-card active">
              <div class="motor-id">${s.id}</div>
              <div class="motor-name">${s.name}</div>
              <div class="motor-metrics">
                <div><div class="motor-metric-key">ANGLE</div><div class="motor-metric-val">${s.angle}°</div></div>
                <div><div class="motor-metric-key">LOAD</div><div class="motor-metric-val">${s.load}%</div></div>
                <div><div class="motor-metric-key">STATUS</div><div class="motor-metric-val"><span class="pill ok">${s.status.toUpperCase()}</span></div></div>
              </div>
              <div class="prog-bar" style="margin-top:8px">
                <div class="prog-fill" style="width:${s.load}%"></div>
              </div>
            </div>
          `).join('');
        }
      } catch(e) {}
    };
    update();
    _intervals[pid] = setInterval(update, 500);
  }

  function _setSpeed(pid, val) {
    const el = document.getElementById(`act-speed-val-${pid}`);
    if (el) el.textContent = val;
  }

  function _setJoint(pid, joint, val) {
    const el = document.getElementById(`act-${joint}-${pid}`);
    if (el) el.textContent = val;
    RTOS.queueActuatorCmd(joint, { angle: parseFloat(val) }, RTOS.PRIORITY_LEVELS.NORMAL);
  }

  function _cmd(pid, direction) {
    const speedEl = document.getElementById(`act-speed-val-${pid}`);
    const speed = speedEl ? parseInt(speedEl.textContent) : 500;
    RTOS.queueActuatorCmd('DRIVE_ALL', { direction, speed }, RTOS.PRIORITY_LEVELS.HIGH);
    Kernel.notify('Actuator', `Drive ${direction.toUpperCase()} @ ${speed} RPM`, '⚙️');
  }

  function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }
  return { launch, _setSpeed, _setJoint, _cmd };
})();
window.ActuatorsApp = ActuatorsApp;
