/**
 * RoboticOS — Config Editor
 */
const ConfigApp = (() => {
  'use strict';

  async function launch(pid) {
    const id = `config-${pid}`;
    const content = `
      <div class="config-wrap" id="configw-${pid}">
        <div class="config-sidebar">
          <div class="sec-header" style="padding:10px 12px;font-size:10px">CONFIG</div>
          ${['Robot','Safety','Sensors','Actuators','Network','AI / Tasks','About'].map((t,i) =>
            `<div class="config-nav-item${i===0?' active':''}" onclick="ConfigApp._tab(${pid},'${t.toLowerCase().replace(/ \/ /g,'_').replace(/ /g,'')}',this)">${t}</div>`
          ).join('')}
        </div>
        <div class="config-content" id="config-content-${pid}">
          ${_renderRobot()}
        </div>
      </div>
    `;
    WM.create({ id, title: 'CONFIG EDITOR', icon: '🔧', width: 660, height: 500, content });
    await nextFrame();
  }

  function _tab(pid, tab, el) {
    document.querySelectorAll(`#configw-${pid} .config-nav-item`).forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    const content = document.getElementById(`config-content-${pid}`);
    if (!content) return;
    const map = {
      robot: _renderRobot, safety: _renderSafety, sensors: _renderSensors,
      actuators: _renderActuators, network: _renderNetwork, ai_tasks: _renderAI, about: _renderAbout,
    };
    content.innerHTML = (map[tab] || _renderRobot)();
  }

  function _row(label, desc, input) {
    return `<div class="config-row">
      <div><div class="config-label">${label}</div><div class="config-desc">${desc}</div></div>
      <div>${input}</div>
    </div>`;
  }

  function _toggle(key, defaultVal, label) {
    const checked = Kernel.Settings.get(key, defaultVal) ? 'checked' : '';
    return `<label class="toggle"><input type="checkbox" ${checked} onchange="Kernel.Settings.set('${key}',this.checked)"><div class="toggle-track"></div><div class="toggle-knob"></div></label>`;
  }

  function _input(key, def, type='text') {
    const val = Kernel.Settings.get(key, def);
    return `<input class="config-input" type="${type}" value="${val}" onchange="Kernel.Settings.set('${key}',this.value)" style="width:140px"/>`;
  }

  function _select(key, def, options) {
    const val = Kernel.Settings.get(key, def);
    const opts = options.map(([v,l]) => `<option value="${v}" ${val==v?'selected':''}>${l}</option>`).join('');
    return `<select class="config-input" onchange="Kernel.Settings.set('${key}',this.value)">${opts}</select>`;
  }

  function _renderRobot() {
    return `
      <div class="config-section">
        <h3>ROBOT IDENTITY</h3>
        ${_row('Robot Name','Identifier for this unit',_input('robot.name','AROS-1'))}
        ${_row('Robot Type','Platform type',_select('robot.type','differential',[['differential','Differential Drive'],['holonomic','Holonomic'],['arm','Manipulator'],['quadruped','Quadruped']]))}
        ${_row('DOF','Degrees of freedom',_input('robot.dof','6','number'))}
        ${_row('Max Speed','Maximum drive speed (m/s)',_input('robot.maxspeed','1.2','number'))}
        ${_row('Max Payload','Max payload (kg)',_input('robot.payload','5.0','number'))}
      </div>
      <div class="config-section">
        <h3>DISPLAY</h3>
        ${_row('Wallpaper Theme','Animated background',`<select class="config-input" onchange="Wallpaper.setTheme(parseInt(this.value))"><option value="0">Circuit Board</option><option value="1">Radar Sweep</option><option value="2">Neural Net</option></select>`)}
      </div>
    `;
  }

  function _renderSafety() {
    return `
      <div class="config-section">
        <h3>SAFETY LIMITS</h3>
        ${_row('Battery Cutoff %','E-stop below this SOC',_input('safety.batt_cutoff','10','number'))}
        ${_row('Max CPU Temp °C','E-stop above this temp',_input('safety.max_temp','90','number'))}
        ${_row('Min Obstacle Distance m','Collision guard threshold',_input('safety.min_obstacle','0.15','number'))}
        ${_row('Watchdog Timeout s','Auto E-stop if no feed',_input('safety.watchdog_t','10','number'))}
      </div>
      <div class="config-section">
        <h3>SAFETY FEATURES</h3>
        ${_row('Collision Guard','Auto-stop on proximity trigger',_toggle('safety.collision_guard',true))}
        ${_row('Battery Guard','Auto-stop on low battery',_toggle('safety.battery_guard',true))}
        ${_row('Thermal Guard','Auto-stop on high temperature',_toggle('safety.thermal_guard',false))}
        ${_row('Watchdog Active','Enable hardware watchdog',_toggle('safety.watchdog',true))}
        ${_row('Safety Level',`SIL rating`,_select('safety.sil','2',[['1','SIL-1'],['2','SIL-2'],['3','SIL-3']]))}
      </div>
    `;
  }

  function _renderSensors() {
    return `
      <div class="config-section">
        <h3>SENSOR RATES</h3>
        ${_row('IMU Rate Hz','Inertial measurement unit rate',_input('sensor.imu_hz','50','number'))}
        ${_row('LiDAR Rate Hz','Point cloud scan rate',_input('sensor.lidar_hz','20','number'))}
        ${_row('Camera FPS','Visual frame rate',_input('sensor.cam_fps','30','number'))}
        ${_row('GPS Rate Hz','Position fix rate',_input('sensor.gps_hz','1','number'))}
        ${_row('Ultrasonic Rate Hz','Proximity sensor rate',_input('sensor.us_hz','20','number'))}
      </div>
      <div class="config-section">
        <h3>ENABLED SENSORS</h3>
        ${_row('IMU','Inertial Measurement Unit',_toggle('sensor.imu_en',true))}
        ${_row('LiDAR','360° Point Cloud Scanner',_toggle('sensor.lidar_en',true))}
        ${_row('Stereo Camera','Visual + Depth camera',_toggle('sensor.cam_en',true))}
        ${_row('GPS / RTK','Global Positioning',_toggle('sensor.gps_en',true))}
        ${_row('Ultrasonic','Proximity sensors x4',_toggle('sensor.us_en',true))}
      </div>
    `;
  }

  function _renderActuators() {
    return `
      <div class="config-section">
        <h3>MOTOR PARAMETERS</h3>
        ${_row('Max RPM','Motor maximum RPM',_input('act.max_rpm','1200','number'))}
        ${_row('Max Torque Nm','Motor maximum torque',_input('act.max_torque','5.0','number'))}
        ${_row('Motor Count','Number of drive motors',_input('act.motor_count','4','number'))}
        ${_row('Encoder PPR','Encoder pulses per revolution',_input('act.encoder_ppr','1024','number'))}
      </div>
      <div class="config-section">
        <h3>ARM CONFIG</h3>
        ${_row('Arm DOF','Robotic arm degrees of freedom',_input('act.arm_dof','4','number'))}
        ${_row('Servo Count','Total servo count',_input('act.servo_count','4','number'))}
        ${_row('Gripper Type','End effector type',_select('act.gripper','parallel',[['parallel','Parallel Jaw'],['vacuum','Vacuum'],['magnetic','Magnetic'],['none','None']]))}
      </div>
    `;
  }

  function _renderNetwork() {
    return `
      <div class="config-section">
        <h3>COMMUNICATION BUS</h3>
        ${_row('Protocol','Transport protocol',_select('net.protocol','ros2',[['ros2','ROS2/DDS'],['mqtt','MQTT'],['websocket','WebSocket'],['serial','Serial/UART']]))}
        ${_row('Master IP','Controller node IP',_input('net.master_ip','192.168.1.1'))}
        ${_row('Bus Port','Communication port',_input('net.port','9090','number'))}
        ${_row('Heartbeat Interval ms','Node heartbeat period',_input('net.heartbeat','1000','number'))}
      </div>
      <div class="config-section">
        <h3>TOPICS</h3>
        ${_row('Sensor Topic','Topic prefix for sensors',_input('net.sensor_topic','/robot/sensors'))}
        ${_row('Actuator Topic','Topic prefix for actuators',_input('net.act_topic','/robot/actuators'))}
        ${_row('Safety Topic','Emergency/safety channel',_input('net.safety_topic','/robot/safety'))}
      </div>
    `;
  }

  function _renderAI() {
    return `
      <div class="config-section">
        <h3>AI TASK ALLOCATOR</h3>
        ${_row('Scheduler Policy','Task scheduling algorithm',_select('ai.scheduler','priority',[['priority','Priority Queue'],['round_robin','Round Robin'],['edf','Earliest Deadline First'],['ml','ML-Optimized']]))}
        ${_row('Max Concurrent Tasks','Max tasks running in parallel',_input('ai.max_tasks','4','number'))}
        ${_row('Task Timeout s','Auto-cancel stalled tasks',_input('ai.task_timeout','30','number'))}
        ${_row('Auto-retry on Error','Re-queue failed tasks',_toggle('ai.retry',true))}
        ${_row('AI Coprocessor','Use onboard ML accelerator',_toggle('ai.coprocessor',true))}
      </div>
      <div class="config-section">
        <h3>AI PIPELINE</h3>
        ${_row('Obstacle Avoidance','Enable reactive avoidance layer',_toggle('ai.obstacle_avoidance',true))}
        ${_row('Path Planning','Enable A* path planner',_toggle('ai.path_plan',true))}
        ${_row('Object Detection','Enable YOLO/CV detection',_toggle('ai.obj_detect',true))}
        ${_row('SLAM','Simultaneous Localization & Mapping',_toggle('ai.slam',false))}
      </div>
    `;
  }

  function _renderAbout() {
    return `
      <div style="text-align:center;padding:32px">
        <div style="font-size:56px;margin-bottom:16px">⬡</div>
        <div style="font-family:var(--font-display);font-size:22px;letter-spacing:8px;color:var(--accent)">RoboticOS</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text2);margin:8px 0 20px;letter-spacing:3px">AUTONOMOUS SYSTEMS CONTROL LAYER v1.0</div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--text1);line-height:2">
          Runs as a normal Windows application.<br>
          No root · No admin · No kernel modifications.<br><br>
          <span style="color:var(--accent)">Stack:</span> Electron · Node.js · Canvas API<br>
          <span style="color:var(--accent)">Safety:</span> SIL-2 rated software watchdog<br>
          <span style="color:var(--accent)">Sensors:</span> IMU · LiDAR · Camera · GPS · US<br>
          <span style="color:var(--accent)">Protocols:</span> ROS2/DDS · MQTT · WebSocket
        </div>
      </div>
    `;
  }

  function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }
  return { launch, _tab };
})();
window.ConfigApp = ConfigApp;
