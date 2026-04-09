const API_BASE = '/api';

// State
let state = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user')) || null,
    projects: [],
    users: [],
    currentProject: null,
    isScrolling: false,
    scrollIntervals: []
};

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    app: document.getElementById('app-view')
};
const pages = {
    dashboard: document.getElementById('dashboard'),
    kanban: document.getElementById('kanban'),
    members: document.getElementById('members'),
    reports: document.getElementById('reports'),
    feedbacks: document.getElementById('feedbacks'),
    settingsPage: document.getElementById('settings-page')
};
const els = {
    loginForm: document.getElementById('login-form'),
    usernameInput: document.getElementById('username'),
    passwordInput: document.getElementById('password'),
    loginError: document.getElementById('login-error'),
    currentUsername: document.getElementById('current-username'),
    currentRole: document.getElementById('current-role'),
    logoutBtn: document.getElementById('logout-btn'),
    navItems: document.querySelectorAll('.nav-item'),
    projectsGrid: document.getElementById('projects-grid'),
    projectSelector: document.getElementById('project-selector'),
    kanbanCols: {
        TODO: document.getElementById('col-TODO'),
        IN_PROGRESS: document.getElementById('col-IN_PROGRESS'),
        DONE: document.getElementById('col-DONE')
    },
    usersTableBody: document.querySelector('#users-table tbody'),
    modalOverlay: document.getElementById('modal-overlay'),
    createProjectBtn: document.getElementById('create-project-btn'),
    createTaskBtn: document.getElementById('create-task-btn'),
    createUserBtn: document.getElementById('create-user-btn'),
    createFeedbackBtn: document.getElementById('create-feedback-btn'),
    feedbacksTableBody: document.querySelector('#feedbacks-table tbody'),
    settingsForm: document.getElementById('settings-form'),
    setSoftwareName: document.getElementById('set-software-name')
};

// --- Initialization ---
function init() {
    if (state.token && state.user) {
        showApp();
    } else {
        showLogin();
    }
    setupEventListeners();
}

function setupEventListeners() {
    // Auth
    els.loginForm.addEventListener('submit', handleLogin);
    els.logoutBtn.addEventListener('click', handleLogout);

    // Navigation
    els.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.target;

            // 权限拦截逻辑
            if (target === 'settings-page') {
                if (state.user.role !== 'PM' && state.user.username !== 'admin') {
                    alert('权限不足：只有管理员或项目经理可以访问系统设置');
                    return;
                }
            }

            els.navItems.forEach(nav => nav.classList.remove('active'));
            e.currentTarget.classList.add('active');
            Object.values(pages).forEach(page => page.classList.remove('active'));
            pages[target].classList.add('active');
            
            if (target === 'dashboard') loadProjects();
            if (target === 'kanban') loadKanban();
            if (target === 'members') loadUsers();
            if (target === 'reports') initReportView();
            if (target === 'feedbacks') loadFeedbacks();
            if (target === 'settings-page') loadSettingsToForm();
        });
    });

    if (els.settingsForm) {
        els.settingsForm.addEventListener('submit', handleSettingsSubmit);
    }

    // Modals
    els.createProjectBtn.addEventListener('click', () => showModal('project'));
    els.createTaskBtn.addEventListener('click', () => showModal('task'));
    els.createUserBtn.addEventListener('click', () => showModal('user'));
    if (els.createFeedbackBtn) els.createFeedbackBtn.addEventListener('click', () => showModal('feedback'));

    // Kanban Project Selector & Navigation
    els.projectSelector.addEventListener('change', (e) => {
        state.currentProject = e.target.value;
        if (state.currentProject) loadTasks(state.currentProject);
    });
    
    const navigateProject = (step) => {
        const select = els.projectSelector;
        if (!select || !select.options || select.options.length <= 1) return;
        const currentIdx = select.selectedIndex;
        let nextIdx = currentIdx + step;
        
        const firstValidIdx = select.options[0].value === "" ? 1 : 0;
        
        if (nextIdx < firstValidIdx) nextIdx = select.options.length - 1;
        if (nextIdx >= select.options.length) nextIdx = firstValidIdx;
        
        select.selectedIndex = nextIdx;
        state.currentProject = select.options[nextIdx].value;
        if (state.currentProject) loadTasks(state.currentProject);
    };

    const prevBtn = document.getElementById('prev-project-btn');
    const nextBtn = document.getElementById('next-project-btn');
    if (prevBtn) prevBtn.addEventListener('click', () => navigateProject(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateProject(1));

    // Fullscreen and Scroll
    const enterFsBtn = document.getElementById('enter-fullscreen-btn');
    const toggleScrollBtn = document.getElementById('toggle-scroll-btn');

    if (enterFsBtn) enterFsBtn.addEventListener('click', toggleFullscreen);
    if (toggleScrollBtn) toggleScrollBtn.addEventListener('click', toggleAutoScroll);

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Drag and Drop
    Object.values(els.kanbanCols).forEach(col => {
        col.addEventListener('dragover', e => {
            e.preventDefault();
            col.style.background = 'rgba(0,0,0,0.05)';
        });
        col.addEventListener('dragleave', e => {
            col.style.background = 'transparent';
        });
        col.addEventListener('drop', handleDrop);
    });
}

// --- Utils ---
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'API Error');
        return data;
    } catch (err) {
        alert(err.message);
        throw err;
    }
}

function updateAccessControl() {
    if (state.user.role === 'PM' || state.user.username === 'admin') {
        document.body.classList.add('is-pm');
    } else {
        document.body.classList.remove('is-pm');
    }
}

// --- Auth ---
function showLogin() {
    views.app.classList.remove('active');
    views.login.classList.add('active');
}

function showApp() {
    views.login.classList.remove('active');
    views.app.classList.add('active');
    els.currentUsername.textContent = state.user.username;
    els.currentRole.textContent = state.user.role;
    updateAccessControl();
    loadProjects();
    loadSettings();
}

async function loadSettings() {
    const settings = await apiCall('/settings');
    if (settings.software_name) {
        document.title = `${settings.software_name} - 敏捷项目管理`;
        const logoText = document.querySelector('.brand h2');
        if (logoText) logoText.textContent = settings.software_name;
        const loginHeader = document.querySelector('.login-box p');
        if (loginHeader) loginHeader.textContent = `登录到${settings.software_name}系统`;
    }
}

async function loadSettingsToForm() {
    const settings = await apiCall('/settings');
    if (settings.software_name) {
        els.setSoftwareName.value = settings.software_name;
    }
    // 强制显示包含软件名称的容器
    const nameGroup = els.setSoftwareName.closest('.input-group');
    if (nameGroup) nameGroup.style.display = 'block';
}

async function handleSettingsSubmit(e) {
    e.preventDefault();
    const software_name = els.setSoftwareName.value;
    try {
        await apiCall('/settings', 'PUT', { software_name });
        alert('系统设置已保存');
        loadSettings();
    } catch(err) {
        console.error(err);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    els.loginError.textContent = '';
    const username = els.usernameInput.value;
    const password = els.passwordInput.value;

    try {
        const data = await apiCall('/login', 'POST', { username, password });
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        showApp();
    } catch (err) {
        els.loginError.textContent = err.message;
    }
}

function handleLogout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showLogin();
}

// --- Dashboard & Projects ---
async function loadProjects() {
    state.projects = await apiCall('/projects');
    renderProjects();
    updateProjectSelector();
}

function editProject(id) {
    const p = state.projects.find(proj => proj.id === id);
    if (!p) return;
    renderProjectModal(p);
}

function renderProjects() {
    els.projectsGrid.innerHTML = state.projects.map(p => `
        <div class="project-card glass-panel" onclick="openProjectInKanban(${p.id})">
            <div class="card-header">
                <h3>${p.name}</h3>
                <div class="card-actions" style="display:flex;">
                    ${state.user.role === 'PM' || state.user.username === 'admin' ? `<button class="btn icon-btn" onclick="event.stopPropagation(); editProject(${p.id})" style="color:var(--primary-color)" title="编辑项目">✎</button>` : ''}
                    ${state.user.role === 'PM' ? `<button class="btn icon-btn" onclick="event.stopPropagation(); deleteProject(${p.id})" style="color:var(--danger-color)" title="删除项目">🗑️</button>` : ''}
                </div>
            </div>
            <p class="desc">${p.description || '无描述'}</p>
            <div class="project-meta" style="flex-wrap: wrap;">
                <span>👤 负责人: ${p.owner_name || '未知'}</span>
                <span>📅 ${new Date(p.created_at).toLocaleDateString()}</span>
                ${p.due_date ? `<span style="color:var(--danger-color)">🎯 截止: ${p.due_date}</span>` : ''}
            </div>
        </div>
    `).join('');
}

async function deleteProject(id) {
    if(!confirm('确定删除该项目及其所有任务吗？')) return;
    await apiCall(`/projects/${id}`, 'DELETE');
    loadProjects();
}

function openProjectInKanban(id) {
    els.navItems.forEach(nav => nav.classList.remove('active'));
    document.querySelector('[data-target="kanban"]').classList.add('active');
    Object.values(pages).forEach(page => page.classList.remove('active'));
    pages.kanban.classList.add('active');
    
    state.currentProject = id;
    els.projectSelector.value = id;
    loadKanban();
}

// --- Kanban ---
function updateProjectSelector() {
    els.projectSelector.innerHTML = '<option value="">选择项目...</option>' + 
        '<option value="all">全部</option>' +
        state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    if (state.currentProject) els.projectSelector.value = state.currentProject;
}

async function loadKanban() {
    if (!state.projects.length) await loadProjects();
    if (!state.currentProject && state.projects.length > 0) {
        state.currentProject = 'all';
        els.projectSelector.value = state.currentProject;
    }
    if (state.currentProject) {
        loadTasks(state.currentProject);
    }
}

// --- Fullscreen & Scroll Logic ---
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            alert(`无法进入全屏: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

function handleFullscreenChange() {
    const isFs = !!document.fullscreenElement;
    document.body.classList.toggle('fullscreen-active', isFs);
    
    // 更新按钮文字
    const fsBtn = document.getElementById('enter-fullscreen-btn');
    if (fsBtn) {
        fsBtn.textContent = isFs ? '🚪 退出全屏' : '📺 全屏展示';
    }

    // 全屏时隐藏/显示部分元素
    const kanbanHeaderTitle = document.querySelector('#kanban .page-header h1');
    if (isFs) {
        apiCall('/settings').then(settings => {
            kanbanHeaderTitle.textContent = `${settings.software_name || 'TaskManage'} - 任务看板`;
        });
    } else {
        kanbanHeaderTitle.textContent = `任务看板`;
    }
}

function toggleAutoScroll() {
    state.isScrolling = !state.isScrolling;
    const btn = document.getElementById('toggle-scroll-btn');
    btn.textContent = state.isScrolling ? '🔄 自动滚动: 开' : '🔄 自动滚动: 关';
    btn.classList.toggle('primary', state.isScrolling);

    if (state.isScrolling) {
        startAutoScroll();
    } else {
        stopAutoScroll();
    }
}

function startAutoScroll() {
    stopAutoScroll(); 
    state.isScrolling = true;
    const columns = [els.kanbanCols.TODO, els.kanbanCols.IN_PROGRESS, els.kanbanCols.DONE];
    
    columns.forEach(col => {
        let scrollAccumulator = 0;
        const scrollStep = 0.6; 

        const scrollFunc = () => {
            if (!state.isScrolling) return;
            
            if (col.scrollHeight <= col.clientHeight) {
                requestAnimationFrame(scrollFunc);
                return;
            }

            if (col.matches(':hover')) {
                requestAnimationFrame(scrollFunc);
                return;
            }

            scrollAccumulator += scrollStep;
            if (scrollAccumulator >= 1) {
                const step = Math.floor(scrollAccumulator);
                col.scrollTop += step;
                scrollAccumulator -= step;
            }
            
            if (col.scrollTop + col.clientHeight >= col.scrollHeight - 2) {
                col.scrollTop = 0;
            }
            requestAnimationFrame(scrollFunc);
        };
        requestAnimationFrame(scrollFunc);
    });
}

function stopAutoScroll() {
    state.isScrolling = false;
    const btn = document.getElementById('toggle-scroll-btn');
    if (btn) {
        btn.textContent = '🔄 自动滚动: 关';
        btn.classList.remove('primary');
    }
}

async function loadTasks(projectId) {
    const tasks = await apiCall(`/projects/${projectId}/tasks`);
    
    // Clear cols
    Object.values(els.kanbanCols).forEach(col => col.innerHTML = '');
    let counts = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };

    tasks.forEach(t => {
        const status = t.status || 'TODO';
        counts[status]++;
        
        let warningClass = '';
        let dueBadgeHtml = '';
        if (t.due_date && status !== 'DONE') {
            const todayStr = new Date().toLocaleDateString('en-CA'); // Get local date in YYYY-MM-DD
            const dueObj = new Date(t.due_date);
            // Ensure no timezone shift issue by setting hours to 0
            dueObj.setHours(0,0,0,0);
            const todayObj = new Date(todayStr);
            todayObj.setHours(0,0,0,0);
            
            const diffDays = Math.ceil((dueObj - todayObj) / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) {
                warningClass = 'task-overdue';
                dueBadgeHtml = `<span class="due-badge bg-danger">已逾期</span>`;
            } else if (diffDays <= 2) {
                warningClass = 'task-warning';
                dueBadgeHtml = `<span class="due-badge bg-warn">即将到期</span>`;
            }
        }

        const card = document.createElement('div');
        card.className = `task-card ${warningClass}`;
        
        const canDrag = state.user.role === 'PM' || state.user.id === t.assignee_id;
        card.draggable = canDrag;
        if (!canDrag) {
            card.style.cursor = 'default';
        }
        
        card.dataset.id = t.id;
        card.dataset.task = JSON.stringify(t);
        card.addEventListener('dragstart', handleDragStart);
        
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <span class="task-title" style="display:block; margin-bottom: 4px;">
                        ${t.title}
                        ${state.currentProject === 'all' && t.project_name ? `<span style="font-size: 0.85em; color: var(--text-secondary); font-weight: normal; margin-left: 6px;">[${t.project_name}]</span>` : ''}
                    </span>
                    ${t.due_date ? `<div style="font-size:0.9rem; color: var(--text-secondary); font-weight: 500; margin-bottom: 8px;">🕒 截止时限: ${t.due_date} ${dueBadgeHtml}</div>` : ''}
                </div>
                <div class="card-actions" style="display:flex;">
                    ${state.user.role === 'PM' ? `<button class="btn icon-btn pm-only" onclick="editTask(this)" style="color:var(--primary-color); font-size: 0.9em; padding:0 5px;" title="编辑任务">✎</button>` : ''}
                    ${state.user.role === 'PM' ? `<button class="btn icon-btn pm-only" onclick="deleteTask(${t.id})" style="color:var(--danger-color); font-size: 0.9em; padding:0;" title="删除">✕</button>` : ''}
                </div>
            </div>
            <p class="task-desc">${t.description || ''}</p>
            <div class="task-meta">
                <span>👤 ${t.assignee_name || '未分配'}</span>
                <span class="priority-tag p-${t.priority}">${t.priority}</span>
            </div>
        `;
        
        if (els.kanbanCols[status]) els.kanbanCols[status].appendChild(card);
    });

    document.querySelector('.todo-count').textContent = counts.TODO;
    document.querySelector('.inprog-count').textContent = counts.IN_PROGRESS;
    document.querySelector('.done-count').textContent = counts.DONE;
}

async function deleteTask(id) {
    if(!confirm('删除任务？')) return;
    await apiCall(`/tasks/${id}`, 'DELETE');
    loadTasks(state.currentProject);
}

// Drag & Drop
let draggedTaskId = null;

function handleDragStart(e) {
    draggedTaskId = e.target.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
}

async function handleDrop(e) {
    e.preventDefault();
    const colList = e.currentTarget;
    colList.style.background = 'transparent';
    
    const newStatus = colList.parentElement.dataset.status;
    if (!draggedTaskId || !newStatus) return;

    try {
        let payload = { status: newStatus };
        
        if (newStatus === 'DONE') {
            const result = prompt('请填写任务【完成情况】(必填):');
            if (!result || result.trim() === '') {
                alert('必须填写完成情况才能将任务标记为已完成');
                return;
            }
            payload.completion_result = result;
        }

        await apiCall(`/tasks/${draggedTaskId}/status`, 'PUT', payload);
        loadTasks(state.currentProject); 
    } catch (err) {
        console.error(err);
    }
    draggedTaskId = null;
}

// --- Members ---
async function loadUsers() {
    state.users = await apiCall('/users');
    els.usersTableBody.innerHTML = state.users.map(u => {
        const uRoleStyle = u.role === 'PM' ? 'background:rgba(139, 92, 246, 0.1); color:var(--accent-color)' : '';
        const safeU = JSON.stringify(u).replace(/"/g, '&quot;');
        
        return `
            <tr data-user="${safeU}">
                <td>#${u.id}</td>
                <td style="font-weight:600">${u.username}</td>
                <td><span class="badge" style="${uRoleStyle}">${u.role}</span></td>
                <td>
                   ${u.username !== 'admin' ? `
                   <button class="btn icon-btn" onclick="editUser(this)" style="color:var(--primary-color)" title="编辑成员">✎</button>
                   <button class="btn icon-btn" onclick="deleteUser(${u.id})" style="color:var(--danger-color)" title="删除">✕</button>
                   ` : '<span style="color:var(--text-secondary); font-size:0.85rem; font-weight:600;">内置账户 (无法操作)</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

// --- Modals ---
function renderProjectModal(project = null) {
    const isEdit = !!project;
    const name = project ? project.name.replace(/"/g, '&quot;') : '';
    const desc = project ? (project.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const ownerId = project ? project.created_by : state.user.id;
    
    let ownerSelectHtml = '';
    if (state.user.username === 'admin') {
        const pmOptions = state.users.filter(u => u.role === 'PM').map(u => 
            `<option value="${u.id}" ${u.id === ownerId ? 'selected' : ''}>${u.username} (PM)</option>`
        ).join('');
        const otherOptions = state.users.filter(u => u.role !== 'PM').map(u => 
            `<option value="${u.id}" ${u.id === ownerId ? 'selected' : ''}>${u.username}</option>`
        ).join('');
        
        ownerSelectHtml = `
            <div class="input-group">
                <label>项目负责人 (仅超级管理员可修改)</label>
                <select id="m-proj-owner" class="glass-select">
                    <optgroup label="项目经理">
                        ${pmOptions}
                    </optgroup>
                    <optgroup label="普通成员">
                        ${otherOptions}
                    </optgroup>
                </select>
            </div>
        `;
    }
    
    const html = `
        <h2>${isEdit ? '编辑项目' : '新建项目'}</h2>
        <div class="input-group">
            <label>项目名称</label>
            <input type="text" id="m-proj-name" value="${name}" required>
        </div>
        <div class="input-group">
            <label>项目计划内容</label>
            <textarea id="m-proj-desc" rows="3">${desc}</textarea>
        </div>
        <div class="input-group">
            <label>截止日期</label>
            <input type="date" id="m-proj-duedate" value="${project ? (project.due_date || '') : ''}">
        </div>
        ${ownerSelectHtml}
        
        <div class="input-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                <label style="margin:0;">项目成员</label>
                <div style="font-size:0.85em;">
                    <input type="checkbox" id="m-proj-select-all" onchange="toggleAllMembers(this)" style="cursor:pointer; vertical-align:middle; margin-right:4px;">
                    <label for="m-proj-select-all" style="display:inline; margin:0; cursor:pointer;">全选</label>
                </div>
            </div>
            <div id="m-proj-members-list" class="member-selector">
                ${state.users.filter(u => u.username !== 'admin').map(u => `
                    <div class="member-checkbox-item">
                        <input type="checkbox" id="member-${u.id}" value="${u.id}">
                        <label for="member-${u.id}">${u.username} (${u.role})</label>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="modal-actions">
            <button class="btn" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="submitProject(${project ? project.id : 'null'})">${isEdit ? '保存更改' : '创建'}</button>
        </div>
    `;

    if (!state.users.length) {
        apiCall('/users').then(users => {
            state.users = users;
            renderProjectModal(project);
        });
        return;
    }

    els.modalOverlay.innerHTML = `<div class="modal-content">${html}</div>`;
    els.modalOverlay.classList.add('active');

    // If edit mode, fetch current members and check them
    if (isEdit) {
        apiCall(`/projects/${project.id}/members`).then(memberIds => {
            memberIds.forEach(id => {
                const cb = document.getElementById(`member-${id}`);
                if (cb) cb.checked = true;
            });
        });
    }
}

function showModal(type) {
    let html = '';
    
    if (type === 'project') {
        renderProjectModal();
        return;
    } else if (type === 'task') {
        if (!state.currentProject || state.currentProject === 'all') return alert('请先在下拉框选择一个具体的项目来新建任务');
        
        // Ensure users are loaded for assignee selector
        if (!state.users.length) {
            apiCall('/users').then(users => {
                state.users = users;
                renderTaskModal();
            });
        } else {
            renderTaskModal();
        }
        return;
    } else if (type === 'user') {
        html = `
            <h2>新建成员</h2>
            <div class="input-group">
                <label>用户名</label>
                <input type="text" id="m-user-name" required>
            </div>
            <div class="input-group">
                <label>初始密码</label>
                <input type="password" id="m-user-pwd" required>
            </div>
            <div class="input-group">
                <label>角色</label>
                <select id="m-user-role" class="glass-select">
                    <option value="MEMBER">普通成员 (MEMBER)</option>
                    <option value="PM">项目经理 (PM)</option>
                </select>
            </div>
            <div class="modal-actions">
                <button class="btn" onclick="closeModal()">取消</button>
                <button class="btn primary" onclick="submitUser()">创建</button>
            </div>
        `;
    } else if (type === 'feedback') {
        html = `
            <h2>提交意见反馈</h2>
            <div class="input-group">
                <label>意见内容</label>
                <textarea id="m-feedback-content" rows="4" placeholder="请详细描述您的建议或遇到的问题..." required></textarea>
            </div>
            <div class="modal-actions">
                <button class="btn" onclick="closeModal()">取消</button>
                <button class="btn primary" onclick="submitFeedback()">提交意见</button>
            </div>
        `;
    }

    els.modalOverlay.innerHTML = `<div class="modal-content">${html}</div>`;
    els.modalOverlay.classList.add('active');
}

function renderTaskModal() {
    const html = `
        <h2>新建任务</h2>
        <div class="input-group">
            <label>任务标题</label>
            <input type="text" id="m-task-title" required>
        </div>
        <div class="input-group">
            <label>计划内容</label>
            <textarea id="m-task-desc" rows="2"></textarea>
        </div>
        <div class="input-group" style="display:flex; gap:10px;">
            <div style="flex:1">
                <label>负责人</label>
                <select id="m-task-assignee" class="glass-select">
                    <option value="">--未分配--</option>
                    ${state.users.map(u => `<option value="${u.id}">${u.username}</option>`).join('')}
                </select>
            </div>
            <div style="flex:1">
                <label>截止日期</label>
                <input type="date" id="m-task-duedate" class="glass-select">
            </div>
            <div style="flex:1">
                <label>优先级</label>
                <select id="m-task-priority" class="glass-select">
                    <option value="LOW">低 (LOW)</option>
                    <option value="NORMAL" selected>中 (NORMAL)</option>
                    <option value="HIGH">高 (HIGH)</option>
                </select>
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="submitTask()">创建</button>
        </div>
    `;
    els.modalOverlay.innerHTML = `<div class="modal-content">${html}</div>`;
    els.modalOverlay.classList.add('active');
}

function closeModal() {
    els.modalOverlay.classList.remove('active');
}

window.toggleAllMembers = function(cb) {
    const cbs = document.querySelectorAll('#m-proj-members-list input[type="checkbox"]');
    cbs.forEach(el => el.checked = cb.checked);
};

async function submitProject(id = null) {
    const name = document.getElementById('m-proj-name').value;
    const desc = document.getElementById('m-proj-desc').value;
    const due_date = document.getElementById('m-proj-duedate').value;
    const ownerSelect = document.getElementById('m-proj-owner');
    const owner_id = ownerSelect ? parseInt(ownerSelect.value) : undefined;
    
    // Collect picked member IDs
    const memberIds = Array.from(document.querySelectorAll('#m-proj-members-list input[type="checkbox"]:checked'))
                           .map(cb => parseInt(cb.value));

    if(!name) return alert('项目名必填');
    
    const payload = { name, description: desc, owner_id, due_date: due_date || null, member_ids: memberIds };

    if (id) {
        await apiCall(`/projects/${id}`, 'PUT', payload);
    } else {
        await apiCall('/projects', 'POST', payload);
    }
    
    closeModal();
    loadProjects();
    if (pages.reports.classList.contains('active')) loadReportData();
}

async function submitTask() {
    const title = document.getElementById('m-task-title').value;
    const desc = document.getElementById('m-task-desc').value;
    const assignee = document.getElementById('m-task-assignee').value;
    const priority = document.getElementById('m-task-priority').value;
    const dueDate = document.getElementById('m-task-duedate').value;
    
    if(!title) return alert('标题必填');
    await apiCall('/tasks', 'POST', {
        project_id: state.currentProject,
        title, description: desc,
        assignee_id: assignee ? parseInt(assignee) : null,
        priority,
        due_date: dueDate || null
    });
    closeModal();
    loadTasks(state.currentProject);
    if (pages.reports.classList.contains('active')) loadReportData();
}

function editTask(btn) {
    const card = btn.closest('.task-card');
    const t = JSON.parse(card.dataset.task);
    
    // Ensure text is clean
    const safeTitle = t.title.replace(/"/g, '&quot;');
    const safeDesc = (t.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    const isPM = state.user.role === 'PM';
    
    const html = `
        <h2>编辑任务</h2>
        ${state.user.username === 'admin' ? `
        <div class="input-group">
            <label>所属项目 (仅超级管理员可修改)</label>
            <select id="e-task-project" class="glass-select">
                ${state.projects.map(p => `<option value="${p.id}" ${p.id == t.project_id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
        </div>
        ` : `<input type="hidden" id="e-task-project" value="${t.project_id}">`}
        <div class="input-group">
            <label>任务标题</label>
            <input type="text" id="e-task-title" value="${safeTitle}" required>
        </div>
        <div class="input-group">
            <label>描述</label>
            <textarea id="e-task-desc" rows="2">${safeDesc}</textarea>
        </div>
        <div class="input-group" style="display:flex; gap:10px;">
            <div style="flex:1">
                <label>负责人 ${!isPM ? '(仅PM可更改)' : ''}</label>
                <select id="e-task-assignee" class="glass-select" ${!isPM ? 'disabled' : ''}>
                    <option value="">--未分配--</option>
                    ${state.users.map(u => `<option value="${u.id}" ${u.id === t.assignee_id ? 'selected' : ''}>${u.username}</option>`).join('')}
                </select>
            </div>
            <div style="flex:1">
                <label>截止日期</label>
                <input type="date" id="e-task-duedate" class="glass-select" value="${t.due_date || ''}">
            </div>
            <div style="flex:1">
                <label>优先级</label>
                <select id="e-task-priority" class="glass-select">
                    <option value="LOW" ${t.priority==='LOW'?'selected':''}>低 (LOW)</option>
                    <option value="NORMAL" ${t.priority==='NORMAL'?'selected':''}>中 (NORMAL)</option>
                    <option value="HIGH" ${t.priority==='HIGH'?'selected':''}>高 (HIGH)</option>
                </select>
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="submitEditTask(${t.id})">保存更改</button>
        </div>
    `;
    
    if (!state.users.length) {
        apiCall('/users').then(users => {
            state.users = users;
            els.modalOverlay.innerHTML = `<div class="modal-content">${html}</div>`;
            els.modalOverlay.classList.add('active');
        });
    } else {
        els.modalOverlay.innerHTML = `<div class="modal-content">${html}</div>`;
        els.modalOverlay.classList.add('active');
    }
}

async function submitEditTask(id) {
    const title = document.getElementById('e-task-title').value;
    const projEl = document.getElementById('e-task-project');
    const project_id = projEl ? parseInt(projEl.value) : null;
    const desc = document.getElementById('e-task-desc').value;
    const assignee = document.getElementById('e-task-assignee').value;
    const priority = document.getElementById('e-task-priority').value;
    const dueDate = document.getElementById('e-task-duedate').value;
    
    if(!title) return alert('标题必填');
    const payload = {
        title, description: desc,
        assignee_id: assignee ? parseInt(assignee) : null,
        priority,
        due_date: dueDate || null
    };
    if (project_id) payload.project_id = project_id;
    
    await apiCall(`/tasks/${id}`, 'PUT', payload);
    
    closeModal();
    loadTasks(state.currentProject);
    if (pages.reports.classList.contains('active')) loadReportData();
}

async function submitUser() {
    const username = document.getElementById('m-user-name').value;
    const password = document.getElementById('m-user-pwd').value;
    const role = document.getElementById('m-user-role').value;
    
    if(!username || !password) return alert('用户名和密码必填');
    await apiCall('/users', 'POST', { username, password, role });
    closeModal();
    loadUsers();
}

function editUser(btn) {
    const row = btn.closest('tr');
    const u = JSON.parse(row.dataset.user);
    
    const html = `
        <h2>编辑成员</h2>
        <div class="input-group">
            <label>用户名</label>
            <input type="text" id="e-user-name" value="${u.username}" required>
        </div>
        <div class="input-group">
            <label>新密码 (留空则不修改)</label>
            <input type="password" id="e-user-pwd" placeholder="******">
        </div>
        <div class="input-group">
            <label>角色</label>
            <select id="e-user-role" class="glass-select">
                <option value="MEMBER" ${u.role==='MEMBER'?'selected':''}>普通成员 (MEMBER)</option>
                <option value="PM" ${u.role==='PM'?'selected':''}>项目经理 (PM)</option>
            </select>
        </div>
        <div class="modal-actions">
            <button class="btn" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="submitEditUser(${u.id})">保存更改</button>
        </div>
    `;
    els.modalOverlay.innerHTML = `<div class="modal-content">${html}</div>`;
    els.modalOverlay.classList.add('active');
}

async function submitEditUser(id) {
    const username = document.getElementById('e-user-name').value;
    const password = document.getElementById('e-user-pwd').value;
    const role = document.getElementById('e-user-role').value;
    
    if(!username) return alert('用户名必填');
    await apiCall(`/users/${id}`, 'PUT', { username, password, role });
    closeModal();
    loadUsers();
}

async function deleteUser(id) {
    if(!confirm('确定要删除该团队成员吗？分配给他的已存在任务将会被重置为“未分配”状态。')) return;
    try {
        await apiCall(`/users/${id}`, 'DELETE');
        loadUsers();
    } catch(err) {
        // Already handled internally by apiCall's fetch throw
    }
}

// --- Feedbacks ---
async function loadFeedbacks() {
    try {
        const feedbacks = await apiCall('/feedbacks');
        els.feedbacksTableBody.innerHTML = feedbacks.map(f => {
            let statusHtml = '';
            if (f.status === 'PENDING') statusHtml = '<span class="badge" style="background:rgba(234, 179, 8, 0.1); color:#eab308">待处理 (PENDING)</span>';
            else if (f.status === 'PROCESSED') statusHtml = '<span class="badge" style="background:rgba(34, 197, 94, 0.1); color:#22c55e">已处理 (PROCESSED)</span>';
            else if (f.status === 'REJECTED') statusHtml = '<span class="badge" style="background:rgba(239, 68, 68, 0.1); color:var(--danger-color)">已驳回 (REJECTED)</span>';
            
            const isPM = state.user.role === 'PM' || state.user.username === 'admin';
            const safeContent = (f.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeRemark = (f.remark || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeF = JSON.stringify(f).replace(/"/g, '&quot;');
            
            return `
                <tr data-feedback="${safeF}">
                    <td>#${f.id}</td>
                    <td style="font-weight:500">${f.user_name || '未知系统用户'}</td>
                    <td style="max-width:300px; white-space:pre-wrap;">${safeContent}</td>
                    <td>${statusHtml}</td>
                    <td style="max-width:200px; white-space:pre-wrap; color:var(--text-secondary);">${safeRemark || '-'}</td>
                    <td>${new Date(f.created_at).toLocaleString()}</td>
                    <td>
                        ${isPM ? `
                            <button class="btn icon-btn" onclick="processFeedback(this)" style="color:var(--primary-color)" title="处理意见">🛠️ 处理</button>
                        ` : '-'}
                    </td>
                </tr>
            `;
        }).join('');
    } catch(err) {
        console.error("加载意见反馈失败", err);
    }
}

async function submitFeedback() {
    const content = document.getElementById('m-feedback-content').value;
    if (!content.trim()) return alert('意见内容不能为空');
    
    await apiCall('/feedbacks', 'POST', { content });
    closeModal();
    if (pages.feedbacks && pages.feedbacks.classList.contains('active')) {
        loadFeedbacks();
    } else {
        alert('意见提交成功！');
    }
}

function processFeedback(btn) {
    const row = btn.closest('tr');
    const f = JSON.parse(row.dataset.feedback);
    
    const html = `
        <h2>处理意见反馈</h2>
        <div style="margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.03); border-radius: 6px;">
            <p style="margin: 0; font-size: 0.9em; color: var(--text-secondary);">用户反馈内容：</p>
            <p style="margin: 5px 0 0; white-space: pre-wrap;">${(f.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>
        <div class="input-group">
            <label>状态修改为</label>
            <select id="e-feedback-status" class="glass-select">
                <option value="PENDING" ${f.status==='PENDING'?'selected':''}>待处理 (PENDING)</option>
                <option value="PROCESSED" ${f.status==='PROCESSED'?'selected':''}>已处理 (PROCESSED)</option>
                <option value="REJECTED" ${f.status==='REJECTED'?'selected':''}>已驳回 (REJECTED)</option>
            </select>
        </div>
        <div class="input-group">
            <label>备注信息 / 处理回复</label>
            <textarea id="e-feedback-remark" rows="3" placeholder="填写处理结果说明或驳回理由...">${f.remark || ''}</textarea>
        </div>
        <div class="modal-actions">
            <button class="btn" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="submitProcessFeedback(${f.id})">保存处理结果</button>
        </div>
    `;
    els.modalOverlay.innerHTML = `<div class="modal-content">${html}</div>`;
    els.modalOverlay.classList.add('active');
}

async function submitProcessFeedback(id) {
    const status = document.getElementById('e-feedback-status').value;
    const remark = document.getElementById('e-feedback-remark').value;
    
    await apiCall(`/feedbacks/${id}/status`, 'PUT', { status, remark });
    closeModal();
    loadFeedbacks();
}

// --- Reports ---
let reportData = [];

function initReportView() {
    const reportTypeSelect = document.getElementById('report-type');
    const reportYearGroup = document.getElementById('report-year-group');
    const reportValueGroup = document.getElementById('report-value-group');
    const reportYearInput = document.getElementById('report-year');
    const reportValueInput = document.getElementById('report-value');

    if (reportTypeSelect && !reportTypeSelect.dataset.initialized) {
        reportTypeSelect.dataset.initialized = 'true';

        const updateControlVisibility = () => {
            const type = reportTypeSelect.value;
            const valLabel = document.getElementById('report-value-label');

            if (type === 'all') {
                reportYearGroup.style.display = 'none';
                reportValueGroup.style.display = 'none';
            } else if (type === 'year') {
                reportYearGroup.style.display = 'block';
                reportValueGroup.style.display = 'none';
            } else if (type === 'quarter') {
                reportYearGroup.style.display = 'block';
                reportValueGroup.style.display = 'block';
                valLabel.textContent = '选择季度 (1-4)';
                reportValueInput.max = 4;
                if (reportValueInput.value > 4) reportValueInput.value = 1;
            } else {
                reportYearGroup.style.display = 'block';
                reportValueGroup.style.display = 'block';
                valLabel.textContent = '选择月份 (1-12)';
                reportValueInput.max = 12;
            }
            renderReportTable();
        };

        reportTypeSelect.addEventListener('change', updateControlVisibility);
        
        // Use Search button instead of auto-refresh
        document.getElementById('report-search-btn').addEventListener('click', renderReportTable);

        // Initial fetch
        loadReportData();
    }
}

async function loadReportData() {
    const body = document.getElementById('report-table-body');
    body.innerHTML = '<tr><td colspan="10" style="text-align:center;">正在加载数据...</td></tr>';
    try {
        reportData = await apiCall('/reports/projects');
        renderReportTable();
    } catch (err) {
        body.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--danger-color)">加载失败: ${err.message}</td></tr>`;
    }
}

function renderReportTable() {
    const type = document.getElementById('report-type').value;
    const year = parseInt(document.getElementById('report-year').value);
    const value = parseInt(document.getElementById('report-value').value);
    const body = document.getElementById('report-table-body');

    let filtered = reportData;

    if (type !== 'all') {
        filtered = reportData.filter(row => {
            if (!row.task_due_date) return false;
            // task_due_date format is YYYY-MM-DD
            const parts = row.task_due_date.split('-');
            const rYear = parseInt(parts[0]);
            const rMonth = parseInt(parts[1]);

            if (rYear !== year) return false;

            if (type === 'month') {
                return rMonth === value;
            } else if (type === 'quarter') {
                const q = Math.ceil(rMonth / 3);
                return q === value;
            }
            return true; // year match only
        });
    }

    if (filtered.length === 0) {
        body.innerHTML = '<tr><td colspan="10" style="text-align:center;">暂无匹配的数据记录</td></tr>';
        return;
    }

    body.innerHTML = filtered.map(row => `
        <tr>
            <td>${row.project_name || '-'}</td>
            <td title="${row.project_description || ''}">${(row.project_description || '').substring(0, 20)}${(row.project_description || '').length > 20 ? '...' : ''}</td>
            <td>${row.project_owner_name || '-'}</td>
            <td>${row.project_due_date || '-'}</td>
            <td>${row.task_title || '无任务'}</td>
            <td title="${row.task_description || ''}">${(row.task_description || '').substring(0, 20)}${(row.task_description || '').length > 20 ? '...' : ''}</td>
            <td><span class="badge ${row.task_status === 'DONE' ? 'bg-success' : (row.task_status === 'IN_PROGRESS' ? 'bg-warn' : '')}">${row.task_status || '-'}</span></td>
            <td>${row.task_assignee_name || '-'}</td>
            <td>${row.task_due_date || '-'}</td>
            <td>${row.task_completed_at || '-'}</td>
        </tr>
    `).join('');
}

function exportReportToCSV() {
    const body = document.getElementById('report-table-body');
    const rows = body.querySelectorAll('tr');
    if (rows.length === 0 || (rows.length === 1 && rows[0].cells.length < 10)) {
        return alert('没有可导出的数据');
    }

    let csvContent = '\uFEFF项目名称,项目描述,负责人,截止时间,任务名称,任务内容,完成状态,责任人,截止时间,完成时间\n';
    
    rows.forEach(tr => {
        const rowData = Array.from(tr.cells).map(td => {
            let text = td.title || td.textContent.trim();
            return `"${text.replace(/"/g, '""')}"`;
        });
        csvContent += rowData.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const type = document.getElementById('report-type').value;
    link.setAttribute('href', url);
    link.setAttribute('download', `report_detailed_${type}_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Start up
init();
