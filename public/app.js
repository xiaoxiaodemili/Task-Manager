const API_BASE = '/api';

// State
let state = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user')) || null,
    projects: [],
    users: [],
    currentProject: null
};

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    app: document.getElementById('app-view')
};
const pages = {
    dashboard: document.getElementById('dashboard'),
    kanban: document.getElementById('kanban'),
    members: document.getElementById('members')
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
    createUserBtn: document.getElementById('create-user-btn')
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
            els.navItems.forEach(nav => nav.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const target = e.currentTarget.dataset.target;
            Object.values(pages).forEach(page => page.classList.remove('active'));
            pages[target].classList.add('active');
            
            if (target === 'dashboard') loadProjects();
            if (target === 'kanban') loadKanban();
            if (target === 'members') loadUsers();
        });
    });

    // Modals
    els.createProjectBtn.addEventListener('click', () => showModal('project'));
    els.createTaskBtn.addEventListener('click', () => showModal('task'));
    els.createUserBtn.addEventListener('click', () => showModal('user'));

    // Kanban Project Selector
    els.projectSelector.addEventListener('change', (e) => {
        state.currentProject = e.target.value;
        if (state.currentProject) loadTasks(state.currentProject);
    });

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
    if (state.user.role === 'PM') {
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
            <div class="project-meta">
                <span>👤 负责人: ${p.owner_name || '未知'}</span>
                <span>📅 ${new Date(p.created_at).toLocaleDateString()}</span>
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
        state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    if (state.currentProject) els.projectSelector.value = state.currentProject;
}

async function loadKanban() {
    if (!state.projects.length) await loadProjects();
    if (!state.currentProject && state.projects.length > 0) {
        state.currentProject = state.projects[0].id;
        els.projectSelector.value = state.currentProject;
    }
    if (state.currentProject) {
        loadTasks(state.currentProject);
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
                    <span class="task-title" style="display:block; margin-bottom: 4px;">${t.title}</span>
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
        await apiCall(`/tasks/${draggedTaskId}/status`, 'PUT', { status: newStatus });
        loadTasks(state.currentProject); // reload to reflect changes and counts
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
            <label>描述</label>
            <textarea id="m-proj-desc" rows="3">${desc}</textarea>
        </div>
        ${ownerSelectHtml}
        <div class="modal-actions">
            <button class="btn" onclick="closeModal()">取消</button>
            <button class="btn primary" onclick="submitProject(${project ? project.id : 'null'})">${isEdit ? '保存更改' : '创建'}</button>
        </div>
    `;
    
    if (state.user.username === 'admin' && !state.users.length) {
        apiCall('/users').then(users => {
            state.users = users;
            renderProjectModal(project);
        });
        return;
    }
    
    els.modalOverlay.innerHTML = `<div class="modal-content">${html}</div>`;
    els.modalOverlay.classList.add('active');
}

function showModal(type) {
    let html = '';
    
    if (type === 'project') {
        renderProjectModal();
        return;
    } else if (type === 'task') {
        if (!state.currentProject) return alert('请先选择一个项目');
        
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
            <label>描述</label>
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

async function submitProject(id = null) {
    const name = document.getElementById('m-proj-name').value;
    const desc = document.getElementById('m-proj-desc').value;
    const ownerSelect = document.getElementById('m-proj-owner');
    const owner_id = ownerSelect ? parseInt(ownerSelect.value) : undefined;
    
    if(!name) return alert('项目名必填');
    
    if (id) {
        await apiCall(`/projects/${id}`, 'PUT', { name, description: desc, owner_id });
    } else {
        await apiCall('/projects', 'POST', { name, description: desc, owner_id });
    }
    
    closeModal();
    loadProjects();
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
    const desc = document.getElementById('e-task-desc').value;
    const assignee = document.getElementById('e-task-assignee').value;
    const priority = document.getElementById('e-task-priority').value;
    const dueDate = document.getElementById('e-task-duedate').value;
    
    if(!title) return alert('标题必填');
    await apiCall(`/tasks/${id}`, 'PUT', {
        title, description: desc,
        assignee_id: assignee ? parseInt(assignee) : null,
        priority,
        due_date: dueDate || null
    });
    closeModal();
    loadTasks(state.currentProject);
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

// Start up
init();
