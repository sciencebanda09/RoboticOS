/**
 * RoboticOS Window Manager
 */
const WM = (() => {
  'use strict';
  const layer = () => document.getElementById('wm-layer');
  let _zTop = 100;
  const _windows = new Map();

  function create({ id, title, icon = '⬡', width = 700, height = 500, x, y, content = '' }) {
    if (_windows.has(id)) { focus(id); return; }
    const surface = document.getElementById('desktop-surface');
    const sw = surface.clientWidth, sh = surface.clientHeight;
    const wx = x !== undefined ? x : Math.max(20, Math.round((sw - width) / 2) + _jitter());
    const wy = y !== undefined ? y : Math.max(20, Math.round((sh - height) / 2) + _jitter());

    const win = document.createElement('div');
    win.className = 'app-window';
    win.id = `win-${id}`;
    win.style.cssText = `width:${width}px;height:${height}px;left:${wx}px;top:${wy}px;z-index:${++_zTop}`;

    win.innerHTML = `
      <div class="win-titlebar" data-win="${id}">
        <span class="win-icon">${icon}</span>
        <span class="win-title">${title}</span>
        <div class="win-controls">
          <button class="win-btn win-min" title="Minimize" onclick="WM.minimize('${id}')">─</button>
          <button class="win-btn win-max" title="Maximize" onclick="WM.toggleMax('${id}')">□</button>
          <button class="win-btn win-close" title="Close"    onclick="WM.close('${id}')">✕</button>
        </div>
      </div>
      <div class="win-content" id="content-${id}">${content}</div>
      <div class="win-resize" data-win="${id}"></div>
    `;

    layer().appendChild(win);
    _windows.set(id, { el: win, state: 'normal', id, title, icon });
    _initDrag(win, win.querySelector('.win-titlebar'));
    _initResize(win, win.querySelector('.win-resize'));
    win.addEventListener('mousedown', () => focus(id), true);
    focus(id);
    return win;
  }

  function focus(id) {
    _windows.forEach((w, wid) => w.el.classList.toggle('focused', wid === id));
    const w = _windows.get(id);
    if (w) w.el.style.zIndex = ++_zTop;
    Kernel.emit('wm:focus', id);
  }

  function minimize(id) {
    const w = _windows.get(id);
    if (!w) return;
    w.state = w.state === 'minimized' ? 'normal' : 'minimized';
    w.el.classList.toggle('minimized', w.state === 'minimized');
    Kernel.emit('wm:minimize', { id, state: w.state });
  }

  function toggleMax(id) {
    const w = _windows.get(id);
    if (!w) return;
    if (w.state === 'maximized') {
      w.el.style.cssText = w._savedStyle;
      w.el.classList.remove('maximized');
      w.state = 'normal';
    } else {
      w._savedStyle = w.el.style.cssText;
      w.el.classList.add('maximized');
      w.state = 'maximized';
    }
    Kernel.emit('wm:maximize', { id, state: w.state });
  }

  function close(id) {
    const w = _windows.get(id);
    if (!w) return;
    w.el.style.transition = 'opacity 0.15s, transform 0.15s';
    w.el.style.opacity = '0';
    w.el.style.transform = 'scale(0.95)';
    setTimeout(() => {
      w.el.remove();
      _windows.delete(id);
      Kernel.emit('wm:close', id);
    }, 150);
  }

  function getWindows() { return new Map(_windows); }
  function getWindow(id) { return _windows.get(id) || null; }
  function isOpen(id)   { return _windows.has(id); }

  function _initDrag(win, handle) {
    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const w = _windows.get(win.id.slice(4));
      if (w?.state === 'maximized') return;
      dragging = true; ox = e.clientX - win.offsetLeft; oy = e.clientY - win.offsetTop;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const surface = document.getElementById('desktop-surface');
      const maxX = surface.clientWidth - 60, maxY = surface.clientHeight - 30;
      win.style.left = `${Math.min(maxX, Math.max(-win.offsetWidth + 60, e.clientX - ox))}px`;
      win.style.top  = `${Math.min(maxY, Math.max(0, e.clientY - oy))}px`;
    });
    document.addEventListener('mouseup', () => { dragging = false; });
    handle.addEventListener('dblclick', () => toggleMax(win.id.slice(4)));
  }

  function _initResize(win, handle) {
    let resizing = false, startX, startY, startW, startH;
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      resizing = true; startX = e.clientX; startY = e.clientY;
      startW = win.offsetWidth; startH = win.offsetHeight;
      e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      win.style.width  = `${Math.max(380, startW + (e.clientX - startX))}px`;
      win.style.height = `${Math.max(260, startH + (e.clientY - startY))}px`;
    });
    document.addEventListener('mouseup', () => { resizing = false; });
  }

  function _jitter() { return (Math.random() - 0.5) * 60 | 0; }

  return { create, focus, minimize, toggleMax, close, getWindows, getWindow, isOpen };
})();
window.WM = WM;
