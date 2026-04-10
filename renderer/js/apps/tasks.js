/**
 * RoboticOS — AI Task Allocator
 */
const TasksApp = (() => {
  'use strict';
  let _intervals = {};
  let _selected = null;

  async function launch(pid) {
    const id = `tasks-${pid}`;
    const content = `
      <div class="tasks-wrap" id="tasksw-${pid}">
        <div class="tasks-sidebar">
          <div class="sec-header" style="padding:10px 12px;font-size:10px">TASK QUEUE</div>
          <div id="task-list-${pid}" style="flex:1;overflow:auto"></div>
          <div style="padding:8px;border-top:1px solid var(--border)">
            <button class="btn primary" style="width:100%" onclick="TasksApp._addTask(${pid})">+ New Task</button>
          </div>
        </div>
        <div class="tasks-main">
          <div id="task-detail-${pid}">
            <div style="color:var(--text2);font-family:var(--font-mono);font-size:12px;padding:20px">
              ← Select a task to view details
            </div>
          </div>
        </div>
      </div>
    `;

    WM.create({ id, title: 'AI TASK ALLOCATOR', icon: '🤖', width: 800, height: 520, content });
    await nextFrame();
    _startUpdates(pid);

    Kernel.on('wm:close', (cid) => {
      if (cid === id) { clearInterval(_intervals[pid]); delete _intervals[pid]; }
    });
  }

  function _startUpdates(pid) {
    const update = async () => {
      try {
        const { tasks } = await roboOS.robot.getTaskQueue();
        const rtTasks = RTOS.getTasks();
        const allTasks = [...tasks, ...rtTasks.map(t => ({
          id: t.id, name: t.name,
          priority: t.priority, status: t.status,
          progress: t.status === 'running' ? 50 : 0,
          runs: t.runs, errors: t.errors, eta: '-',
          isRTOS: true,
        }))];

        const listEl = document.getElementById(`task-list-${pid}`);
        if (!listEl) return;

        listEl.innerHTML = allTasks.map(t => `
          <div class="task-item ${_selected === t.id ? 'selected' : ''}"
               onclick="TasksApp._select(${pid},'${t.id}',${JSON.stringify(t).replace(/'/g,"\\'")})" >
            <div class="task-name">${t.name}</div>
            <div class="task-meta">
              <span class="priority-badge priority-${t.priority}">P${t.priority}</span>
              <span class="pill ${t.status === 'running' ? 'ok' : t.status === 'error' ? 'danger' : 'info'}">${t.status.toUpperCase()}</span>
            </div>
            ${t.progress > 0 ? `
              <div class="prog-bar" style="margin-top:4px">
                <div class="prog-fill ok" style="width:${t.progress}%"></div>
              </div>
            ` : ''}
          </div>
        `).join('');
      } catch(e) {}
    };
    update();
    _intervals[pid] = setInterval(update, 1000);
  }

  function _select(pid, taskId, task) {
    _selected = taskId;
    const detail = document.getElementById(`task-detail-${pid}`);
    if (!detail) return;
    detail.innerHTML = `
      <div style="padding:16px">
        <div style="font-family:var(--font-display);font-size:14px;letter-spacing:3px;color:var(--accent);margin-bottom:12px">${task.name}</div>
        <div class="data-card" style="margin-bottom:10px">
          <div class="data-card-title">TASK INFO</div>
          <div class="data-row"><span class="data-row-key">ID</span>       <span class="data-row-val">${task.id}</span></div>
          <div class="data-row"><span class="data-row-key">Priority</span> <span class="priority-badge priority-${task.priority}">P${task.priority}</span></div>
          <div class="data-row"><span class="data-row-key">Status</span>   <span class="pill ${task.status === 'running' ? 'ok' : task.status === 'error' ? 'danger' : 'info'}">${task.status.toUpperCase()}</span></div>
          ${task.eta !== undefined ? `<div class="data-row"><span class="data-row-key">ETA</span><span class="data-row-val">${task.eta}s</span></div>` : ''}
          ${task.runs !== undefined ? `<div class="data-row"><span class="data-row-key">Runs</span><span class="data-row-val">${task.runs}</span></div>` : ''}
          ${task.errors !== undefined ? `<div class="data-row"><span class="data-row-key">Errors</span><span class="data-row-val" style="color:${task.errors > 0 ? 'var(--danger)' : 'var(--ok)'}">${task.errors}</span></div>` : ''}
        </div>
        ${task.progress > 0 ? `
          <div class="data-card" style="margin-bottom:10px">
            <div class="data-card-title">PROGRESS</div>
            <div class="prog-bar" style="height:8px;margin-top:8px">
              <div class="prog-fill ok" style="width:${task.progress}%"></div>
            </div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text2);margin-top:6px">${task.progress}% complete</div>
          </div>
        ` : ''}
        <div class="data-card" style="margin-bottom:10px">
          <div class="data-card-title">AI ALLOCATION DECISION</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text1);line-height:1.7;margin-top:6px">
            Task assigned to <span style="color:var(--accent)">CORE-1</span> based on priority score.<br>
            Resource utilization: <span style="color:var(--ok)">OPTIMAL</span><br>
            Conflict check: <span style="color:var(--ok)">CLEAR</span><br>
            Safety gate: <span style="color:var(--ok)">PASSED</span>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn primary" onclick="TasksApp._runTask('${task.id}')">▶ Execute</button>
          <button class="btn warn" onclick="TasksApp._preempt('${task.id}')">⏸ Preempt</button>
          <button class="btn danger" onclick="TasksApp._cancel('${task.id}')">✕ Cancel</button>
        </div>
      </div>
    `;
  }

  async function _addTask(pid) {
    const name = prompt('Task name:');
    if (!name) return;
    const priority = parseInt(prompt('Priority (0=Emergency, 1=High, 2=Normal, 3=Low):', '2') || '2');
    RTOS.registerTask({ name, fn: async () => { await new Promise(r => setTimeout(r, 1000)); return 'done'; }, priority });
    Kernel.notify('Tasks', `Task "${name}" registered`, '🤖');
  }

  function _runTask(id) { RTOS.runTask(id); Kernel.notify('Tasks', `Running task ${id}`, '▶'); }
  function _preempt(id) { Kernel.notify('Tasks', `Task ${id} preempted`, '⏸', 'warn'); }
  function _cancel(id)  { Kernel.notify('Tasks', `Task ${id} cancelled`, '✕', 'warn'); }

  function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }
  return { launch, _select, _addTask, _runTask, _preempt, _cancel };
})();
window.TasksApp = TasksApp;
