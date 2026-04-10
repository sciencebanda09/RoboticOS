/**
 * RoboticOS — Navigation Map (2D occupancy grid)
 */
const MapApp = (() => {
  'use strict';
  let _intervals = {};
  let _animFrames = {};

  async function launch(pid) {
    const id = `map-${pid}`;
    const content = `
      <div class="map-wrap" id="mapw-${pid}">
        <div class="map-canvas-wrap" style="flex:1">
          <canvas id="map-canvas-${pid}"></canvas>
          <div class="map-hud">
            <div class="map-hud-val" id="map-pos-${pid}">POS: --, --</div>
            <div class="map-hud-val" id="map-hdg-${pid}">HDG: --°</div>
            <div class="map-hud-val" id="map-obs-${pid}">OBS: --</div>
          </div>
        </div>
        <div class="map-toolbar">
          <button class="btn primary" onclick="MapApp._clearPath(${pid})">✕ Clear Path</button>
          <button class="btn" onclick="MapApp._addWaypoint(${pid})">📍 Add Waypoint</button>
          <button class="btn" onclick="MapApp._zoomIn(${pid})">＋ Zoom</button>
          <button class="btn" onclick="MapApp._zoomOut(${pid})">－ Zoom</button>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--text2);margin-left:auto" id="map-scale-${pid}">SCALE: 1m/cell</span>
        </div>
      </div>
    `;

    WM.create({ id, title: 'NAVIGATION MAP', icon: '🗺️', width: 720, height: 540, content });
    await nextFrame();

    const canvas = document.getElementById(`map-canvas-${pid}`);
    if (canvas) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    const state = { zoom: 1, path: [], waypoints: [], robotX: 0, robotY: 0, robotYaw: 0 };
    MapApp._states = MapApp._states || {};
    MapApp._states[pid] = state;

    _startMap(pid, canvas, state);
    Kernel.on('wm:close', (cid) => {
      if (cid === id) {
        clearInterval(_intervals[pid]);
        cancelAnimationFrame(_animFrames[pid]);
        delete _intervals[pid];
        delete _animFrames[pid];
        if (MapApp._states) delete MapApp._states[pid];
      }
    });
  }

  function _startMap(pid, canvas, state) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const CELL = 24;

    // Generate some random obstacles
    const obstacles = Array.from({ length: 40 }, () => ({
      x: Math.floor((Math.random() - 0.5) * 20),
      y: Math.floor((Math.random() - 0.5) * 16),
    }));

    let frame = 0;

    async function draw() {
      frame++;
      try {
        const s = await roboOS.robot.getSensorData();
        const gps = s.gps;
        const imu = s.imu;
        // Convert GPS to local grid (very simplified)
        state.robotX += (Math.sin(parseFloat(imu.yaw) * Math.PI / 180) * 0.02);
        state.robotY += (Math.cos(parseFloat(imu.yaw) * Math.PI / 180) * 0.02);
        state.robotYaw = parseFloat(imu.yaw);
        state.path.push({ x: state.robotX, y: state.robotY });
        if (state.path.length > 200) state.path.shift();

        // Update HUD
        _s(`map-pos-${pid}`, `POS: ${gps.lat}, ${gps.lon}`);
        _s(`map-hdg-${pid}`, `HDG: ${imu.yaw}°`);
        _s(`map-obs-${pid}`, `OBS: ${s.lidar.obstacleCount}`);
      } catch(e) {}

      ctx.fillStyle = '#040810';
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(0,212,255,0.06)';
      ctx.lineWidth = 0.5;
      const gridStep = CELL * state.zoom;
      for (let x = cx % gridStep; x < W; x += gridStep) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = cy % gridStep; y < H; y += gridStep) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

      // Axes
      ctx.strokeStyle = 'rgba(0,212,255,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

      // Obstacles
      obstacles.forEach(o => {
        const px = cx + o.x * gridStep, py = cy + o.y * gridStep;
        ctx.fillStyle = 'rgba(255,34,68,0.25)';
        ctx.fillRect(px - gridStep/2, py - gridStep/2, gridStep, gridStep);
        ctx.strokeStyle = 'rgba(255,34,68,0.5)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px - gridStep/2, py - gridStep/2, gridStep, gridStep);
      });

      // Path trail
      if (state.path.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,255,157,0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3,3]);
        state.path.forEach((p, i) => {
          const px = cx + p.x * gridStep, py = cy + p.y * gridStep;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Waypoints
      state.waypoints.forEach((w, i) => {
        const px = cx + w.x * gridStep, py = cy + w.y * gridStep;
        ctx.fillStyle = 'rgba(255,107,0,0.8)';
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'var(--text0)'; ctx.font = '10px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText(`W${i+1}`, px, py - 8);
      });

      // LiDAR cone
      const rx = cx + state.robotX * gridStep;
      const ry = cy + state.robotY * gridStep;
      const rYaw = state.robotYaw * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.arc(rx, ry, gridStep * 3, rYaw - 0.4, rYaw + 0.4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,212,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,212,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Robot body
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rYaw);
      ctx.fillStyle = 'rgba(0,212,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(8, 8); ctx.lineTo(-8, 8); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();

      // Pulse ring around robot
      const pulse = (frame % 60) / 60;
      ctx.beginPath();
      ctx.arc(rx, ry, 14 + pulse * 20, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,212,255,${0.4 * (1 - pulse)})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      _animFrames[pid] = requestAnimationFrame(draw);
    }
    draw();
  }

  function _clearPath(pid) { if (MapApp._states?.[pid]) MapApp._states[pid].path = []; }
  function _zoomIn(pid)  { if (MapApp._states?.[pid]) MapApp._states[pid].zoom = Math.min(3, MapApp._states[pid].zoom * 1.2); }
  function _zoomOut(pid) { if (MapApp._states?.[pid]) MapApp._states[pid].zoom = Math.max(0.3, MapApp._states[pid].zoom * 0.8); }

  function _addWaypoint(pid) {
    const state = MapApp._states?.[pid];
    if (!state) return;
    state.waypoints.push({ x: (Math.random()-0.5)*10, y: (Math.random()-0.5)*8 });
    Kernel.notify('Map', `Waypoint W${state.waypoints.length} added`, '📍');
  }

  function _s(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
  function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }
  return { launch, _clearPath, _zoomIn, _zoomOut, _addWaypoint, _states: {} };
})();
window.MapApp = MapApp;
