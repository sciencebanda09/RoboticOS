/**
 * RoboticOS — Terminal App
 */
const TerminalApp = (() => {
  'use strict';

  async function launch(pid) {
    const id = `terminal-${pid}`;
    let cwd = '~';
    let history = []; let histIdx = -1;

    const content = `
      <div class="terminal-wrap" id="tw-${pid}">
        <div class="terminal-output" id="to-${pid}"></div>
        <div class="terminal-input-row">
          <span class="terminal-prompt" id="tp-${pid}">RTOS:~ $ </span>
          <input class="terminal-input" id="ti-${pid}" autocomplete="off" spellcheck="false" autofocus/>
        </div>
      </div>
    `;

    WM.create({ id, title: 'TERMINAL', icon: '⌨️', width: 720, height: 480, content });
    await nextFrame();

    const out  = document.getElementById(`to-${pid}`);
    const inp  = document.getElementById(`ti-${pid}`);
    const prom = document.getElementById(`tp-${pid}`);

    const sysInfo = await roboOS.sys.info();
    print(`<span class="t-info">RoboticOS Terminal v1.0</span>`);
    print(`<span class="t-ok">Node: ${sysInfo.hostname} | User: ${sysInfo.username} | Arch: ${sysInfo.arch}</span>`);
    print(`Type <span class="t-info">help</span> for commands, <span class="t-info">robot</span> for robotics commands.\n`);

    inp.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const cmd = inp.value.trim(); inp.value = '';
        if (cmd) { history.unshift(cmd); histIdx = -1; }
        print(`<span class="t-cmd">${esc(prom.textContent)}${esc(cmd)}</span>`);
        if (cmd) await run(cmd);
      } else if (e.key === 'ArrowUp') { if (histIdx < history.length-1) histIdx++; inp.value = history[histIdx]||''; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (histIdx > 0) histIdx--; inp.value = history[histIdx]||''; e.preventDefault(); }
    });

    inp.focus();

    function print(html) {
      const line = document.createElement('div');
      line.innerHTML = html;
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    }

    async function run(raw) {
      const parts = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g).map(p => p.replace(/^['"]|['"]$/g,''));
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      switch(cmd) {
        case 'help':
          print('<span class="t-info">General commands:</span> ls, cd, cat, pwd, mkdir, rm, clear, date, history');
          print('<span class="t-info">Robot commands:</span>   robot, sensors, actuators, safety, tasks, bus, estop, status');
          break;
        case 'robot':
          print('<span class="t-info">robot [command]</span>');
          print('  <span class="t-ok">robot status</span>    — system overview');
          print('  <span class="t-ok">robot sensors</span>   — all sensor readings');
          print('  <span class="t-ok">robot actuators</span> — actuator status');
          print('  <span class="t-ok">robot tasks</span>     — task queue');
          print('  <span class="t-ok">robot bus</span>       — comm bus nodes');
          print('  <span class="t-ok">robot estop</span>     — trigger emergency stop');
          print('  <span class="t-ok">robot reset</span>     — reset after estop');
          print('  <span class="t-ok">robot log [n]</span>   — show mission log');
          break;
        case 'sensors': case 'sensor': {
          const s = await roboOS.robot.getSensorData();
          print('<span class="t-info">── SENSOR SNAPSHOT ──</span>');
          print(`IMU:  roll=${s.imu.roll}° pitch=${s.imu.pitch}° yaw=${s.imu.yaw}°`);
          print(`GPS:  ${s.gps.lat}, ${s.gps.lon} @ ${s.gps.alt}m [${s.gps.fix}]`);
          print(`BAT:  ${s.battery.soc}% SOC  ${s.battery.voltage}V  ${s.battery.current}A`);
          print(`TEMP: CPU=${s.temperature.cpu}°C Motor1=${s.temperature.motor1}°C`);
          print(`US:   F=${s.ultrasonic.front}m R=${s.ultrasonic.rear}m L=${s.ultrasonic.left}m R=${s.ultrasonic.right}m`);
          print(`LIDAR: ${s.lidar.points.toLocaleString()} pts | ${s.lidar.obstacleCount} obstacles`);
          break;
        }
        case 'actuators': case 'actuator': {
          const a = await roboOS.robot.getActuatorStatus();
          print('<span class="t-info">── ACTUATOR STATUS ──</span>');
          a.motors.forEach(m => print(`Motor ${m.id}: ${m.rpm} RPM  ${m.torque}Nm  ${m.temp}°C  ${m.current}A`));
          a.servos.forEach(s => print(`Servo ${s.id}: ${s.angle}°  load=${s.load}%`));
          break;
        }
        case 'tasks': case 'task': {
          const { tasks } = await roboOS.robot.getTaskQueue();
          print('<span class="t-info">── TASK QUEUE ──</span>');
          tasks.forEach(t => print(`[P${t.priority}] ${t.name.padEnd(25)} ${t.status.toUpperCase().padEnd(10)} ${t.progress}%`));
          break;
        }
        case 'bus': {
          const b = await roboOS.robot.getNetworkBus();
          print('<span class="t-info">── COMM BUS ──</span>');
          b.nodes.forEach(n => print(`${n.id.padEnd(20)} ${n.type.padEnd(12)} ${n.ip.padEnd(16)} ${n.status.toUpperCase().padEnd(8)} ${n.latency}ms`));
          break;
        }
        case 'estop':
          RTOS.triggerEStop(`Manual — Terminal (${new Date().toLocaleTimeString()})`);
          print('<span class="t-err">⛔ EMERGENCY STOP TRIGGERED</span>');
          break;
        case 'reset':
          RTOS.resetEStop();
          print('<span class="t-ok">✓ E-STOP reset. System resuming.</span>');
          break;
        case 'status': {
          const s = await roboOS.robot.getSensorData();
          const safe = await roboOS.robot.getSafetyStatus();
          print('<span class="t-info">── SYSTEM STATUS ──</span>');
          print(`E-Stop:   ${RTOS.isEStopActive() ? '<span class="t-err">ACTIVE</span>' : '<span class="t-ok">CLEAR</span>'}`);
          print(`Battery:  ${s.battery.soc}% SOC`);
          print(`CPU Temp: ${s.temperature.cpu}°C`);
          print(`Heading:  ${s.imu.yaw}°`);
          print(`GPS Fix:  ${s.gps.fix} (${s.gps.satellites} sats)`);
          break;
        }
        case 'log': {
          const { lines } = await roboOS.robot.getMissionLog();
          const n = parseInt(args[0]) || 20;
          lines.slice(-n).forEach(l => print(esc(l)));
          break;
        }
        case 'ls': {
          const path = args[0] || cwd;
          const entries = await Kernel.VFS.readdir(path);
          if (entries.error) { print(`<span class="t-err">ls: ${entries.error}</span>`); break; }
          for (let i = 0; i < entries.length; i += 3) {
            print(entries.slice(i,i+3).map(e =>
              `<span style="display:inline-block;min-width:180px">${e.isDirectory?'📁':'📄'} <span class="${e.isDirectory?'t-info':''}">${e.name}</span></span>`
            ).join(''));
          }
          break;
        }
        case 'cd': {
          const target = args[0] || '~';
          const resolved = target.startsWith('/')||target==='~' ? target : `${cwd}/${target}`;
          const stat = await Kernel.VFS.stat(resolved);
          if (stat.error) { print(`<span class="t-err">cd: ${stat.error}</span>`); break; }
          cwd = resolved; prom.textContent = `RTOS:${cwd} $ `;
          break;
        }
        case 'cat': {
          if (!args[0]) { print('<span class="t-err">cat: missing file</span>'); break; }
          const content = await Kernel.VFS.readfile(args[0].startsWith('/')||args[0].startsWith('~')?args[0]:`${cwd}/${args[0]}`);
          if (content?.error) { print(`<span class="t-err">cat: ${content.error}</span>`); break; }
          content.split('\n').slice(0,200).forEach(l => print(esc(l)));
          break;
        }
        case 'pwd': print(cwd); break;
        case 'clear': out.innerHTML = ''; break;
        case 'date': print(new Date().toString()); break;
        case 'history': history.forEach((h,i) => print(`${String(i+1).padStart(3)}  ${esc(h)}`)); break;
        case 'mkdir': {
          const r = await Kernel.VFS.mkdir(args[0].startsWith('/')?args[0]:`${cwd}/${args[0]}`);
          if (r?.error) print(`<span class="t-err">mkdir: ${r.error}</span>`);
          else print(`<span class="t-ok">✓ Created</span>`);
          break;
        }
        case 'rm': {
          const r = await Kernel.VFS.delete(args[0]);
          if (r?.error) print(`<span class="t-err">rm: ${r.error}</span>`);
          else print(`<span class="t-ok">✓ Deleted</span>`);
          break;
        }
        default: print(`<span class="t-err">command not found: ${esc(cmd)}</span>`);
      }
    }
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }
  return { launch };
})();
window.TerminalApp = TerminalApp;
