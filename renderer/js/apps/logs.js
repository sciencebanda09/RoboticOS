/**
 * RoboticOS — Mission Logs
 */
const LogsApp = (() => {
  'use strict';
  let _intervals = {};
  let _filter = 'ALL';
  const _localLog = [];

  async function launch(pid) {
    const id = `logs-${pid}`;
    const content = `
      <div class="logs-wrap" id="logsw-${pid}">
        <div class="log-toolbar">
          ${['ALL','INFO','WARN','ERROR','OK'].map(f =>
            `<button class="log-filter-btn${f==='ALL'?' active':''}" onclick="LogsApp._setFilter(${pid},'${f}',this)">${f}</button>`
          ).join('')}
          <button class="btn" style="margin-left:auto;padding:3px 10px;font-size:11px" onclick="LogsApp._clear(${pid})">Clear</button>
          <button class="btn" style="padding:3px 10px;font-size:11px" onclick="LogsApp._refresh(${pid})">↻ Refresh</button>
        </div>
        <div class="log-body scroll-panel" id="log-body-${pid}"></div>
      </div>
    `;

    WM.create({ id, title: 'MISSION LOGS', icon: '📋', width: 740, height: 500, content });
    await nextFrame();

    // Seed some initial logs
    _emit(pid, 'OK',   'System boot complete');
    _emit(pid, 'INFO', 'RTOS runtime initialized');
    _emit(pid, 'INFO', 'Sensor scheduler started: 7 sensors @ variable rates');
    _emit(pid, 'INFO', 'Safety kernel active: 4 checks registered');
    _emit(pid, 'INFO', 'Watchdog timer started: 10s timeout');
    _emit(pid, 'INFO', 'Comm bus connected: 8 nodes online');
    _emit(pid, 'OK',   'All systems go — ready for mission');

    // Listen to kernel events
    Kernel.on('safety:estop',       (d) => _emit(pid, 'ERROR', `E-STOP: ${d.reason}`));
    Kernel.on('safety:estop-reset', ()  => _emit(pid, 'OK',    'E-STOP reset — operations resumed'));
    Kernel.on('actuator:executed',  (d) => _emit(pid, 'INFO',  `Actuator ${d.actuatorId}: ${JSON.stringify(d.cmd)}`));
    Kernel.on('actuator:error',     (d) => _emit(pid, 'ERROR', `Actuator error ${d.actuatorId}: ${d.error}`));
    Kernel.on('task:start',         (d) => _emit(pid, 'INFO',  `Task started: ${d.name}`));
    Kernel.on('task:done',          (d) => _emit(pid, 'OK',    `Task done: ${d.name}`));
    Kernel.on('task:error',         (d) => _emit(pid, 'ERROR', `Task failed: ${d.name} — ${d.error}`));
    Kernel.on('watchdog:timeout',   (d) => _emit(pid, 'WARN',  `Watchdog timeout! No feed for ${(d.age/1000).toFixed(0)}s`));
    Kernel.on('safety:checked',     (r) => {
      const faults = r.filter(c => !c.ok);
      if (faults.length > 0) faults.forEach(f => _emit(pid, 'WARN', `Safety check: ${f.name} — ${f.msg || 'issue detected'}`));
    });

    // Refresh from disk log periodically
    _intervals[pid] = setInterval(() => _refreshDisk(pid), 10000);

    Kernel.on('wm:close', (cid) => {
      if (cid === id) { clearInterval(_intervals[pid]); delete _intervals[pid]; }
    });
  }

  function _emit(pid, level, msg) {
    const entry = { ts: new Date(), level, msg };
    _localLog.unshift(entry);
    if (_localLog.length > 1000) _localLog.pop();
    roboOS.robot.writeMissionLog(`[${level}] ${msg}`);
    _renderLog(pid);
  }

  function _setFilter(pid, filter, el) {
    _filter = filter;
    document.querySelectorAll(`#logsw-${pid} .log-filter-btn`).forEach(b => b.classList.remove('active'));
    el?.classList.add('active');
    _renderLog(pid);
  }

  async function _refreshDisk(pid) {
    const { lines } = await roboOS.robot.getMissionLog();
    // Disk log already reflected via _emit
  }

  function _renderLog(pid) {
    const body = document.getElementById(`log-body-${pid}`);
    if (!body) return;
    const filtered = _filter === 'ALL' ? _localLog : _localLog.filter(l => l.level === _filter);
    body.innerHTML = filtered.slice(0, 300).map(e => `
      <div class="log-line">
        <span class="log-ts">${e.ts.toLocaleTimeString()}</span>
        <span class="log-lvl ${e.level}">${e.level}</span>
        <span class="log-msg">${e.msg}</span>
      </div>
    `).join('');
  }

  function _clear(pid) { _localLog.length = 0; _renderLog(pid); }
  function _refresh(pid) { _renderLog(pid); }

  function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }
  return { launch, _setFilter, _clear, _refresh };
})();
window.LogsApp = LogsApp;
