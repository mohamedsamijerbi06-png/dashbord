/**
 * FlowState — AI Productivity Dashboard
 * Main application logic: Tasks, Pomodoro Timer, Charts, LocalStorage
 */

/* =========================================
   STATE — everything lives here
   ========================================= */
const State = {
  tasks: [],           // Array of task objects
  timer: {
    seconds: 1500,     // Current countdown seconds
    total: 1500,       // Total seconds for current mode
    running: false,    // Is timer active?
    mode: 'pomodoro',  // Current mode
    interval: null,    // setInterval reference
    session: 1,        // Which of 4 sessions
    todaySessions: 0,
    todayBreaks: 0,
    todayMinutes: 0,
  },
  theme: 'dark',
  charts: {},          // Chart.js instances keyed by id
};

/* =========================================
   LOCAL STORAGE HELPERS
   ========================================= */
const LS = {
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
};

function loadState() {
  State.tasks = LS.get('fs_tasks') || [];
  const timer = LS.get('fs_timer');
  if (timer) {
    State.timer.todaySessions = timer.todaySessions || 0;
    State.timer.todayBreaks = timer.todayBreaks || 0;
    State.timer.todayMinutes = timer.todayMinutes || 0;
    State.timer.session = timer.session || 1;
  }
  State.theme = LS.get('fs_theme') || 'dark';
}

function saveState() {
  LS.set('fs_tasks', State.tasks);
  LS.set('fs_timer', {
    todaySessions: State.timer.todaySessions,
    todayBreaks: State.timer.todayBreaks,
    todayMinutes: State.timer.todayMinutes,
    session: State.timer.session,
  });
}

/* =========================================
   SECTION NAVIGATION
   ========================================= */
function switchSection(name) {
  // Hide all sections
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Show target
  document.getElementById('section-' + name)?.classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');

  // Refresh charts when analytics section opens
  if (name === 'stats') refreshAnalyticsCharts();

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

/* =========================================
   GREETING & DATE
   ========================================= */
function initGreeting() {
  const hour = new Date().getHours();
  const greetings = ['Good night', 'Good morning', 'Good afternoon', 'Good evening'];
  const idx = hour < 5 ? 0 : hour < 12 ? 1 : hour < 17 ? 2 : 3;
  document.getElementById('greeting').textContent = greetings[idx] + ' 👋';

  const now = new Date();
  document.getElementById('currentDate').textContent =
    now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/* =========================================
   THEME TOGGLE
   ========================================= */
function initTheme() {
  document.documentElement.setAttribute('data-theme', State.theme);
  document.getElementById('themeIcon').className =
    State.theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
}

document.getElementById('themeToggle').addEventListener('click', () => {
  State.theme = State.theme === 'dark' ? 'light' : 'dark';
  initTheme();
  LS.set('fs_theme', State.theme);
  // Rebuild charts after theme change
  setTimeout(() => { rebuildAllCharts(); }, 100);
});

/* =========================================
   TASK MANAGEMENT
   ========================================= */

/** Generate a unique ID */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Save task from modal */
document.getElementById('saveTaskBtn').addEventListener('click', () => {
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) { showToast('Please enter a task title', 'error'); return; }

  const editId = document.getElementById('taskEditId').value;

  const taskData = {
    id: editId || uid(),
    title,
    desc: document.getElementById('taskDesc').value.trim(),
    priority: document.getElementById('taskPriority').value,
    category: document.getElementById('taskCategory').value,
    due: document.getElementById('taskDue').value,
    status: document.getElementById('taskStatus').value,
    createdAt: editId
      ? (State.tasks.find(t => t.id === editId)?.createdAt || Date.now())
      : Date.now(),
  };

  if (editId) {
    // Update existing task
    const idx = State.tasks.findIndex(t => t.id === editId);
    if (idx > -1) State.tasks[idx] = taskData;
    showToast('Task updated!', 'success');
  } else {
    State.tasks.unshift(taskData);
    showToast('Task added!', 'success');
  }

  saveState();
  bootstrap.Modal.getInstance(document.getElementById('taskModal'))?.hide();
  resetTaskModal();
  renderTasks();
  updateStats();
  updateDashboardTasks();
  updateTimerTaskSelect();
});

/** Reset the task modal form */
function resetTaskModal() {
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDesc').value = '';
  document.getElementById('taskPriority').value = 'medium';
  document.getElementById('taskCategory').value = 'work';
  document.getElementById('taskDue').value = '';
  document.getElementById('taskStatus').value = 'pending';
  document.getElementById('taskEditId').value = '';
  document.getElementById('taskModalTitle').textContent = 'Add New Task';
}

/** Render task list with optional filter */
let activeFilter = 'all';

function renderTasks() {
  const container = document.getElementById('taskList');
  let filtered = [...State.tasks];

  if (activeFilter !== 'all') {
    filtered = filtered.filter(t => t.status === activeFilter);
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-clipboard-x"></i>
        <p>No tasks found. ${activeFilter === 'all' ? 'Add your first task!' : `No ${activeFilter} tasks.`}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(task => taskCardHTML(task)).join('');

  // Bind checkboxes
  container.querySelectorAll('.task-checkbox').forEach(box => {
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTaskComplete(box.dataset.id);
    });
  });

  // Bind edit buttons
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditTask(btn.dataset.id);
    });
  });

  // Bind delete buttons
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTask(btn.dataset.id);
    });
  });
}

/** Build HTML for a single task card */
function taskCardHTML(task) {
  const isCompleted = task.status === 'completed';
  const priorityClass = `priority-${task.priority}`;
  const priorityLabel = { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' }[task.priority];
  const categoryEmoji = { work: '💼', personal: '🏠', study: '📚', health: '💪', other: '📌' }[task.category] || '📌';
  const dueText = task.due ? `📅 ${task.due}` : '';

  return `
    <div class="task-card ${isCompleted ? 'completed-task' : ''}">
      <div class="task-checkbox ${isCompleted ? 'checked' : ''}" data-id="${task.id}">
        ${isCompleted ? '<i class="bi bi-check"></i>' : ''}
      </div>
      <div class="task-body">
        <div class="task-title">${escapeHTML(task.title)}</div>
        ${task.desc ? `<div class="task-desc">${escapeHTML(task.desc)}</div>` : ''}
        <div class="task-meta">
          <span class="priority-badge ${priorityClass}">${priorityLabel}</span>
          <span class="category-badge">${categoryEmoji} ${task.category}</span>
          ${dueText ? `<span class="due-badge">${dueText}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="task-action-btn edit-btn" data-id="${task.id}" title="Edit">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="task-action-btn delete-btn delete" data-id="${task.id}" title="Delete">
          <i class="bi bi-trash3"></i>
        </button>
      </div>
    </div>`;
}

function toggleTaskComplete(id) {
  const task = State.tasks.find(t => t.id === id);
  if (!task) return;
  task.status = task.status === 'completed' ? 'pending' : 'completed';
  saveState();
  renderTasks();
  updateStats();
  updateDashboardTasks();
  showToast(task.status === 'completed' ? '✅ Task completed!' : 'Task reopened', 'info');
}

function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  State.tasks = State.tasks.filter(t => t.id !== id);
  saveState();
  renderTasks();
  updateStats();
  updateDashboardTasks();
  updateTimerTaskSelect();
  showToast('Task deleted', 'error');
}

function openEditTask(id) {
  const task = State.tasks.find(t => t.id === id);
  if (!task) return;

  document.getElementById('taskEditId').value = task.id;
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDesc').value = task.desc || '';
  document.getElementById('taskPriority').value = task.priority;
  document.getElementById('taskCategory').value = task.category;
  document.getElementById('taskDue').value = task.due || '';
  document.getElementById('taskStatus').value = task.status;
  document.getElementById('taskModalTitle').textContent = 'Edit Task';

  new bootstrap.Modal(document.getElementById('taskModal')).show();
}

/** Filter tabs */
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter;
    renderTasks();
  });
});

/** Reset modal when opening for new task */
document.getElementById('taskModal').addEventListener('show.bs.modal', (e) => {
  if (!document.getElementById('taskEditId').value) resetTaskModal();
});

/** Update dashboard task preview */
function updateDashboardTasks() {
  const container = document.getElementById('dashboardTaskList');
  const recent = State.tasks.slice(0, 6);

  if (!recent.length) {
    container.innerHTML = `<div class="empty-state"><i class="bi bi-clipboard"></i><p>No tasks yet. Add your first task!</p></div>`;
    return;
  }

  container.innerHTML = recent.map(t => `
    <div class="task-preview-item ${t.status === 'completed' ? 'done' : ''}">
      <span class="dot dot-${t.priority}"></span>
      <span style="flex:1">${escapeHTML(t.title)}</span>
      <span class="category-badge">${t.status}</span>
    </div>`).join('');
}

/* =========================================
   TIMER (POMODORO)
   ========================================= */
const CIRCUMFERENCE = 2 * Math.PI * 90; // r=90 → ≈565.48

const timerModes = {
  pomodoro: { seconds: 1500, label: 'Focus Time' },
  short: { seconds: 300, label: 'Short Break' },
  long: { seconds: 900, label: 'Long Break' },
};

function initTimer() {
  // Add SVG gradient definition
  const svg = document.querySelector('.timer-svg');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7c5cfc"/>
      <stop offset="100%" style="stop-color:#e066ff"/>
    </linearGradient>`;
  svg.prepend(defs);

  updateTimerDisplay();
  updateSessionDots();
  updateTimerStats();
}

function updateTimerDisplay() {
  const { seconds, total } = State.timer;
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  document.getElementById('timerDisplay').textContent = `${mins}:${secs}`;

  // Update ring progress
  const progress = document.getElementById('timerProgress');
  const fraction = seconds / total;
  progress.style.strokeDasharray = CIRCUMFERENCE;
  progress.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);
}

// Start / Stop button
document.getElementById('timerStartStop').addEventListener('click', () => {
  if (State.timer.running) {
    stopTimer();
  } else {
    startTimer();
  }
});

// Reset button
document.getElementById('timerReset').addEventListener('click', () => {
  stopTimer();
  State.timer.seconds = State.timer.total;
  updateTimerDisplay();
});

// Skip button
document.getElementById('timerSkip').addEventListener('click', () => {
  stopTimer();
  handleTimerComplete();
});

function startTimer() {
  State.timer.running = true;
  document.getElementById('timerIcon').className = 'bi bi-pause-fill';

  State.timer.interval = setInterval(() => {
    State.timer.seconds--;
    updateTimerDisplay();

    if (State.timer.seconds <= 0) {
      handleTimerComplete();
    }
  }, 1000);
}

function stopTimer() {
  State.timer.running = false;
  document.getElementById('timerIcon').className = 'bi bi-play-fill';
  clearInterval(State.timer.interval);
  State.timer.interval = null;
}

function handleTimerComplete() {
  stopTimer();
  const { mode, total } = State.timer;

  if (mode === 'pomodoro') {
    State.timer.todaySessions++;
    State.timer.todayMinutes += Math.floor(total / 60);
    State.timer.session = Math.min(State.timer.session + 1, 4);

    // After 4 sessions, switch to long break
    if (State.timer.session > 4) {
      State.timer.session = 1;
      setTimerMode('long');
    } else {
      setTimerMode('short');
    }
    showToast('🎉 Focus session complete! Take a break.', 'success');
  } else {
    State.timer.todayBreaks++;
    setTimerMode('pomodoro');
    showToast('⚡ Break over! Back to work.', 'info');
  }

  saveState();
  updateStats();
  updateTimerStats();
  updateSessionDots();
}

function setTimerMode(mode) {
  State.timer.mode = mode;
  State.timer.seconds = timerModes[mode].seconds;
  State.timer.total = timerModes[mode].seconds;
  document.getElementById('timerModeLabel').textContent = timerModes[mode].label;

  document.querySelectorAll('.timer-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  updateTimerDisplay();
}

document.querySelectorAll('.timer-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    stopTimer();
    setTimerMode(btn.dataset.mode);
  });
});

function updateSessionDots() {
  document.querySelectorAll('.session-dot').forEach(dot => {
    const n = parseInt(dot.dataset.session);
    dot.classList.toggle('active', n <= State.timer.session);
  });
  document.getElementById('sessionCount').textContent = State.timer.session;
}

function updateTimerStats() {
  document.getElementById('todaySessions').textContent = State.timer.todaySessions;
  document.getElementById('todayFocusTime').textContent = State.timer.todayMinutes + ' min';
  document.getElementById('todayBreaks').textContent = State.timer.todayBreaks;
}

function updateTimerTaskSelect() {
  const sel = document.getElementById('timerTaskSelect');
  const pending = State.tasks.filter(t => t.status !== 'completed');
  sel.innerHTML = '<option value="">— Select a task —</option>' +
    pending.map(t => `<option value="${t.id}">${escapeHTML(t.title)}</option>`).join('');
}

/* =========================================
   STATS (DASHBOARD COUNTERS)
   ========================================= */
function updateStats() {
  const total = State.tasks.length;
  const completed = State.tasks.filter(t => t.status === 'completed').length;
  const pending = State.tasks.filter(t => t.status === 'pending').length;
  const focus = State.timer.todaySessions;
  const streak = getStreak();

  document.getElementById('statCompleted').textContent = completed;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statFocus').textContent = focus;
  document.getElementById('statStreak').textContent = streak;

  // Animated progress bars
  const pct = total ? Math.round((completed / total) * 100) : 0;
  document.getElementById('barCompleted').style.width = pct + '%';
  document.getElementById('barPending').style.width = total ? Math.round((pending / total) * 100) + '%' : '0%';
  document.getElementById('barFocus').style.width = Math.min(focus * 10, 100) + '%';
  document.getElementById('barStreak').style.width = Math.min(streak * 14, 100) + '%';

  // Productivity score
  document.getElementById('scoreLabel').textContent = pct + '% Focused';

  // Update dashboard charts
  updateDashboardCharts();
}

function getStreak() {
  // Simulate a streak based on completed tasks
  return Math.min(State.tasks.filter(t => t.status === 'completed').length, 7);
}

/* =========================================
   CHARTS
   ========================================= */

// Chart default colors based on theme
function chartColors() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    text: dark ? '#9999bb' : '#555577',
    grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  };
}

function destroyChart(id) {
  if (State.charts[id]) { State.charts[id].destroy(); delete State.charts[id]; }
}

/** Build or rebuild the weekly bar chart */
function buildWeeklyChart() {
  destroyChart('weekly');
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const { text, grid } = chartColors();

  // Simulate realistic weekly data from tasks
  const data = days.map((_, i) => {
    const seed = (State.tasks.length + i) % 7;
    return [2, 5, 3, 7, 4, 6, 3][seed] + Math.floor(State.timer.todaySessions / 2);
  });

  State.charts.weekly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        label: 'Tasks Done',
        data,
        backgroundColor: 'rgba(124,92,252,0.7)',
        borderColor: '#7c5cfc',
        borderWidth: 0,
        borderRadius: 6,
      }, {
        label: 'Focus Sessions',
        data: days.map(() => Math.floor(Math.random() * 5)),
        backgroundColor: 'rgba(224,102,255,0.4)',
        borderColor: '#e066ff',
        borderWidth: 0,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: text, font: { family: 'DM Sans' } } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true },
      }
    }
  });
}

/** Build or rebuild the donut chart */
function buildDonutChart() {
  destroyChart('donut');
  const ctx = document.getElementById('donutChart').getContext('2d');
  const completed = State.tasks.filter(t => t.status === 'completed').length;
  const pending = State.tasks.filter(t => t.status === 'pending').length;
  const inProgress = State.tasks.filter(t => t.status === 'in-progress').length;
  const { text } = chartColors();

  State.charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Pending', 'In Progress'],
      datasets: [{
        data: [completed || 1, pending || 1, inProgress || 1],
        backgroundColor: ['rgba(52,211,153,0.8)', 'rgba(251,191,36,0.8)', 'rgba(124,92,252,0.8)'],
        borderColor: 'transparent',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      cutout: '70%',
      plugins: { legend: { position: 'bottom', labels: { color: text, padding: 12, font: { family: 'DM Sans' } } } }
    }
  });
}

/** Focus sessions bar (timer section) */
function buildFocusBarChart() {
  destroyChart('focusBar');
  const ctx = document.getElementById('focusBarChart').getContext('2d');
  const hours = ['9am', '10am', '11am', '1pm', '2pm', '3pm'];
  const { text, grid } = chartColors();

  State.charts.focusBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: hours,
      datasets: [{
        label: 'Focus (min)',
        data: [25, 50, 25, 50, 25, 0].map((v, i) => i < State.timer.todaySessions ? v : 0),
        backgroundColor: 'rgba(124,92,252,0.7)',
        borderRadius: 5,
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: text, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: text, font: { size: 10 } }, grid: { color: grid }, beginAtZero: true },
      }
    }
  });
}

/** Analytics charts */
function refreshAnalyticsCharts() {
  buildPriorityChart();
  buildCompletionChart();
  buildMonthlyFocusChart();
}

function buildPriorityChart() {
  destroyChart('priority');
  const ctx = document.getElementById('priorityChart').getContext('2d');
  const high = State.tasks.filter(t => t.priority === 'high').length;
  const med = State.tasks.filter(t => t.priority === 'medium').length;
  const low = State.tasks.filter(t => t.priority === 'low').length;
  const { text } = chartColors();

  State.charts.priority = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['High', 'Medium', 'Low'],
      datasets: [{
        data: [high || 1, med || 1, low || 1],
        backgroundColor: ['rgba(239,68,68,0.8)', 'rgba(251,191,36,0.8)', 'rgba(52,211,153,0.8)'],
        borderColor: 'transparent',
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { color: text, font: { family: 'DM Sans' } } } }
    }
  });
}

function buildCompletionChart() {
  destroyChart('completion');
  const ctx = document.getElementById('completionChart').getContext('2d');
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const { text, grid } = chartColors();
  const base = State.tasks.filter(t => t.status === 'completed').length;

  State.charts.completion = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: 'Completion %',
        data: [40, 55, 60, 45, 70, 80, base ? Math.min(base * 12, 100) : 50],
        borderColor: '#7c5cfc',
        backgroundColor: 'rgba(124,92,252,0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#7c5cfc',
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: text } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true, max: 100 },
      }
    }
  });
}

function buildMonthlyFocusChart() {
  destroyChart('monthlyFocus');
  const ctx = document.getElementById('monthlyFocusChart').getContext('2d');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const { text, grid } = chartColors();

  State.charts.monthlyFocus = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Focus Hours',
        data: [12, 19, 14, 22, 18, Math.max(State.timer.todayMinutes / 60, 1)],
        backgroundColor: months.map((_, i) =>
          `rgba(${124 + i * 10}, ${92 + i * 15}, 252, 0.7)`),
        borderRadius: 8,
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: text } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true },
      }
    }
  });
}

function updateDashboardCharts() {
  buildWeeklyChart();
  buildDonutChart();
}

function rebuildAllCharts() {
  buildWeeklyChart();
  buildDonutChart();
  buildFocusBarChart();
}

/* =========================================
   TOAST NOTIFICATIONS
   ========================================= */
function showToast(message, type = 'info') {
  const wrapper = document.getElementById('toastWrapper');
  const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill' };

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerHTML = `
    <i class="bi ${icons[type]} toast-icon"></i>
    <span>${message}</span>`;

  wrapper.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* =========================================
   UTILITY
   ========================================= */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* =========================================
   SIDEBAR NAV EVENTS
   ========================================= */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    switchSection(item.dataset.section);
  });
});

document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  if (!sidebar.contains(e.target) && !toggle?.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

/* =========================================
   INIT
   ========================================= */
function init() {
  loadState();
  initTheme();
  initGreeting();
  initTimer();
  renderTasks();
  updateDashboardTasks();
  updateStats();
  updateTimerTaskSelect();
  updateTimerStats();

  // Add some demo tasks if first run
  if (State.tasks.length === 0) {
    const demos = [
      { title: 'Design new landing page', priority: 'high', category: 'work', status: 'in-progress', desc: 'Create wireframes and mockups for the product page' },
      { title: 'Complete API documentation', priority: 'medium', category: 'work', status: 'pending', desc: 'Write comprehensive docs for all endpoints' },
      { title: 'Morning workout session', priority: 'low', category: 'health', status: 'completed', desc: '30 min cardio + strength training' },
      { title: 'Review pull requests', priority: 'high', category: 'work', status: 'pending', desc: 'Review team\'s code changes and leave feedback' },
      { title: 'Read "Atomic Habits" chapter 5', priority: 'low', category: 'study', status: 'completed', desc: '' },
    ];
    demos.forEach(d => State.tasks.push({ id: uid(), createdAt: Date.now(), due: '', ...d }));
    saveState();
    renderTasks();
    updateDashboardTasks();
    updateStats();
    updateTimerTaskSelect();
  }
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', init);