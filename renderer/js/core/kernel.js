/**
 * RoboticOS Kernel (userspace)
 * Process table, event bus, VFS, IPC, notifications
 */
const Kernel = (() => {
  'use strict';
  let _pid = 0;
  const _procs = new Map();
  const _listeners = new Map();
  const _notifs = [];

  function spawn(name, appDef) {
    const pid = ++_pid;
    const proc = { pid, name, app: appDef, state: 'running', createdAt: Date.now() };
    _procs.set(pid, proc);
    emit('proc:spawn', proc);
    return proc;
  }

  function kill(pid) {
    const proc = _procs.get(pid);
    if (!proc) return false;
    proc.state = 'dead';
    emit('proc:kill', proc);
    _procs.delete(pid);
    return true;
  }

  function getProcs() { return [..._procs.values()]; }
  function getProc(pid) { return _procs.get(pid) || null; }

  function on(event, cb) {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(cb);
    return () => off(event, cb);
  }

  function off(event, cb) { _listeners.get(event)?.delete(cb); }

  function emit(event, data) {
    _listeners.get(event)?.forEach(cb => { try { cb(data); } catch(e) { console.error('[kernel]', e); } });
    _listeners.get('*')?.forEach(cb => { try { cb({ event, data }); } catch(e) {} });
  }

  const VFS = {
    async readdir(path)         { return roboOS.fs.readdir(path); },
    async readfile(path)        { return roboOS.fs.readfile(path); },
    async writefile(path, data) { return roboOS.fs.writefile(path, data); },
    async mkdir(path)           { return roboOS.fs.mkdir(path); },
    async delete(path)          { return roboOS.fs.delete(path); },
    async stat(path)            { return roboOS.fs.stat(path); },
  };

  function notify(title, body, icon = '🔔', type = 'info') {
    const n = { id: Date.now(), title, body, icon, type };
    _notifs.push(n);
    emit('notify', n);
    setTimeout(() => dismissNotify(n.id), 6000);
    return n.id;
  }

  function dismissNotify(id) {
    const idx = _notifs.findIndex(n => n.id === id);
    if (idx !== -1) _notifs.splice(idx, 1);
    emit('notify:dismiss', id);
  }

  const Settings = {
    get(key, def) {
      try { const v = localStorage.getItem(`rtos:${key}`); return v === null ? def : JSON.parse(v); }
      catch { return def; }
    },
    set(key, val) {
      localStorage.setItem(`rtos:${key}`, JSON.stringify(val));
      emit('settings:change', { key, val });
    },
  };

  return { spawn, kill, getProcs, getProc, on, off, emit, VFS, notify, dismissNotify, Settings };
})();
window.Kernel = Kernel;
