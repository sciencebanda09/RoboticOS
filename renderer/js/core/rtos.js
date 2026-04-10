/**
 * RoboticOS — Real-Time OS Runtime Layer
 * Handles: Safety override kernel, Watchdog timer, Sensor scheduler,
 *          Actuator priority manager, AI task allocator core
 */
const RTOS = (() => {
  'use strict';

  // ── Safety State ──────────────────────────────────────────────────────────
  let _eStopActive = false;
  const _safetyChecks = new Map();
  let _watchdogTimer = null;
  let _watchdogLastFeed = Date.now();
  const WATCHDOG_TIMEOUT = 10000; // 10s

  // ── Sensor Scheduler ──────────────────────────────────────────────────────
  const _sensorHandlers = new Map();
  const _sensorData = new Map();
  const _schedulerIntervals = {};

  const SENSOR_RATES = {
    imu:         20,  // 50Hz
    lidar:       50,  // 20Hz
    camera:      33,  // 30Hz
    gps:         1000, // 1Hz
    battery:     2000, // 0.5Hz
    temperature: 5000, // 0.2Hz
    ultrasonic:  50,  // 20Hz
  };

  function scheduleSensors() {
    Object.entries(SENSOR_RATES).forEach(([sensor, interval]) => {
      _schedulerIntervals[sensor] = setInterval(async () => {
        if (_eStopActive) return;
        try {
          const data = await roboOS.robot.getSensorData();
          if (data[sensor]) {
            _sensorData.set(sensor, { ...data[sensor], ts: Date.now() });
            _sensorHandlers.get(sensor)?.forEach(fn => { try { fn(_sensorData.get(sensor)); } catch(e) {} });
            Kernel.emit(`sensor:${sensor}`, _sensorData.get(sensor));
          }
        } catch(e) {}
      }, interval);
    });
  }

  function onSensor(sensor, fn) {
    if (!_sensorHandlers.has(sensor)) _sensorHandlers.set(sensor, new Set());
    _sensorHandlers.get(sensor).add(fn);
    return () => _sensorHandlers.get(sensor)?.delete(fn);
  }

  function getSensor(sensor) { return _sensorData.get(sensor) || null; }

  // ── Actuator Priority Manager ─────────────────────────────────────────────
  const _actuatorQueue = [];
  const PRIORITY_LEVELS = { SAFETY: 0, EMERGENCY: 1, HIGH: 2, NORMAL: 3, LOW: 4 };

  function queueActuatorCmd(actuatorId, cmd, priority = PRIORITY_LEVELS.NORMAL) {
    if (_eStopActive && priority > PRIORITY_LEVELS.EMERGENCY) {
      console.warn(`[RTOS] Actuator cmd blocked during E-STOP: ${actuatorId}`);
      return false;
    }
    _actuatorQueue.push({ actuatorId, cmd, priority, ts: Date.now(), id: Math.random().toString(36).slice(2) });
    _actuatorQueue.sort((a, b) => a.priority - b.priority);
    Kernel.emit('actuator:queued', { actuatorId, cmd, priority });
    _processActuatorQueue();
    return true;
  }

  async function _processActuatorQueue() {
    while (_actuatorQueue.length > 0) {
      const cmd = _actuatorQueue.shift();
      try {
        await roboOS.robot.sendCommand({ type: 'actuator', ...cmd });
        Kernel.emit('actuator:executed', cmd);
        await roboOS.robot.writeMissionLog(`ACTUATOR ${cmd.actuatorId}: ${JSON.stringify(cmd.cmd)}`);
      } catch(e) {
        Kernel.emit('actuator:error', { ...cmd, error: e.message });
      }
    }
  }

  // ── AI Task Allocator ─────────────────────────────────────────────────────
  const _taskRegistry = new Map();
  let _taskIdCounter = 0;

  function registerTask({ name, fn, priority = 3, minInterval = 1000, deps = [] }) {
    const id = `task_${++_taskIdCounter}`;
    _taskRegistry.set(id, { id, name, fn, priority, minInterval, deps, status: 'idle', lastRun: 0, runs: 0, errors: 0 });
    Kernel.emit('task:registered', { id, name });
    return id;
  }

  async function runTask(id) {
    const task = _taskRegistry.get(id);
    if (!task || task.status === 'running') return;
    if (_eStopActive && task.priority > 1) return;

    // Check deps
    for (const dep of task.deps) {
      const depTask = _taskRegistry.get(dep);
      if (depTask && depTask.status === 'running') {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    task.status = 'running';
    task.lastRun = Date.now();
    Kernel.emit('task:start', { id, name: task.name });

    try {
      const result = await task.fn();
      task.status = 'idle';
      task.runs++;
      Kernel.emit('task:done', { id, name: task.name, result });
    } catch(e) {
      task.status = 'error';
      task.errors++;
      Kernel.emit('task:error', { id, name: task.name, error: e.message });
      console.error(`[RTOS] Task ${task.name} failed:`, e);
    }
  }

  function getTasks() { return [..._taskRegistry.values()]; }

  // ── AI Decision Pipeline ──────────────────────────────────────────────────
  const _aiPipeline = [];

  function addAIPipelineStage(name, fn) {
    _aiPipeline.push({ name, fn });
  }

  async function runAIPipeline(input) {
    let ctx = { ...input, stages: [] };
    for (const stage of _aiPipeline) {
      try {
        const result = await stage.fn(ctx);
        ctx = { ...ctx, ...result, stages: [...ctx.stages, { name: stage.name, ok: true }] };
      } catch(e) {
        ctx.stages.push({ name: stage.name, ok: false, error: e.message });
      }
    }
    return ctx;
  }

  // ── Communication Bus ─────────────────────────────────────────────────────
  const _busChannels = new Map();
  let _busMessageCounter = 0;
  const _busLog = [];

  function busPublish(topic, data) {
    const msg = {
      id: ++_busMessageCounter,
      topic, data,
      ts: Date.now(),
      size: JSON.stringify(data).length,
    };
    _busLog.unshift(msg);
    if (_busLog.length > 500) _busLog.pop();
    const subs = _busChannels.get(topic);
    if (subs) subs.forEach(fn => { try { fn(msg); } catch(e) {} });
    Kernel.emit('bus:message', msg);
    return msg.id;
  }

  function busSubscribe(topic, fn) {
    if (!_busChannels.has(topic)) _busChannels.set(topic, new Set());
    _busChannels.get(topic).add(fn);
    return () => _busChannels.get(topic)?.delete(fn);
  }

  function getBusLog(limit = 50) { return _busLog.slice(0, limit); }
  function getBusStats() {
    return {
      messageCount: _busMessageCounter,
      topicCount: _busChannels.size,
      logSize: _busLog.length,
    };
  }

  // ── Safety Override Kernel ────────────────────────────────────────────────
  function registerSafetyCheck(id, name, fn, critical = false) {
    _safetyChecks.set(id, { id, name, fn, critical, lastStatus: 'unknown', lastCheck: 0 });
  }

  async function runSafetyChecks() {
    const results = [];
    for (const [id, check] of _safetyChecks) {
      try {
        const result = await check.fn();
        check.lastStatus = result.ok ? 'ok' : (result.warn ? 'warn' : 'fail');
        check.lastCheck = Date.now();
        results.push({ id, name: check.name, ...result, critical: check.critical });
        if (!result.ok && check.critical && !_eStopActive) {
          triggerEStop(`Safety check failed: ${check.name}`);
        }
      } catch(e) {
        check.lastStatus = 'error';
        results.push({ id, name: check.name, ok: false, error: e.message, critical: check.critical });
      }
    }
    Kernel.emit('safety:checked', results);
    return results;
  }

  function triggerEStop(reason = 'Unknown') {
    _eStopActive = true;
    roboOS.robot.triggerEStop(reason);
    roboOS.robot.writeMissionLog(`[ESTOP] ${reason}`);
    Kernel.emit('safety:estop', { reason, ts: Date.now() });
    Kernel.notify('E-STOP ACTIVATED', reason, '⛔', 'danger');

    const overlay = document.getElementById('estop-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      const sub = document.getElementById('estop-reason');
      if (sub) sub.textContent = reason;
    }
  }

  function resetEStop() {
    _eStopActive = false;
    Kernel.emit('safety:estop-reset', { ts: Date.now() });
    Kernel.notify('E-STOP Reset', 'System resuming normal operations', '✅', 'ok');
    roboOS.robot.writeMissionLog('[SYSTEM] E-STOP reset — resuming operations');
    const overlay = document.getElementById('estop-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function isEStopActive() { return _eStopActive; }

  // ── Watchdog ──────────────────────────────────────────────────────────────
  function startWatchdog() {
    _watchdogLastFeed = Date.now();
    _watchdogTimer = setInterval(() => {
      const age = Date.now() - _watchdogLastFeed;
      if (age > WATCHDOG_TIMEOUT) {
        Kernel.emit('watchdog:timeout', { age });
        Kernel.notify('Watchdog Timeout', `No feed for ${(age/1000).toFixed(0)}s`, '⚠️', 'warn');
      } else {
        Kernel.emit('watchdog:ok', { age });
      }
    }, 2000);
  }

  function feedWatchdog() {
    _watchdogLastFeed = Date.now();
    Kernel.emit('watchdog:fed', { ts: _watchdogLastFeed });
  }

  // ── Built-in Safety Checks ────────────────────────────────────────────────
  function _initDefaultSafetyChecks() {
    registerSafetyCheck('battery', 'Battery Level', async () => {
      const data = await roboOS.robot.getSensorData();
      const soc = parseFloat(data.battery?.soc);
      if (soc < 10) return { ok: false, msg: `Critical: ${soc}%` };
      if (soc < 20) return { ok: true, warn: true, msg: `Low: ${soc}%` };
      return { ok: true, msg: `${soc}%` };
    }, true);

    registerSafetyCheck('temperature', 'CPU Temperature', async () => {
      const data = await roboOS.robot.getSensorData();
      const temp = parseFloat(data.temperature?.cpu);
      if (temp > 90) return { ok: false, msg: `Critical: ${temp}°C` };
      if (temp > 75) return { ok: true, warn: true, msg: `High: ${temp}°C` };
      return { ok: true, msg: `${temp}°C` };
    }, false);

    registerSafetyCheck('proximity', 'Proximity / Collision Guard', async () => {
      const data = await roboOS.robot.getSensorData();
      const front = parseFloat(data.ultrasonic?.front);
      if (front < 0.15) return { ok: false, msg: `Too close: ${front}m` };
      if (front < 0.30) return { ok: true, warn: true, msg: `Near: ${front}m` };
      return { ok: true, msg: `Clear: ${front}m` };
    }, true);

    registerSafetyCheck('comms', 'Communication Bus', async () => {
      const bus = await roboOS.robot.getNetworkBus();
      const offline = bus.nodes.filter(n => n.status === 'offline');
      if (offline.length > 0) return { ok: false, msg: `Nodes offline: ${offline.map(n=>n.id).join(', ')}` };
      return { ok: true, msg: `${bus.nodes.length} nodes online` };
    }, false);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    _initDefaultSafetyChecks();
    scheduleSensors();
    startWatchdog();
    feedWatchdog();
    // Auto safety check loop
    setInterval(() => { runSafetyChecks(); feedWatchdog(); }, 5000);
    // Bus heartbeat
    setInterval(() => { busPublish('system/heartbeat', { ts: Date.now(), eStop: _eStopActive }); }, 1000);
    Kernel.notify('RTOS', 'Real-time runtime initialized', '⬡', 'ok');
  }

  return {
    init,
    // Sensor scheduler
    onSensor, getSensor,
    // Actuator manager
    queueActuatorCmd, PRIORITY_LEVELS,
    // Task allocator
    registerTask, runTask, getTasks,
    // AI pipeline
    addAIPipelineStage, runAIPipeline,
    // Bus
    busPublish, busSubscribe, getBusLog, getBusStats,
    // Safety
    triggerEStop, resetEStop, isEStopActive, runSafetyChecks,
    // Watchdog
    feedWatchdog,
  };
})();
window.RTOS = RTOS;
