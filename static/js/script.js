document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dateInput = document.getElementById('task-date');
    const dateLabel = document.getElementById('selected-date-label');
    const taskForm = document.getElementById('add-task-form');
    const taskInput = document.getElementById('task-input');
    const taskList = document.getElementById('task-list');
    const clearAllBtn = document.getElementById('clear-all-btn');

    const timerDisplay = document.getElementById('timer-display');
    const timerStatus = document.getElementById('timer-status-badge');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resetBtn = document.getElementById('reset-btn');
    const bellAudio = document.getElementById('timer-bell');

    const workInput = document.getElementById('work-duration');
    const breakInput = document.getElementById('break-duration');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');

    // Engine State
    let countdownInterval = null;
    let isWorkSession = true;
    let isRunning = false;
    let timeLeft = parseInt(workInput.value) * 60;

    // Default Initialization to current Date
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    dateLabel.textContent = today;

    // --- TASK MANAGEMENT SYSTEM ---
    async function fetchTasks() {
        const date = dateInput.value;
        dateLabel.textContent = date;
        try {
            const res = await fetch(`/api/tasks?date=${date}`);
            const tasks = await res.json();
            renderTasks(tasks);
        } catch (err) {
            console.error("Error fetching tasks:", err);
        }
    }

    function renderTasks(tasks) {
        taskList.innerHTML = '';
        if (tasks.length === 0) {
            taskList.innerHTML = `<li class="text-sm text-slate-400 text-center py-4">No objectives set for this date.</li>`;
            return;
        }
        tasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `flex items-center justify-between p-3 border rounded-xl bg-white shadow-sm transition-all ${
                document.body.classList.contains('dark-mode') ? 'bg-slate-800/60 border-slate-700' : 'border-slate-100'
            }`;

            li.innerHTML = `
                <div class="flex items-center gap-3 flex-1">
                    <input type="checkbox" ${task.is_completed ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer" data-id="${task.id}">
                    <span class="text-sm font-medium task-title-text ${task.is_completed ? 'line-through text-slate-400' : ''}" data-id="${task.id}">${task.title}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button class="edit-btn text-xs text-blue-500 hover:underline" data-id="${task.id}">Edit</button>
                    <button class="delete-btn text-xs text-red-500 hover:underline" data-id="${task.id}">Delete</button>
                </div>
            `;
            taskList.appendChild(li);
        });
    }

    // Add objective
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = taskInput.value.trim();
        if (!title) return;

        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateInput.value, title })
        });
        if (res.ok) {
            taskInput.value = '';
            fetchTasks();
        }
    });

    // Task Actions Event Delegation Router
    taskList.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        if (!id) return;

        if (e.target.type === 'checkbox') {
            await fetch(`/api/tasks/${id}/toggle`, { method: 'POST' });
            fetchTasks();
        } else if (e.target.classList.contains('delete-btn')) {
            await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
            fetchTasks();
        } else if (e.target.classList.contains('edit-btn')) {
            const span = taskList.querySelector(`span[data-id="${id}"]`);
            const currentTitle = span.textContent;
            const newTitle = prompt("Modify objective title:", currentTitle);
            if (newTitle && newTitle.trim() !== currentTitle) {
                await fetch(`/api/tasks/${id}/edit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newTitle.trim() })
                });
                fetchTasks();
            }
        }
    });

    // Wipe layout configuration
    clearAllBtn.addEventListener('click', async () => {
        if (confirm("Are you sure you want to clear all tasks from database storage?")) {
            await fetch('/api/settings/clear', { method: 'POST' });
            fetchTasks();
        }
    });

    dateInput.addEventListener('change', fetchTasks);

    // --- POMODORO TERMINAL CORE ---
    function updateTimerDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function startTimer() {
        if (isRunning) return;
        isRunning = true;
        startBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');

        countdownInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateTimerDisplay();
            } else {
                clearInterval(countdownInterval);
                isRunning = false;
                
                // Fire notification bell sound
                try { bellAudio.play(); } catch(e) { console.log("Audio notification blocked by browser."); }
                
                // Flip operational mode
                isWorkSession = !isWorkSession;
                if (isWorkSession) {
                    timerStatus.textContent = "Work Session";
                    timerStatus.className = "text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-6";
                    timeLeft = parseInt(workInput.value) * 60;
                } else {
                    timerStatus.textContent = "Break Session";
                    timerStatus.className = "text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full mb-6";
                    timeLeft = parseInt(breakInput.value) * 60;
                }
                startBtn.classList.remove('hidden');
                pauseBtn.classList.add('hidden');
                updateTimerDisplay();
            }
        }, 1000);
    }

    function pauseTimer() {
        clearInterval(countdownInterval);
        isRunning = false;
        startBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
    }

    function resetTimer() {
        pauseTimer();
        isWorkSession = true;
        timerStatus.textContent = "Work Session";
        timerStatus.className = "text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-6";
        timeLeft = parseInt(workInput.value) * 60;
        updateTimerDisplay();
    }

    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetTimer);

    saveSettingsBtn.addEventListener('click', async () => {
        const work = parseInt(workInput.value);
        const brk = parseInt(breakInput.value);
        const res = await fetch('/api/settings/pomodoro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ work, break: brk })
        });
        if (res.ok) {
            alert("Timer parameters applied successfully!");
            resetTimer();
        }
    });

    // --- THEME MUTATION ENGINE ---
    themeToggleBtn.addEventListener('click', async () => {
        const isDark = document.body.classList.contains('dark-mode');
        const newTheme = isDark ? 'light' : 'dark';

        if (confirm("Warning: Changing themes will clear all tasks per structure initialization instructions. Continue?")) {
            const res = await fetch('/api/settings/theme', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: newTheme })
            });

            if (res.ok) {
                if (newTheme === 'dark') {
                    document.body.classList.add('dark-mode', 'bg-slate-900', 'text-slate-100');
                    document.body.classList.remove('bg-slate-50', 'text-slate-900');
                    themeToggleBtn.className = "p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors";
                    themeIcon.textContent = "☀️ Light Mode";
                } else {
                    document.body.classList.remove('dark-mode', 'bg-slate-900', 'text-slate-100');
                    document.body.classList.add('bg-slate-50', 'text-slate-900');
                    themeToggleBtn.className = "p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors";
                    themeIcon.textContent = "🌙 Dark Mode";
                }
                fetchTasks(); // Refresh board layout matrix status
            }
        }
    });

    // Kickstart application state engine
    timeLeft = parseInt(workInput.value) * 60;
    updateTimerDisplay();
    fetchTasks();
});