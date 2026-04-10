/**
 * RoboticOS Preload — Secure Context Bridge
 * Exposes robotics kernel API to the renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('roboOS', {
  // ── File System ──────────────────────────────────────────────────────────
  fs: {
    readdir:   (p)    => ipcRenderer.invoke('fs:readdir', p),
    readfile:  (p)    => ipcRenderer.invoke('fs:readfile', p),
    writefile: (p, c) => ipcRenderer.invoke('fs:writefile', p, c),
    mkdir:     (p)    => ipcRenderer.invoke('fs:mkdir', p),
    delete:    (p)    => ipcRenderer.invoke('fs:delete', p),
    stat:      (p)    => ipcRenderer.invoke('fs:stat', p),
  },

  // ── System ───────────────────────────────────────────────────────────────
  sys: {
    info:    () => ipcRenderer.invoke('sys:info'),
    meminfo: () => ipcRenderer.invoke('sys:meminfo'),
  },

  // ── Robotics Subsystems ──────────────────────────────────────────────────
  robot: {
    getSensorData:    ()      => ipcRenderer.invoke('robot:getSensorData'),
    getActuatorStatus:()      => ipcRenderer.invoke('robot:getActuatorStatus'),
    sendCommand:      (cmd)   => ipcRenderer.invoke('robot:sendCommand', cmd),
    getTaskQueue:     ()      => ipcRenderer.invoke('robot:getTaskQueue'),
    getMissionLog:    ()      => ipcRenderer.invoke('robot:getMissionLog'),
    writeMissionLog:  (line)  => ipcRenderer.invoke('robot:writeMissionLog', line),
    getSafetyStatus:  ()      => ipcRenderer.invoke('robot:getSafetyStatus'),
    triggerEStop:     (reason)=> ipcRenderer.invoke('robot:triggerEStop', reason),
    getNetworkBus:    ()      => ipcRenderer.invoke('robot:getNetworkBus'),
  },

  // ── Window Controls ──────────────────────────────────────────────────────
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close:    () => ipcRenderer.send('win:close'),
  },

  // ── Shell / Dialog ───────────────────────────────────────────────────────
  shell: { openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url) },
  dialog: { openFile: () => ipcRenderer.invoke('dialog:openFile') },
});
