// State management
let selectedDepartment = null;
let selectedSubOption = null;

// Search Debounce Logic
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
const debouncedRender = debounce(() => renderTasks(), 300);

// Inject styles for confidence badge animation
const styleSheet = document.createElement("style");
styleSheet.textContent = `
@keyframes badge-pulse {
    0% { transform: scale(1); opacity: 0.9; }
    50% { transform: scale(1.05); opacity: 1; }
    100% { transform: scale(1); opacity: 0.9; }
}
`;
document.head.appendChild(styleSheet);

// Helper function to generate a hash from tasks
function generateTaskHash(tasks) {
    try {
        const taskString = JSON.stringify(tasks);
        // Simple hash: string length + a bit of base64
        return taskString.length + btoa(taskString.substring(0, 10));
    } catch (e) {
        console.error("Hash error", e);
        return ''; // Safe default
    }
}
/**
 * Toggles the visibility of department sub-options (Accordion behavior)
 * Ensures only one department is open at a time.
 * @param {HTMLElement} headerElement - The clicked header element
 */
function toggleDepartment(headerElement) {
    const card = headerElement.closest('.dept-card');
    const allDepts = document.querySelectorAll('.dept-card');
    
    allDepts.forEach(dept => {
        if (dept === card) {
            dept.classList.toggle('active');
        } else {
            dept.classList.remove('active');
        }
    });
}

/**
 * Toggles the visibility of AI Logic details
 * @param {HTMLElement} btn - The clicked button element
 */
function toggleAILogic(btn) {
    const content = btn.nextElementSibling;
    content.classList.toggle('open');
    const isOpen = content.classList.contains('open');
    btn.innerHTML = isOpen ? 
        'Hide AI Logic <i class="fa-solid fa-chevron-up"></i>' : 
        'Show AI Logic <i class="fa-solid fa-chevron-down"></i>';
}

/**
 * Handles the selection of a sub-option
 * @param {HTMLElement} element - The clicked sub-option element
 * @param {string} optionName - The name of the option
 */
function selectOption(element, optionName) {
    // Remove selected class from all options
    const allOptions = document.querySelectorAll('.sub-option');
    allOptions.forEach(opt => opt.classList.remove('selected'));

    // Add selected class to clicked element
    element.classList.add('selected');
    
    // Capture department name
    const card = element.closest('.dept-card');
    selectedDepartment = card.querySelector('h3').textContent;
    
    selectedSubOption = optionName;
    
    // Enable the start button
    const startBtn = document.getElementById('start-btn');
    startBtn.disabled = false;
    startBtn.textContent = `Start ${optionName} Session`;
}

/**
 * Handles the start session button click
 */
function startSession() {
    if (!selectedSubOption) return;

    // Store session data
    localStorage.setItem('currentDepartment', selectedDepartment);
    localStorage.setItem('currentSubDepartment', selectedSubOption);
    
    updateContextButtonVisibility();

    const btn = document.getElementById('start-btn');
    
    // 1. Button Feedback
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Initializing Agent...';
    
    // 2. Transition Animation
    const landingView = document.getElementById('landing-view');
    const dashboardView = document.getElementById('dashboard-view');
    const loader = document.getElementById('dashboard-loader');
    const content = document.getElementById('dashboard-content');
    const sessionTitle = document.getElementById('session-title');

    // Fade out landing
    landingView.style.opacity = '0';
    landingView.style.transform = 'translateY(-20px)';

    setTimeout(() => {
        landingView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        
        // Ensure loader is visible and content is hidden initially
        loader.classList.remove('hidden');
        content.classList.add('hidden');
        
        // Simulate loading process
        document.getElementById('dashboard-loading-text').textContent = `Loading ${selectedSubOption} Dashboard...`;
        
        setTimeout(() => {
            // Hide loader, show dashboard
            loader.classList.add('hidden');
            content.classList.remove('hidden');
            
            // Update Dashboard Title
            sessionTitle.textContent = `${selectedDepartment} > ${selectedSubOption}`;
            
            // Inject Filter UI if missing
            injectFilterUI();

            // Load and render tasks for this session
            renderTasks();
        }, 2000);

    }, 500); // Wait for fade out
}

/**
 * Helper to generate the storage key based on current session
 */
function getStorageKey() {
    const dept = localStorage.getItem('currentDepartment');
    const sub = localStorage.getItem('currentSubDepartment');
    if (!dept || !sub) return null;
    return `${dept}-${sub}`;
}

/**
 * Calculates risk based on deadline proximity
 * @param {string} deadline - YYYY-MM-DD
 */
function calculateRisk(deadline) {
    if (!deadline) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [y, m, d] = deadline.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    
    const diffTime = target - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
        const days = Math.abs(diffDays);
        return { 
            label: `🚨 OVERDUE • ${days} Day${days === 1 ? '' : 's'} Late`, 
            class: "risk-overdue",
            cardClass: "card-overdue",
            category: "Overdue"
        };
    }
    
    let dayText = `${diffDays} Days Left`;
    if (diffDays === 1) dayText = "1 Day Left";
    if (diffDays === 0) {
        dayText = "Due Today";
        return { label: `✅ STABLE • ${dayText}`, class: "risk-stable", cardClass: "card-stable", category: "Due Today" };
    }

    if (diffDays <= 2) return { label: `⚠ HIGH RISK • ${dayText}`, class: "risk-high", cardClass: "card-high", category: "High Urgency" };
    if (diffDays <= 5) return { label: `⏳ MODERATE • ${dayText}`, class: "risk-moderate", cardClass: "card-moderate", category: "Moderate Urgency" };
    return { label: `✅ STABLE • ${dayText}`, class: "risk-stable", cardClass: "card-stable", category: "Stable Timeline" };
}

/**
 * Injects the Filter UI into the dashboard
 */
function injectFilterUI() {
    const taskList = document.getElementById('task-list');
    if (!taskList || document.querySelector('.filter-bar')) return;

    const filterBar = document.createElement('div');
    filterBar.className = 'filter-bar glass-card';
    filterBar.innerHTML = `
        <div class="search-group">
            <div class="search-wrapper">
                <i class="fa-solid fa-magnifying-glass search-icon"></i>
                <input type="text" id="task-search" class="search-input" placeholder="Search by title, ID, or priority..." oninput="debouncedRender()">
            </div>
        </div>
        <div class="filter-group">
            <label>Status</label>
            <select id="filter-status" onchange="renderTasks()">
                <option value="active" selected>Active</option>
                <option value="completed">Completed</option>
                <option value="all">All</option>
            </select>
        </div>
        <div class="filter-group">
            <label>Priority</label>
            <select id="filter-priority" onchange="renderTasks()">
                <option value="all" selected>All Priorities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
            </select>
        </div>
        <div class="filter-group">
            <label>Risk</label>
            <select id="filter-risk" onchange="renderTasks()">
                <option value="all" selected>All Risks</option>
                <option value="Overdue">Overdue</option>
                <option value="Due Today">Due Today</option>
                <option value="High Urgency">High Urgency</option>
                <option value="Moderate Urgency">Moderate Urgency</option>
                <option value="Stable Timeline">Stable Timeline</option>
            </select>
        </div>
        <div class="filter-group">
            <label>Sort By</label>
            <select id="sort-tasks" onchange="renderTasks()">
                <option value="newest" selected>Newest First</option>
                <option value="deadline">Deadline</option>
                <option value="priority">AI Priority</option>
                <option value="confidence">Confidence</option>
            </select>
        </div>
    `;

    taskList.parentNode.insertBefore(filterBar, taskList);
}

/**
 * Applies filters and sorting to the task list
 */
function applyFiltersAndSort(tasks) {
    const statusEl = document.getElementById('filter-status');
    const priorityEl = document.getElementById('filter-priority');
    const riskEl = document.getElementById('filter-risk');
    const sortEl = document.getElementById('sort-tasks');
    const searchEl = document.getElementById('task-search');

    // If UI not ready, return original
    if (!statusEl) return tasks;

    let filtered = [...tasks];

    // 0. Search Filter
    if (searchEl) {
        const term = searchEl.value.toLowerCase().trim();
        if (term) {
            filtered = filtered.filter(t => {
                const title = (t.title || '').toLowerCase();
                const desc = (t.description || '').toLowerCase();
                const prio = (t.priority || '').toLowerCase();
                const id = String(t.id);
                return title.includes(term) || desc.includes(term) || prio.includes(term) || id.includes(term);
            });
        }
    }

    // 1. Status Filter
    const status = statusEl.value;
    if (status !== 'all') {
        filtered = filtered.filter(t => t.status === status);
    }

    // 2. Priority Filter
    const priority = priorityEl.value;
    if (priority !== 'all') {
        filtered = filtered.filter(t => (t.priority || 'Unassigned') === priority);
    }

    // 3. Risk Filter
    const risk = riskEl.value;
    if (risk !== 'all') {
        filtered = filtered.filter(t => {
            if (!t.deadline) return false;
            const r = calculateRisk(t.deadline);
            return r && r.category === risk;
        });
    }

    // 4. Sorting
    const sort = sortEl.value;
    filtered.sort((a, b) => {
        if (sort === 'newest') {
            return b.id - a.id;
        }
        if (sort === 'deadline') {
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;
            return new Date(a.deadline) - new Date(b.deadline);
        }
        if (sort === 'priority') {
            const pMap = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
            const pA = pMap[a.priority] || 0;
            const pB = pMap[b.priority] || 0;
            return pB - pA;
        }
        if (sort === 'confidence') {
            return (b.confidence || 0) - (a.confidence || 0);
        }
        return 0;
    });

    return filtered;
}

/**
 * Toggles the visibility of the Completed Tasks Archive
 */
function toggleArchive() {
    const list = document.getElementById('archive-list');
    const icon = document.querySelector('#archive-header .arrow-icon');
    
    if (list && icon) {
        list.classList.toggle('hidden');
        const isHidden = list.classList.contains('hidden');
        icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
    }
}

/**
 * Renders tasks from LocalStorage to the DOM
 */
function renderTasks() {
    const key = getStorageKey();
    if (!key) return;
    
    let allTasks = JSON.parse(localStorage.getItem(key) || '[]');

    // ---- Re-Optimization Indicator Logic ----
    const indicatorContainer = document.getElementById('reoptimize-indicator');
    if (indicatorContainer) {
        const lastOptimizedAt = localStorage.getItem(`${key}_lastOptimizedAt`);
        const lastOptimizedHash = localStorage.getItem(`${key}_lastOptimizedHash`);
        const currentHash = generateTaskHash(allTasks);

        if (lastOptimizedAt && lastOptimizedHash && currentHash !== lastOptimizedHash) {
            // Tasks updated, re-optimization recommended
            indicatorContainer.innerHTML = `<span class="reoptimize-badge outdated"><i class="fa-solid fa-triangle-exclamation"></i> Tasks updated. Re-optimize?</span>`;
        } else if (lastOptimizedAt) {
            // Optimized recently
            const minutesAgo = Math.round((Date.now() - lastOptimizedAt) / (60 * 1000));
            indicatorContainer.innerHTML = `<span class="reoptimize-badge up-to-date"><i class="fa-solid fa-check-circle"></i> Optimized ${minutesAgo} minutes ago</span>`;
        } else {
            // Never optimized
            indicatorContainer.innerHTML = '';
        }
    }
    // -----------------------------------------








    const list = document.getElementById('task-list');
    const archiveSection = document.getElementById('archive-section');
    const archiveList = document.getElementById('archive-list');
    const archiveCount = document.getElementById('archive-count');

    list.innerHTML = '';
    if (archiveList) archiveList.innerHTML = '';
    
    // --- Smart Optimization Caching Check ---
    const cacheKey = `${key}_optimized`;
    const cachedOptimization = localStorage.getItem(cacheKey);
    const summaryCard = document.getElementById('ai-summary-card');
    const summaryText = document.getElementById('ai-summary-text');

    if (cachedOptimization) {
        try {
            const optData = JSON.parse(cachedOptimization);
            
            // 1. Show Summary
            if (optData.summary) {
                // Remove markdown characters (*, **, `) for clean text
                summaryText.textContent = optData.summary.replace(/[*`]/g, '');
                summaryCard.classList.remove('hidden');
            }

            // 2. Reorder & Enhance Tasks
            const taskMap = new Map(allTasks.map(t => [String(t.id), t]));
            const reordered = [];

            optData.reorderedTasks.forEach(optTask => {
                const original = taskMap.get(String(optTask.id));
                if (original) {
                    original.priority = optTask.priority; // Attach priority
                    original.reason = optTask.reason;     // Attach reason
                    original.confidence = optTask.confidence; // Attach confidence
                    reordered.push(original);
                    taskMap.delete(String(optTask.id));
                }
            });

            // Append any new tasks that weren't in the optimization result
            taskMap.forEach(t => reordered.push(t));
            allTasks = reordered;

        } catch (e) {
            console.error("Cache Error", e);
            localStorage.removeItem(cacheKey);
        }
    } else {
        summaryCard.classList.add('hidden');
    }
    // ----------------------------------------

    // Capture total before filtering to distinguish empty states
    const totalTasks = allTasks.length;

    // Update Analytics Panel
    updateAnalytics();

    // --- 1. Prepare Archive Data (Completed Tasks) ---
    // We derive this from allTasks so the "Active" status filter doesn't hide them.
    let completedTasks = allTasks.filter(t => t.status === 'completed');
    
    // Apply Search to Archive (Manual application to keep Archive visible but searchable)
    const searchEl = document.getElementById('task-search');
    if (searchEl) {
        const term = searchEl.value.toLowerCase().trim();
        if (term) {
            completedTasks = completedTasks.filter(t => {
                const title = (t.title || '').toLowerCase();
                const desc = (t.description || '').toLowerCase();
                const prio = (t.priority || '').toLowerCase();
                const id = String(t.id);
                return title.includes(term) || desc.includes(term) || prio.includes(term) || id.includes(term);
            });
        }
    }

    // --- 2. Prepare Main List Data (Active Tasks) ---
    // Apply all UI filters (Status, Priority, Risk, Sort)
    const filteredTasks = applyFiltersAndSort(allTasks);
    
    // Ensure Main List only shows Active tasks (Requirement: Active tasks render normally)
    const activeTasks = filteredTasks.filter(t => t.status !== 'completed');

    // --- Render Active Tasks ---
    if (activeTasks.length === 0) {
        if (totalTasks > 0 && completedTasks.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="height: 150px;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <p>No matching tasks found.</p>
                </div>
            `;
        } else {
            list.innerHTML = `
                <div class="empty-state" style="height: 150px;">
                    <i class="fa-solid fa-check-circle"></i>
                    <p>No active tasks.</p>
                </div>
            `;
        }
    }
    
    // Helper to create task card
    const createCard = (task, isCompleted) => {
        const item = document.createElement('div');
        
        let css = `
            background: rgba(255, 255, 255, 0.45);
            border-radius: 12px;
            padding: 1rem;
            margin-bottom: 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.02);
        `;
        
        if (isCompleted) {
            css += `opacity: 0.75; background: rgba(240, 240, 240, 0.3); border-color: transparent;`;
        }
        item.style.cssText = css;
        
        // Content Container
        const content = document.createElement('div');
        content.style.cssText = `flex: 1; ${isCompleted ? 'color: var(--text-muted);' : ''}`;
        
        // Priority Badge Logic
        let badgeHTML = '';
        if (task.priority && !isCompleted) {
            const pClass = `priority-${task.priority.toLowerCase()}`;
            badgeHTML = `<span class="priority-badge ${pClass}">${task.priority}</span>`;
        }

        // Confidence Badge Logic
        let confidenceHTML = '';
        if (task.confidence && !isCompleted) {
            let color = '#ef4444'; // red
            if (task.confidence >= 85) color = '#10b981'; // green
            else if (task.confidence >= 70) color = '#f59e0b'; // orange
            
            confidenceHTML = `
                <span style="
                    font-size: 0.7rem;
                    padding: 0.2rem 0.6rem;
                    border-radius: 12px;
                    font-weight: 700;
                    background: ${color}15;
                    color: ${color};
                    border: 1px solid ${color}40;
                    margin-left: 0.5rem;
                    vertical-align: middle;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    animation: badge-pulse 2s infinite ease-in-out;
                " title="AI Confidence Score">
                    <i class="fa-solid fa-chart-line"></i> ${task.confidence}%
                </span>
            `;
        }

        // Risk Badge Logic
        let riskHTML = '';
        if (task.deadline && !isCompleted) {
            const risk = calculateRisk(task.deadline);
            if (risk) {
                riskHTML = `<span class="risk-badge ${risk.class}">${risk.label}</span>`;
                item.classList.add(risk.cardClass);
            }
        }

        const h4 = document.createElement('h4');
        h4.innerHTML = `${task.title} ${badgeHTML} ${confidenceHTML}`;
        h4.style.cssText = 'color: var(--text-dark); font-size: 1rem; margin-bottom: 0;';

        const taskId = document.createElement('div');
        taskId.textContent = `ID: ${task.id}`;
        taskId.classList.add('task-id');

        
        const p = document.createElement('p');
        p.textContent = task.description || '';
        p.style.cssText = 'font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;';
        
        const meta = document.createElement('small');
        meta.style.cssText = 'font-size: 0.75rem; color: var(--primary-color); display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;';
        
        if (isCompleted) {
            const dateStr = task.completedAt ? new Date(task.completedAt).toLocaleDateString() : 'Unknown date';
            meta.innerHTML = `<i class="fa-solid fa-check-double"></i> Completed: ${dateStr}`;
            meta.style.color = 'var(--text-muted)';
        } else {
            meta.innerHTML = `<i class="fa-regular fa-clock"></i> ${task.deadline || 'No deadline'} ${riskHTML}`;
        }
        
        // AI Transparency Section
        let aiLogicHTML = '';
        if (!isCompleted && (task.confidence || task.reason)) {
            const riskData = calculateRisk(task.deadline);
            const urgencyCat = riskData ? riskData.category : 'General';
            const sysEnforced = task.deadline ? '<div class="sys-enforce-badge"><i class="fa-solid fa-shield-halved"></i> System Enforcement Applied</div>' : '';
            
            aiLogicHTML = `
                <div class="ai-logic-wrapper">
                    <button class="ai-logic-toggle" onclick="toggleAILogic(this)">
                        Show AI Logic <i class="fa-solid fa-chevron-down"></i>
                    </button>
                    <div class="ai-logic-content">
                        <div class="ai-logic-box">
                            <div class="ai-logic-grid">
                                <div class="logic-item">
                                    <label>Final Priority</label>
                                    <span>${task.priority || 'N/A'}</span>
                                </div>
                                <div class="logic-item">
                                    <label>Confidence</label>
                                    <span>${task.confidence || 0}%</span>
                                </div>
                                <div class="logic-item">
                                    <label>Urgency</label>
                                    <span>${urgencyCat}</span>
                                </div>
                            </div>
                            <div class="logic-reason">
                                <label>AI Explanation</label>
                                <p>${task.reason || 'No explanation provided.'}</p>
                            </div>
                            ${sysEnforced}
                        </div>
                    </div>
                </div>
            `;
        }

        content.appendChild(h4);
        content.appendChild(p);
        content.prepend(taskId);
        content.appendChild(meta);
        if (aiLogicHTML) content.insertAdjacentHTML('beforeend', aiLogicHTML);
        
        // Actions Container
        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 0.8rem; margin-left: 1rem;';
        
        if (isCompleted) {
            // Restore Button
            actions.innerHTML = `
                <button onclick="toggleTaskStatus(${task.id})" title="Restore Task" style="background: none; border: none; cursor: pointer; color: var(--primary-color); font-size: 1.1rem; transition: transform 0.2s;">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
                <button onclick="deleteTask(${task.id})" title="Delete Task" style="background: none; border: none; cursor: pointer; color: #ef4444; font-size: 1.1rem; transition: transform 0.2s;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
        } else {
            // Complete Button
            actions.innerHTML = `
                <button onclick="toggleTaskStatus(${task.id})" title="Mark Complete" style="background: none; border: none; cursor: pointer; color: #cbd5e1; font-size: 1.3rem; transition: color 0.2s;">
                    <i class="fa-solid fa-circle-check"></i>
                </button>
                <button onclick="deleteTask(${task.id})" title="Delete Task" style="background: none; border: none; cursor: pointer; color: #ef4444; font-size: 1.1rem; transition: transform 0.2s;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
        }
        
        item.appendChild(content);
        item.appendChild(actions);
        return item;
    };

    // Render Active Loop
    activeTasks.forEach(task => list.appendChild(createCard(task, false)));

    // --- Render Archive ---
    if (archiveSection) {
        if (completedTasks.length > 0) {
            archiveSection.classList.remove('hidden');
            if (archiveCount) archiveCount.textContent = `(${completedTasks.length})`;
            completedTasks.forEach(task => archiveList.appendChild(createCard(task, true)));
        } else {
            archiveSection.classList.add('hidden');
        }
    }
}

/**
 * Updates the Analytics Panel with current stats
 */
function updateAnalytics() {
    const key = getStorageKey();
    if (!key) return;

    const tasks = JSON.parse(localStorage.getItem(key) || '[]');
    
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const activeTasks = tasks.filter(t => t.status !== 'completed');
    
    // Critical: Priority is Critical AND not completed
    const critical = activeTasks.filter(t => t.priority === 'Critical').length;
    
    // Overdue: Deadline passed AND not completed
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overdue = activeTasks.filter(t => {
        if (!t.deadline) return false;
        const [y, m, d] = t.deadline.split('-').map(Number);
        const target = new Date(y, m - 1, d);
        return target < today;
    }).length;
    
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    
    setVal('stat-total', total);
    setVal('stat-critical', critical);
    setVal('stat-overdue', overdue);
    setVal('stat-completed', completed);
    setVal('stat-success', `${percentage}%`);
}

/**
 * Optimizes tasks using AI Backend
 * Clears previous AI results, calls backend, applies new results.
 */
async function optimizeTasks() {
    const key = getStorageKey();
    if (!key) return;

    const tasks = JSON.parse(localStorage.getItem(key) || '[]');
    if (tasks.length === 0) return showToast("Please add tasks before optimizing.", "error");

    // -- UI Loading State & Prevent Rapid Clicks --
    const optimizeButton = document.querySelector('.btn-optimize');
    if (optimizeButton.disabled) return;  // Prevent rapid clicks
    optimizeButton.disabled = true;
    const originalText = optimizeButton.innerHTML;

    // -- Clear Previous AI Results --
    const summaryCard = document.getElementById('ai-summary-card');
    summaryCard.classList.add('hidden');
    const summaryText = document.getElementById('ai-summary-text');
    summaryText.textContent = '';

    // Clear priority and reason from tasks
    tasks.forEach(task => {
        delete task.priority;
        delete task.reason;
        delete task.confidence;
    });

    // Clear cache so renderTasks doesn't re-apply old optimization immediately
    const cacheKey = `${key}_optimized`;
    localStorage.removeItem(cacheKey);

    // Re-render without AI data
    localStorage.setItem(key, JSON.stringify(tasks));
    renderTasks();

    // -- Call AI Backend --
    optimizeButton.innerHTML = '<i class="fa-solid fa-brain fa-spin"></i> AI Processing...';

    // --- UI Loading State ---
    const loader = document.getElementById('ai-loading');
    loader.classList.remove('hidden');

    // Filter active tasks to reduce payload
    const activeTasksPayload = tasks.filter(t => t.status === 'active');

    try {
        const response = await fetch('/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                department: localStorage.getItem('currentDepartment'),
                subDepartment: localStorage.getItem('currentSubDepartment'),
                tasks: activeTasksPayload
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Optimization failed');
        }

        const data = await response.json();

        // Save to Cache
        localStorage.setItem(`${key}_lastOptimizedAt`, Date.now());
        localStorage.setItem(`${key}_lastOptimizedHash`, generateTaskHash(tasks));




        localStorage.setItem(cacheKey, JSON.stringify(data));

        // Apply Results
        renderTasks();

    } catch (error) {
        console.error(error);
        showToast(`AI Optimization failed: ${error.message}`, "error");
    } finally {
        // Restore button state
        optimizeButton.innerHTML = originalText;
        optimizeButton.disabled = false;
        
        loader.classList.add('hidden');
    }
}

function addTask(event) {
    event.preventDefault();
    const titleInput = document.getElementById('task-title');
    const descInput = document.getElementById('task-desc');
    const dateInput = document.getElementById('task-deadline');
    
    const title = titleInput.value.trim();
    if (!title) return;
    
    const newTask = {
        id: Date.now(),
        title: title,
        description: descInput.value.trim(),
        deadline: dateInput.value,
        status: 'active'
    };
    
    const key = getStorageKey();
    if (key) {
        const tasks = JSON.parse(localStorage.getItem(key) || '[]');
        tasks.push(newTask);
        localStorage.setItem(key, JSON.stringify(tasks));
        
        // Clear Optimization Cache on new task
        localStorage.removeItem(`${key}_optimized`);
        
        renderTasks();
    }
    
    event.target.reset();
}

/**
 * Deletes a task by ID
 */
function deleteTask(id) {
    const key = getStorageKey();
    if (!key) return;
    
    let tasks = JSON.parse(localStorage.getItem(key) || '[]');
    tasks = tasks.filter(t => t.id !== id);
    localStorage.setItem(key, JSON.stringify(tasks));
    
    // Clear Optimization Cache on delete
    localStorage.removeItem(`${key}_optimized`);
    
    renderTasks();
}

/**
 * Toggles task completion status
 */
function toggleTaskStatus(id) {
    const key = getStorageKey();
    if (!key) return;
    
    const tasks = JSON.parse(localStorage.getItem(key) || '[]');
    const task = tasks.find(t => t.id === id);
    if (task) {
        if (task.status === 'active') {
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
        } else {
            task.status = 'active';
            delete task.completedAt;
        }
        localStorage.setItem(key, JSON.stringify(tasks));
        
        // Clear Optimization Cache on status change
        localStorage.removeItem(`${key}_optimized`);
        
        renderTasks();
    }
}

/* --- Context Switching --- */

function showSwitchModal() {
    document.getElementById('context-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('context-modal').classList.add('hidden');
}

function confirmSwitch() {
    closeModal();
    
    // Clear session
    localStorage.removeItem('currentDepartment');
    localStorage.removeItem('currentSubDepartment');
    
    updateContextButtonVisibility();
    
    // Reset state
    selectedDepartment = null;
    selectedSubOption = null;
    
    // Transition Elements
    const dashboardView = document.getElementById('dashboard-view');
    const landingView = document.getElementById('landing-view');
    
    // Fade out dashboard
    dashboardView.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    dashboardView.style.opacity = '0';
    dashboardView.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        dashboardView.classList.add('hidden');
        landingView.classList.remove('hidden');
        
        // Reset landing view styles for fade in
        landingView.style.opacity = '0';
        landingView.style.transform = 'translateY(20px)';
        
        // Trigger reflow
        void landingView.offsetWidth;
        
        landingView.style.opacity = '1';
        landingView.style.transform = 'translateY(0)';
        
        // Reset UI elements
        const startBtn = document.getElementById('start-btn');
        startBtn.disabled = true;
        startBtn.textContent = 'Start Session';
        
        document.querySelectorAll('.dept-card').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.sub-option').forEach(o => o.classList.remove('selected'));
        
    }, 300);
}

/**
 * Updates visibility of the Switch Context button based on session state
 */
function updateContextButtonVisibility() {
    const switchBtn = document.querySelector('.nav-actions button');
    if (!switchBtn) return;

    const isActive = localStorage.getItem('currentDepartment') && localStorage.getItem('currentSubDepartment');
    
    if (isActive) {
        switchBtn.style.display = 'inline-block';
    } else {
        switchBtn.style.display = 'none';
    }
}

// Initialize visibility on load
document.addEventListener('DOMContentLoaded', updateContextButtonVisibility);

/**
 * Generates a structured professional PDF report using jsPDF
 */
function exportReportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // --- Data Gathering ---
    const dept = localStorage.getItem('currentDepartment') || 'General';
    const sub = localStorage.getItem('currentSubDepartment') || 'Tasks';
    const key = `${dept}-${sub}`;
    let tasks = JSON.parse(localStorage.getItem(key) || '[]');
    
    // --- Merge AI Data (Optimization Cache) ---
    const cacheKey = `${key}_optimized`;
    let summary = null;
    try {
        const cachedData = JSON.parse(localStorage.getItem(cacheKey));
        if (cachedData) {
            if (cachedData.summary) summary = cachedData.summary;
            
            // Merge AI fields
            const taskMap = new Map(tasks.map(t => [String(t.id), t]));
            const reordered = [];

            if (cachedData.reorderedTasks) {
                cachedData.reorderedTasks.forEach(optTask => {
                    const original = taskMap.get(String(optTask.id));
                    if (original) {
                        original.priority = optTask.priority;
                        original.reason = optTask.reason;
                        original.confidence = optTask.confidence;
                        reordered.push(original);
                        taskMap.delete(String(optTask.id));
                    }
                });
            }
            // Add remaining
            taskMap.forEach(t => reordered.push(t));
            tasks = reordered;
        }
    } catch (e) { console.error("Summary/Merge parse error", e); }

    // --- Apply Filters (Respect UI State) ---
    tasks = applyFiltersAndSort(tasks);

    // --- PDF Configuration ---
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let y = margin;

    // Helper: Check Page Break
    const checkPageBreak = (heightNeeded) => {
        if (y + heightNeeded > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }
    };

    // --- Header Section ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(124, 58, 237); // Brand Primary
    doc.text("Av_eSAFE", margin, y);
    
    y += 7;
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139); // Muted text
    doc.text("AI Agentic Task Manager", margin, y);

    y += 12;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    const dateStr = new Date().toLocaleString();
    doc.text(`Department: ${dept} > ${sub}`, margin, y);
    doc.text(`Generated: ${dateStr}`, pageWidth - margin - doc.getTextWidth(`Generated: ${dateStr}`), y);
    
    y += 15;

    // --- Executive Summary ---
    if (summary) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(124, 58, 237);
        doc.text("Executive Summary", margin, y);
        y += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(50, 50, 50);
        
        // Clean summary text
        const cleanSummary = summary.replace(/[*`#]/g, '');
        const splitSummary = doc.splitTextToSize(cleanSummary, contentWidth);
        doc.text(splitSummary, margin, y);
        
        y += (splitSummary.length * 5) + 10;
    }

    // --- Task Priority Report ---
    checkPageBreak(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(124, 58, 237);
    doc.text("Task Priority Report", margin, y);
    y += 10;

    // Filter info
    const statusFilter = document.getElementById('filter-status')?.value || 'all';
    if (statusFilter !== 'all') {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`(Filtered by Status: ${statusFilter})`, margin + 50, y - 10);
    }

    if (tasks.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("No tasks match the current filters.", margin, y);
    } else {
        tasks.forEach((task) => {
            // Use shared calculateRisk function for consistency
            let riskLabel = "Stable";
            let riskColor = [22, 163, 74]; // Green

            // 1. Calculate Date-based Risk (Default)
            if (task.deadline) {
                const risk = calculateRisk(task.deadline);
                if (risk) {
                    // Remove emojis for PDF compatibility
                    riskLabel = risk.label.split('•')[0].replace(/[^\w\s]/gi, '').trim();
                    
                    if (risk.category === "Overdue" || risk.category === "High Urgency") {
                        riskColor = [220, 38, 38]; // Red
                    } else if (risk.category === "Moderate Urgency") {
                        riskColor = [234, 88, 12]; // Orange
                    }
                }
            }

            // 2. Override with AI Priority if available
            if (task.priority) {
                riskLabel = task.priority;
                
                if (task.priority === 'Critical') riskColor = [220, 38, 38]; // Red
                else if (task.priority === 'High') riskColor = [234, 88, 12]; // Orange
                else if (task.priority === 'Medium') riskColor = [202, 138, 4]; // Dark Yellow
                else riskColor = [22, 163, 74]; // Green
            }

            // Prepare Data
            const priority = task.priority || "Unassigned";
            const confidence = task.confidence ? `${task.confidence}%` : "N/A";
            const title = task.title || "Untitled Task";
            const desc = task.description || "No description provided.";
            const reason = task.reason ? `AI Insight: ${task.reason}` : "";
            
            // Estimate height
            const descLines = doc.splitTextToSize(desc, contentWidth - 5);
            const reasonLines = reason ? doc.splitTextToSize(reason, contentWidth - 5) : [];
            const blockHeight = 25 + (descLines.length * 4) + (reasonLines.length * 4);

            checkPageBreak(blockHeight);

            // Task Header
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(0);
            doc.text(title, margin, y);
            
            // Task Meta
            y += 5;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(80);
            
            const metaY = y;
            doc.text(`ID: ${task.id}`, margin, metaY);
            doc.text(`Priority: ${priority}`, margin + 40, metaY);
            doc.text(`Confidence: ${confidence}`, margin + 80, metaY);
            
            // Risk Color
            doc.setTextColor(riskColor[0], riskColor[1], riskColor[2]);
            
            doc.text(`Risk: ${riskLabel}`, margin + 120, metaY);

            // Description
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100);
            doc.text(descLines, margin + 2, y);
            y += (descLines.length * 4);

            // AI Reason
            if (reasonLines.length > 0) {
                y += 2;
                doc.setFont("helvetica", "italic");
                doc.setTextColor(124, 58, 237); // Purple for AI
                doc.text(reasonLines, margin + 2, y);
                y += (reasonLines.length * 4);
            }
            
            y += 4;
            
            // Divider
            doc.setDrawColor(240);
            doc.line(margin, y, pageWidth - margin, y);
            y += 6;
        });
    }

    // --- Save ---
    const filename = `Av_eSAFE_Report_${dept}_${sub}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
}

/* =========================================
   UI Helpers (Toast & Loading)
   ========================================= */

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '<i class="fa-solid fa-circle-info" style="color: #7c3aed;"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>';

    toast.innerHTML = `${icon} <span style="font-weight: 500; color: #334155;">${message}</span>`;
    container.appendChild(toast);

    // Remove after 4 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showLoadingPopup(message, subtext = null, iconType = 'spinner') {
    const modal = document.getElementById('loading-modal');
    const text = document.getElementById('loading-text');
    const subtextEl = document.getElementById('loading-subtext');
    const iconWrapper = document.getElementById('loading-icon-wrapper');

    if (modal && text && iconWrapper) {
        text.textContent = message;
        
        if (subtext) {
            subtextEl.textContent = subtext;
            subtextEl.style.display = 'block';
        } else {
            subtextEl.style.display = 'none';
        }

        if (iconType === 'brain') {
            iconWrapper.innerHTML = '<i class="fa-solid fa-brain fa-spin" style="font-size: 3rem; color: #7c3aed;"></i>';
        } else {
            iconWrapper.innerHTML = '<div class="spinner" style="width: 50px; height: 50px; border: 4px solid #f3f3f3; border-top: 4px solid #7c3aed; border-radius: 50%; animation: spin 1s linear infinite;"></div>';
        }

        modal.classList.remove('hidden');
    }
}

function hideLoadingPopup() {
    const modal = document.getElementById('loading-modal');
    if (modal) modal.classList.add('hidden');
}

/* =========================================
   File Import & Parsing Logic
   ========================================= */

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const fileExt = fileName.split('.').pop().toLowerCase();

    // Show loading popup
    showLoadingPopup("Reading document...");
    
    try {
        let extractedText = "";

        if (fileExt === 'xlsx' || fileExt === 'xls') {
            extractedText = await parseExcel(file);
        } else if (fileExt === 'docx') {
            extractedText = await parseWord(file);
        } else if (fileExt === 'pdf') {
            extractedText = await parsePDF(file);
        } else {
            showToast("Unsupported file format. Please upload .xlsx, .docx, or .pdf", "error");
            hideLoadingPopup();
            return;
        }

        if (extractedText.trim().length > 0) {
            showLoadingPopup("Analyzing your tasks with AI...", "It might take few mins please wait", "brain");
            await analyzeTextAndCreateTasks(extractedText);
        } else {
            showToast("Could not extract any text from the document.", "error");
            hideLoadingPopup();
        }

    } catch (error) {
        console.error("Error parsing file:", error);
        showToast("Failed to read the file.", "error");
        hideLoadingPopup();
    } finally {
        // Reset input and button
        event.target.value = ''; 
    }
}

// --- Excel Parser (SheetJS) ---
function parseExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                let textResults = [];
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    const sheetText = json.map(row => row.join(" ")).join("\n");
                    textResults.push(`Sheet: ${sheetName}\n${sheetText}`);
                });
                
                resolve(textResults.join("\n\n"));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// --- Word Parser (Mammoth) ---
function parseWord(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target.result;
            mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                .then(result => resolve(result.value))
                .catch(reject);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// --- PDF Parser (PDF.js) ---
async function parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += `Page ${i}:\n${pageText}\n\n`;
    }
    
    return fullText;
}

// --- AI Integration ---
async function analyzeTextAndCreateTasks(text) {
    try {
        const response = await fetch('/parse-tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        if (!response.ok) throw new Error('AI Parsing failed');

        const data = await response.json();
        
        if (data.tasks && Array.isArray(data.tasks)) {
            const key = getStorageKey();
            if (!key) return;
            
            const currentTasks = JSON.parse(localStorage.getItem(key) || '[]');
            
            let addedCount = 0;
            data.tasks.forEach(t => {
                const newTask = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    title: t.title,
                    description: t.description || '',
                    deadline: t.deadline || '',
                    status: 'active'
                };
                currentTasks.push(newTask);
                addedCount++;
            });
            
            localStorage.setItem(key, JSON.stringify(currentTasks));
            localStorage.removeItem(`${key}_optimized`); // Clear cache
            renderTasks();
            
            hideLoadingPopup();
            showToast(`Successfully imported ${addedCount} tasks.`, "success");
        } else {
            hideLoadingPopup();
            showToast("AI could not identify any tasks.", "error");
        }

    } catch (error) {
        console.error("AI Task Extraction Error:", error);
        hideLoadingPopup();
        showToast(`Failed to analyze document: ${error.message}`, "error");
    }
}