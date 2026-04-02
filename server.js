const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const { db, initDb } = require('./database');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'super_secret_task_manage_key_change_in_production';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

initDb();

// 认证中间件
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// 鉴权中间件：PM专属操作
const requirePM = (req, res, next) => {
    if (req.user.role !== 'PM') return res.status(403).json({ error: 'Requires PM role' });
    next();
};

// --- AUTH API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'User not found' });
        
        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
        } else {
            res.status(401).json({ error: 'Invalid password' });
        }
    });
});

// 获取所有用户
app.get('/api/users', authenticateToken, (req, res) => {
    db.all("SELECT id, username, role FROM users", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// PM可添加用户
app.post('/api/users', authenticateToken, requirePM, (req, res) => {
    const { username, password, role } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    const sql = "INSERT INTO users (username, password, role) VALUES (?, ?, ?)";
    db.run(sql, [username, hash, role || 'MEMBER'], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, username, role: role || 'MEMBER' });
    });
});

app.put('/api/users/:id', authenticateToken, requirePM, (req, res) => {
    const { id } = req.params;
    const { username, password, role } = req.body;
    let sql, params;
    
    if (password) {
        const hash = bcrypt.hashSync(password, 10);
        sql = "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?";
        params = [username, hash, role, id];
    } else {
        sql = "UPDATE users SET username = ?, role = ? WHERE id = ?";
        params = [username, role, id];
    }
    
    db.run(sql, params, function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

app.delete('/api/users/:id', authenticateToken, requirePM, (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT username FROM users WHERE id=?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: '用户不存在' });
        
        if (row.username === 'admin') return res.status(403).json({ error: '系统内置超级管理员 (admin) 无法被删除' });
        
        db.run("DELETE FROM users WHERE id = ?", [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run("UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?", [id]); 
            res.json({ deleted: this.changes });
        });
    });
});

// --- PROJECTS API ---
app.get('/api/projects', authenticateToken, (req, res) => {
    const baseSql = "SELECT projects.*, users.username as owner_name FROM projects LEFT JOIN users ON projects.created_by = users.id";
    if (req.user.username === 'admin') {
        db.all(baseSql, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    } else if (req.user.role === 'PM') {
        db.all(`${baseSql} WHERE created_by = ?`, [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    } else {
        const sql = `
            SELECT DISTINCT projects.*, u.username as owner_name 
            FROM projects 
            INNER JOIN tasks ON projects.id = tasks.project_id 
            LEFT JOIN users u ON projects.created_by = u.id
            WHERE tasks.assignee_id = ?
        `;
        db.all(sql, [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    }
});

app.post('/api/projects', authenticateToken, requirePM, (req, res) => {
    const { name, description, owner_id } = req.body;
    let targetOwnerId = req.user.id;
    if (req.user.username === 'admin' && owner_id) {
        targetOwnerId = owner_id;
    }
    const sql = "INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)";
    db.run(sql, [name, description, targetOwnerId], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, name, description, created_by: targetOwnerId });
    });
});

app.put('/api/projects/:id', authenticateToken, requirePM, (req, res) => {
    const { id } = req.params;
    const { name, description, owner_id } = req.body;
    
    db.get("SELECT created_by FROM projects WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Project not found' });
        
        if (req.user.username !== 'admin' && row.created_by !== req.user.id) {
            return res.status(403).json({ error: '权限不足：只有项目创建者或管理员可以编辑此项目' });
        }
        
        let targetOwnerId = row.created_by;
        if (req.user.username === 'admin' && owner_id) {
            targetOwnerId = owner_id;
        }
        
        const sql = "UPDATE projects SET name=?, description=?, created_by=? WHERE id=?";
        db.run(sql, [name, description, targetOwnerId, id], function (err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ updated: this.changes });
        });
    });
});

app.delete('/api/projects/:id', authenticateToken, requirePM, (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM projects WHERE id = ?", id, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run("DELETE FROM tasks WHERE project_id = ?", id); // 简单级联删除
        res.json({ deleted: this.changes });
    });
});

// --- TASKS API ---
app.get('/api/projects/:projectId/tasks', authenticateToken, (req, res) => {
    const { projectId } = req.params;
    const sql = `
        SELECT tasks.*, users.username as assignee_name 
        FROM tasks 
        LEFT JOIN users ON tasks.assignee_id = users.id 
        WHERE project_id = ?
    `;
    db.all(sql, [projectId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tasks', authenticateToken, (req, res) => {
    const { project_id, title, description, assignee_id, due_date, priority } = req.body;

    const insertTask = () => {
        const sql = "INSERT INTO tasks (project_id, title, description, assignee_id, due_date, priority) VALUES (?, ?, ?, ?, ?, ?)";
        db.run(sql, [project_id, title, description, assignee_id, due_date, priority || 'NORMAL'], function (err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ id: this.lastID, project_id, title });
        });
    };

    if (req.user.role === 'PM' || req.user.username === 'admin') {
        insertTask();
    } else {
        const checkSql = "SELECT 1 FROM tasks WHERE project_id = ? AND assignee_id = ? LIMIT 1";
        db.get(checkSql, [project_id, req.user.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(403).json({ error: '权限不足：您只能在参与的项目中添加任务' });
            insertTask();
        });
    }
});

app.put('/api/tasks/:id/status', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    db.get("SELECT assignee_id FROM tasks WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Task not found' });
        
        if (req.user.role !== 'PM' && req.user.id !== row.assignee_id) {
            return res.status(403).json({ error: '权限不足：您只能更新分配给自己的任务进度' });
        }
        
        const sql = "UPDATE tasks SET status = ? WHERE id = ?";
        db.run(sql, [status, id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes });
        });
    });
});

app.put('/api/tasks/:id', authenticateToken, requirePM, (req, res) => {
    const { id } = req.params;
    const { title, description, assignee_id, due_date, priority } = req.body;
    const sql = "UPDATE tasks SET title=?, description=?, assignee_id=?, due_date=?, priority=? WHERE id=?";
    db.run(sql, [title, description, assignee_id, due_date, priority || 'NORMAL', id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

app.delete('/api/tasks/:id', authenticateToken, requirePM, (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM tasks WHERE id = ?", id, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
});
