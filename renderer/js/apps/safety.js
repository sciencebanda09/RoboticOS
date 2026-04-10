/**
 * RoboticOS — Safety Kernel App
 */
const SafetyApp = (() => {
  'use strict';
  let _intervals = {};

  async function launch(pid) {
    const id = `safety-${pid}`;
    const content = `
      <div class="safety-wrap" id="safw-${pid}">
        <div class="safety-hero">
          <div class="safety-status-ring" id="saf-ring-${pid}">✅</div>
          <div class="safety-status-label" id="saf-label-${pid}">ALL SYSTEMS GO</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text2);margin-top:6px" id="saf-time-${pid}">Last checked: --</div>
        </div>
        <button class="estop-big-btn" onclick="RTOS.triggerEStop('Manual — Safety Panel')">
          ⛔ EMERGENCY STOP
        </button>
        <button class="btn" style="margin:0 12px 8px;background:rgba(0,255,157,0.05);border-color:var(--ok);color:var(--ok)" onclick="SafetyApp._runChecks(${pid})">
          ↻ Run All Checks Now
        </button>
        <div class="safety-checks" id="saf-checks-${pid}">
          <div style="color:var(--text2);font-family:var(--font-mono);font-size:12px;text-align:center;padding:20px">
            Running safety checks...
          </div>
        </div>
        <div style="padding:8px 12px;border-top:1px solid var(--border)">
          <div class="sec-header" style="margin-bottom:8px">WATCHDOG</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text2)">
              Status: <span id="saf-wd-${pid}" style="color:var(--ok)">HEALTHY</span>
            </div>
            <button class="btn ok" onclick="RTOS.feedWatchdog();SafetyApp._feedWd(${pid})">FEED WATCHDOG</button>
          </div>
        </div>
      </div>
    `;

    WM.create({ id, title: 'SAFETY KERNEL', icon: '🛡️', width: 520, height: 600, content });
    await nextFrame();
    _runChecks(pid);
    _intervals[pid] = setInterval(() => _runChecks(pid), 5000);

    Kernel.on('safety:estop', () => {
      const ring = document.getElementById(`saf-ring-${pid}`);
      const label = document.getElementById(`saf-label-${pid}`);
      if (ring) { ring.className = 'safety-status-ring fault'; ring.textContent = '⛔'; }
      if (label) { label.className = 'safety-status-label fault'; label.textContent = 'E-STOP ACTIVE'; }
    });

    Kernel.on('safety:estop-reset', () => {
      const ring = document.getElementById(`saf-ring-${pid}`);
      const label = document.getElementById(`saf-label-${pid}`);
      if (ring) { ring.className = 'safety-status-ring'; ring.textContent = '✅'; }
      if (label) { label.className = 'safety-status-label'; label.textContent = 'ALL SYSTEMS GO'; }
    });

    Kernel.on('wm:close', (cid) => {
      if (cid === id) { clearInterval(_intervals[pid]); delete _intervals[pid]; }
    });
  }

  async function _runChecks(pid) {
    const results = await RTOS.runSafetyChecks();
    const checksEl = document.getElementById(`saf-checks-${pid}`);
    const timeEl = document.getElementById(`saf-time-${pid}`);
    if (timeEl) timeEl.textContent = `Last checked: ${new Date().toLocaleTimeString()}`;
    if (!checksEl) return;

    const hasFailure = results.some(r => !r.ok && !r.warn && r.critical);
    const hasWarn = results.some(r => r.warn || (!r.ok && !r.critical));

    const ring = document.getElementById(`saf-ring-${pid}`);
    const label = document.getElementById(`saf-label-${pid}`);
    if (!RTOS.isEStopActive()) {
      if (ring && label) {
        if (hasFailure) {
          ring.className = 'safety-status-ring fault'; ring.textContent = '🚨';
          label.className = 'safety-status-label fault'; label.textContent = 'FAULT DETECTED';
        } else if (hasWarn) {
          ring.textContent = '⚠️'; ring.style.borderColor = 'var(--warn)'; ring.style.boxShadow = '0 0 20px rgba(255,184,0,0.3)';
          label.className = 'safety-status-label'; label.style.color = 'var(--warn)'; label.textContent = 'WARNING';
        } else {
          ring.className = 'safety-status-ring'; ring.textContent = '✅';
          label.className = 'safety-status-label'; label.textContent = 'ALL SYSTEMS GO';
          ring.style.borderColor = ''; ring.style.boxShadow = ''; label.style.color = '';
        }
      }
    }

    checksEl.innerHTML = results.map(r => `
      <div class="safety-check ${r.ok ? (r.warn ? 'warn' : 'ok') : 'fail'}">
        <div class="safety-check-icon">${r.ok ? (r.warn ? '⚠️' : '✅') : '❌'}</div>
        <div style="flex:1">
          <div class="safety-check-name">${r.name}</div>
          <div class="safety-check-desc">${r.msg || r.error || ''}</div>
        </div>
        ${r.critical ? '<span class="pill danger" style="font-size:9px">CRITICAL</span>' : '<span class="pill info" style="font-size:9px">INFO</span>'}
      </div>
    `).join('');
  }

  function _feedWd(pid) {
    const el = document.getElementById(`saf-wd-${pid}`);
    if (el) { el.textContent = 'FED ✓'; el.style.color = 'var(--ok)'; setTimeout(() => { el.textContent = 'HEALTHY'; }, 1000); }
  }

  function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }
  return { launch, _runChecks, _feedWd };
})();
window.SafetyApp = SafetyApp;
