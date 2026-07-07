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
            taskList.innerHTML = `<li class="text-sm text-slate-400 dark:text-slate-500 text-center py-4 animate-fade-in">No objectives set for this date.</li>`;
            return;
        }

        tasks.forEach(task => {
            const li = document.createElement('li');
            li.className = "flex items-center justify-between p-3 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/40 rounded-xl shadow-sm text-slate-900 dark:text-white transition-all";
            li.setAttribute('data-id', task.id);

            li.innerHTML = `
                <div class="flex items-center gap-3 flex-1 task-view-container">
                    <input type="checkbox" ${task.is_completed ? 'checked' : ''} class="task-checkbox w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-600 focus:ring-blue-500 cursor-pointer bg-transparent" data-id="${task.id}">
                    <span class="text-sm font-medium task-title-text ${task.is_completed ? 'line-through text-slate-400 dark:text-slate-500' : ''}" data-id="${task.id}">${task.title}</span>
                </div>
                <div class="flex items-center gap-2 task-actions-container">
                    <button class="edit-btn text-xs text-blue-500 dark:text-blue-400 hover:underline" data-id="${task.id}">Edit</button>
                    <button class="delete-btn text-xs text-red-500 dark:text-red-400 hover:underline" data-id="${task.id}">Delete</button>
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

        // Optimistic UX: Create a temporary visual element instantly
        const tempId = Date.now();
        const li = document.createElement('li');
        li.className = "flex items-center justify-between p-3 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/40 rounded-xl shadow-sm text-slate-900 dark:text-white opacity-60";
        li.setAttribute('data-id', tempId);
        li.innerHTML = `
            <div class="flex items-center gap-3 flex-1">
                <input type="checkbox" disabled class="w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-transparent">
                <span class="text-sm font-medium">${title}</span>
            </div>
            <div class="text-xs text-slate-400">Saving...</div>
        `;
        
        // Remove empty state if present
        if (taskList.querySelector('li')?.classList.contains('text-slate-400')) {
            taskList.innerHTML = '';
        }
        taskList.appendChild(li);
        taskInput.value = '';

        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateInput.value, title })
        });
        
        if (res.ok) {
            fetchTasks(); // Sync layout cleanly with real database IDs
        } else {
            li.remove(); // Rollback on connection failure
        }
    });

    // Task Actions Event Delegation Router
    taskList.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        if (!id) return;

        const li = e.target.closest('li');

        // 1. Toggle Checkbox (Optimistic Update)
        if (e.target.classList.contains('task-checkbox')) {
            const span = li.querySelector('.task-title-text');
            const isChecked = e.target.checked;
            
            // Instantly toggle styles without waiting for network response
            if (isChecked) {
                span.classList.add('line-through', 'text-slate-400', 'dark:text-slate-500');
            } else {
                span.classList.remove('line-through', 'text-slate-400', 'dark:text-slate-500');
            }

            const res = await fetch(`/api/tasks/${id}/toggle`, { method: 'POST' });
            if (!res.ok) {
                // Rollback on network failure
                e.target.checked = !isChecked;
                span.classList.toggle('line-through');
            }
        } 
        // 2. Delete Task (Optimistic Update)
        else if (e.target.classList.contains('delete-btn')) {
            // Instantly wipe row from screen layout dynamically
            li.style.display = 'none'; 

            const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
            if (res.ok) {
                li.remove();
                if (taskList.children.length === 0) {
                    taskList.innerHTML = `<li class="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No objectives set for this date.</li>`;
                }
            } else {
                li.style.display = 'flex'; // Rollback on failure
            }
        } 
        // 3. Inline Edit Mode trigger (Instant local transition)
        else if (e.target.classList.contains('edit-btn')) {
            const viewContainer = li.querySelector('.task-view-container');
            const actionsContainer = li.querySelector('.task-actions-container');
            const currentTitle = viewContainer.querySelector('.task-title-text').textContent;

            viewContainer.innerHTML = `
                <input type="text" class="inline-edit-input w-full text-sm font-medium border border-blue-500 dark:border-blue-400 rounded-lg px-2 py-1 focus:outline-none bg-white dark:bg-slate-800 text-slate-950 dark:text-white" value="${currentTitle}">
            `;
            actionsContainer.innerHTML = `
                <button class="save-inline-btn text-xs text-emerald-500 dark:text-emerald-400 font-bold hover:underline" data-id="${id}">Save</button>
                <button class="cancel-inline-btn text-xs text-slate-400 dark:text-slate-500 hover:underline" data-id="${id}">Cancel</button>
            `;
            
            viewContainer.querySelector('.inline-edit-input').focus();
        }
        // 4. Save Inline Edited Task (Optimistic Update)
        else if (e.target.classList.contains('save-inline-btn')) {
            const newTitle = li.querySelector('.inline-edit-input').value.trim();
            if (!newTitle) return;

            // Instantly transition UI back to static view with new text values
            li.innerHTML = `
                <div class="flex items-center gap-3 flex-1 task-view-container">
                    <input type="checkbox" class="task-checkbox w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-600 focus:ring-blue-500 cursor-pointer bg-transparent" data-id="${id}">
                    <span class="text-sm font-medium task-title-text" data-id="${id}">${newTitle}</span>
                </div>
                <div class="flex items-center gap-2 task-actions-container">
                    <button class="edit-btn text-xs text-blue-500 dark:text-blue-400 hover:underline" data-id="${id}">Edit</button>
                    <button class="delete-btn text-xs text-red-500 dark:text-red-400 hover:underline" data-id="${id}">Delete</button>
                </div>
            `;

            const res = await fetch(`/api/tasks/${id}/edit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            if (!res.ok) {
                fetchTasks(); // Rollback to original db records on failure
            }
        }
        // 5. Cancel Inline Editing
        else if (e.target.classList.contains('cancel-inline-btn')) {
            fetchTasks();
        }
    });

    // Clear all tasks instantly (Optimistic)
    clearAllBtn.addEventListener('click', async () => {
        taskList.innerHTML = `<li class="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No objectives set for this date.</li>`;
        await fetch('/api/settings/clear', { method: 'POST' });
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
                
                try { bellAudio.play(); } catch(e) { console.log("Audio notification blocked."); }
                
                isWorkSession = !isWorkSession;
                if (isWorkSession) {
                    timerStatus.textContent = "Work Session";
                    timerStatus.className = "text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-3 py-1 rounded-full mb-6";
                    timeLeft = parseInt(workInput.value) * 60;
                } else {
                    timerStatus.textContent = "Break Session";
                    timerStatus.className = "text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 rounded-full mb-6";
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
        timerStatus.className = "text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-3 py-1 rounded-full mb-6";
        timeLeft = parseInt(workInput.value) * 60;
        updateTimerDisplay();
    }

    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetTimer);

    saveSettingsBtn.addEventListener('click', async () => {
        const work = parseInt(workInput.value);
        const brk = parseInt(breakInput.value);
        
        // Instant visual reset feedback
        resetTimer();

        await fetch('/api/settings/pomodoro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ work, break: brk })
        });
    });

    // --- THEME MUTATION ENGINE ---
    themeToggleBtn.addEventListener('click', async () => {
        const isCurrentlyDark = document.documentElement.classList.contains('dark');
        const newTheme = isCurrentlyDark ? 'light' : 'dark';

        // Optimistic Theme Swapping (flips visually instantly)
        if (newTheme === 'dark') {
            document.documentElement.classList.add('dark');
            themeToggleBtn.className = "p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors text-white";
            themeIcon.textContent = "☀️ Light Mode";
        } else {
            document.documentElement.classList.remove('dark');
            themeToggleBtn.className = "p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-slate-700";
            themeIcon.textContent = "🌙 Dark Mode";
        }

        await fetch('/api/settings/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: newTheme })
        });
    });

    // Kickstart application state engine
    timeLeft = parseInt(workInput.value) * 60;
    updateTimerDisplay();
    fetchTasks();
});