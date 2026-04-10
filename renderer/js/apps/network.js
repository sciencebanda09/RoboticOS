/**
 * RoboticOS — Communication Bus Monitor
 */
const NetworkApp = (() => {
  'use strict';
  let _intervals = {};
  let _animFrames = {};

  async function launch(pid) {
    const id = `network-${pid}`;
    const content = `
      <div class="network-wrap" id="netw-${pid}">
        <div class="bus-canvas-wrap" style="height:280px">
          <canvas id="net-canvas-${pid}"></canvas>
          <div class="map-hud">
            <div class="map-hud-val" id="net-proto-${pid}">ROS2/DDS</div>
            <div class="map-hud-val" id="net-msgs-${pid}">0 msg/s</div>
            <div class="map-hud-val" id="net-latency-${pid}">-- ms</div>
          </div>
        </div>
        <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;gap:8px">
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text2)">
            RX: <span id="net-rx-${pid}" style="color:var(--ok)">-- MB/s</span>
          </div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text2)">
            TX: <span id="net-tx-${pid}" style="color:var(--accent)">-- MB/s</span>
          </div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text2);margin-left:auto">
            Topics: <span id="net-topics-${pid}" style="color:var(--accent)">--</span>
          </div>
        </div>
        <div class="node-list" style="flex:1;overflow:auto" id="net-nodes-${pid}"></div>
        <div style="padding:8px;border-top:1px solid var(--border)">
          <div class="sec-header" style="margin-bottom:6px">BUS LOG (last 10)</div>
          <div id="net-buslog-${pid}" style="font-family:var(--font-mono);font-size:10px;color:var(--text2);max-height:80px;overflow:auto"></div>
        </div>
      </div>
    `;

    WM.create({ id, title: 'COMM BUS', icon: '🌐', width: 680, height: 580, content });
    await nextFrame();

    const canvas = document.getElementById(`net-canvas-${pid}`);
    if (canvas) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      _animateNetwork(pid, canvas);
    }

    _startUpdates(pid);
    Kernel.on('wm:close', (cid) => {
      if (cid === id) {
        clearInterval(_intervals[pid]);
        cancelAnimationFrame(_animFrames[pid]);
        delete _intervals[pid];
        delete _animFrames[pid];
      }
    });
  }

  async function _animateNetwork(pid, canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    const bus = await roboOS.robot.getNetworkBus();
    const nodes = bus.nodes;
    // Layout nodes in a ring + center
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) * 0.35;
    const positioned = nodes.map((n, i) => {
      const angle = (i / (nodes.length - 1)) * Math.PI * 2 - Math.PI / 2;
      const isMaster = n.id === 'master';
      return { ...n, x: isMaster ? cx : cx + Math.cos(angle) * r, y: isMaster ? cy : cy + Math.sin(angle) * r };
    });

    let frame = 0;

    function draw() {
      frame++;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#030508';
      ctx.fillRect(0, 0, W, H);

      // Edges
      positioned.forEach(n => {
        if (n.id === 'master') return;
        const master = positioned.find(p => p.id === 'master');
        const t = (frame * 0.02 + n.x * 0.001) % 1;
        ctx.strokeStyle = n.status === 'online' ? 'rgba(0,212,255,0.15)' : 'rgba(255,34,68,0.15)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(master.x, master.y); ctx.lineTo(n.x, n.y); ctx.stroke();

        // Packet animation
        const px = master.x + (n.x - master.x) * t;
        const py = master.y + (n.y - master.y) * t;
        ctx.fillStyle = n.status === 'online' ? 'rgba(0,255,157,0.8)' : 'rgba(255,184,0,0.8)';
        ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
      });

      // Nodes
      positioned.forEach(n => {
        const color = n.status === 'online' ? '#00d4ff' : n.status === 'warning' ? '#ffb800' : '#ff2244';
        const typeIcon = { controller: '⬡', actuator: '⚙', sensor: '◈', compute: '▣', system: '◉' }[n.type] || '○';

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.id === 'master' ? 22 : 14, 0, Math.PI * 2);
        ctx.fillStyle = n.id === 'master' ? 'rgba(0,212,255,0.1)' : 'rgba(3,5,8,0.9)';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = n.id === 'master' ? 2 : 1;
        ctx.stroke();

        if (n.status === 'online') {
          const pulse = Math.abs(Math.sin(frame * 0.05 + n.x * 0.01));
          ctx.beginPath();
          ctx.arc(n.x, n.y, (n.id === 'master' ? 22 : 14) + pulse * 6, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0,212,255,${pulse * 0.2})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.fillStyle = color;
        ctx.font = `${n.id === 'master' ? 16 : 11}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typeIcon, n.x, n.y);

        ctx.fillStyle = 'rgba(200,220,240,0.7)';
        ctx.font = `10px "Share Tech Mono"`;
        ctx.fillText(n.id, n.x, n.y + (n.id === 'master' ? 30 : 22));
      });

      _animFrames[pid] = requestAnimationFrame(draw);
    }
    draw();
  }

  function _startUpdates(pid) {
    const update = async () => {
      try {
        const bus = await roboOS.robot.getNetworkBus();
        const stats = RTOS.getBusStats();

        _s(`net-rx-${pid}`, `${bus.bandwidth.rx} MB/s`);
        _s(`net-tx-${pid}`, `${bus.bandwidth.tx} MB/s`);
        _s(`net-topics-${pid}`, stats.topicCount);
        _s(`net-msgs-${pid}`, `${stats.messageCount} msgs`);

        const nodesEl = document.getElementById(`net-nodes-${pid}`);
        if (nodesEl) {
          nodesEl.innerHTML = bus.nodes.map(n => `
            <div class="node-row">
              <div class="node-dot ${n.status}"></div>
              <span style="color:var(--accent);min-width:100px">${n.id}</span>
              <span style="color:var(--text2);min-width:70px">${n.type}</span>
              <span style="color:var(--text1)">${n.ip}</span>
              <span style="color:var(--text2);margin-left:auto">${n.latency}ms</span>
              <span class="pill ${n.status === 'online' ? 'ok' : n.status === 'warning' ? 'warn' : 'danger'}" style="margin-left:8px">${n.status.toUpperCase()}</span>
            </div>
          `).join('');
        }

        const busLog = RTOS.getBusLog(10);
        const logEl = document.getElementById(`net-buslog-${pid}`);
        if (logEl) {
          logEl.innerHTML = busLog.map(m => `
            <div style="padding:1px 0;border-bottom:1px solid rgba(0,212,255,0.03)">
              <span style="color:var(--text3)">${new Date(m.ts).toLocaleTimeString()}</span>
              <span style="color:var(--accent);margin:0 6px">${m.topic}</span>
              <span style="color:var(--text2)">${m.size}B</span>
            </div>
          `).join('');
        }
      } catch(e) {}
    };
    update();
    _intervals[pid] = setInterval(update, 1000);
  }

  function _s(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
  function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }
  return { launch };
})();
window.NetworkApp = NetworkApp;
