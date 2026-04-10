/**
 * RoboticOS Wallpaper Engine
 * Animated circuit-board / radar sweep / neural net themes
 */
const Wallpaper = (() => {
  'use strict';
  let canvas, ctx, animId, frame = 0;
  const THEMES = ['circuit', 'radar', 'neural'];

  function init() {
    canvas = document.getElementById('wallpaper');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', () => { resize(); });
    start();
  }

  function resize() {
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  let _circuitLines = null;

  function buildCircuit(W, H) {
    const lines = [];
    const step = 32;
    for (let x = 0; x < W; x += step) {
      for (let y = 0; y < H; y += step) {
        if (Math.random() > 0.5) {
          lines.push({ x1: x, y1: y, x2: x + step * (Math.random() > 0.5 ? 1 : 0), y2: y + step * (Math.random() > 0.5 ? 0 : 1) });
        }
      }
    }
    return lines;
  }

  let _radarAngle = 0;
  let _neuralNodes = null;

  function buildNeural(W, H) {
    const nodes = Array.from({ length: 40 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: 2 + Math.random() * 3,
    }));
    return nodes;
  }

  function start() {
    if (animId) cancelAnimationFrame(animId);
    const W = canvas.width, H = canvas.height;
    if (!_circuitLines) _circuitLines = buildCircuit(W, H);
    if (!_neuralNodes) _neuralNodes = buildNeural(W, H);

    function loop() {
      frame++;
      const theme = Kernel.Settings.get('wallpaper', 0);
      if      (theme === 0) drawCircuit(W, H);
      else if (theme === 1) drawRadar(W, H);
      else                  drawNeural(W, H);
      animId = requestAnimationFrame(loop);
    }
    animId = requestAnimationFrame(loop);
  }

  // ── Circuit Board ─────────────────────────────────────────────────────────
  function drawCircuit(W, H) {
    if (frame === 1) {
      ctx.fillStyle = '#030508';
      ctx.fillRect(0, 0, W, H);
      // Grid
      ctx.strokeStyle = 'rgba(0,212,255,0.04)';
      ctx.lineWidth = 0.5;
      const step = 32;
      for (let x = 0; x <= W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // Circuit lines
      ctx.strokeStyle = 'rgba(0,212,255,0.06)';
      ctx.lineWidth = 1;
      for (const l of _circuitLines) {
        ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
        ctx.fillStyle = 'rgba(0,212,255,0.12)';
        ctx.beginPath(); ctx.arc(l.x1, l.y1, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Traveling signals
    ctx.fillStyle = 'rgba(3,5,8,0.04)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,212,255,0.8)';
    for (let i = 0; i < 3; i++) {
      const t = (frame * 0.8 + i * 137) % _circuitLines.length;
      const l = _circuitLines[t | 0];
      const frac = (frame * 0.03 + i * 0.33) % 1;
      const sx = l.x1 + (l.x2 - l.x1) * frac;
      const sy = l.y1 + (l.y2 - l.y1) * frac;
      ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Radar Sweep ───────────────────────────────────────────────────────────
  let _radarBlips = [];
  function drawRadar(W, H) {
    const cx = W / 2, cy = H / 2;
    const maxR = Math.min(W, H) * 0.45;
    _radarAngle += 0.008;

    ctx.fillStyle = 'rgba(3,5,8,0.3)';
    ctx.fillRect(0, 0, W, H);

    // Rings
    ctx.strokeStyle = 'rgba(0,212,255,0.1)';
    ctx.lineWidth = 0.5;
    for (let r = maxR / 4; r <= maxR; r += maxR / 4) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    // Cross-hairs
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke();

    // Sweep
    const grad = ctx.createConicalGradient ? null : null;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(_radarAngle);
    const sweepGrad = ctx.createLinearGradient(0, 0, maxR, 0);
    sweepGrad.addColorStop(0, 'rgba(0,255,157,0.5)');
    sweepGrad.addColorStop(1, 'rgba(0,255,157,0)');
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, maxR, -0.25, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Spawn blips
    if (Math.random() > 0.97) {
      const angle = _radarAngle + Math.PI * (Math.random() * 0.2 - 0.1);
      const dist = (0.3 + Math.random() * 0.6) * maxR;
      _radarBlips.push({ x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, age: 0, max: 80 });
    }

    // Draw & age blips
    _radarBlips = _radarBlips.filter(b => b.age < b.max);
    for (const b of _radarBlips) {
      const alpha = 1 - b.age / b.max;
      ctx.fillStyle = `rgba(0,255,157,${alpha * 0.8})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
      b.age++;
    }

    // Center dot
    ctx.fillStyle = 'rgba(0,212,255,0.6)';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  }

  // ── Neural Net ────────────────────────────────────────────────────────────
  function drawNeural(W, H) {
    ctx.fillStyle = 'rgba(3,5,8,0.15)';
    ctx.fillRect(0, 0, W, H);
    const nodes = _neuralNodes;
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
    }
    // Edges
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 150) {
          const alpha = (1 - dist / 150) * 0.15;
          ctx.strokeStyle = `rgba(0,212,255,${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
        }
      }
    }
    // Nodes
    for (const n of nodes) {
      const pulse = 0.5 + 0.5 * Math.sin(frame * 0.02 + n.x * 0.01);
      ctx.fillStyle = `rgba(0,212,255,${0.15 + pulse * 0.25})`;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function setTheme(n) { Kernel.Settings.set('wallpaper', n); }

  return { init, setTheme, THEMES };
})();
window.Wallpaper = Wallpaper;
