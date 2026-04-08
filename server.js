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
        // PM 看到自己创建的项目，以及被添加为成员的项目
        const sql = `
            SELECT DISTINCT projects.*, u.username as owner_name 
            FROM projects 
            LEFT JOIN users u ON projects.created_by = u.id
            LEFT JOIN project_members pm ON projects.id = pm.project_id
            WHERE projects.created_by = ? OR pm.user_id = ?
        `;
        db.all(sql, [req.user.id, req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    } else {
        // 普通成员看到分配了任务的项目，或者被显式添加为成员的项目
        const sql = `
            SELECT DISTINCT projects.*, u.username as owner_name 
            FROM projects 
            LEFT JOIN tasks ON projects.id = tasks.project_id 
            LEFT JOIN users u ON projects.created_by = u.id
            LEFT JOIN project_members pm ON projects.id = pm.project_id
            WHERE tasks.assignee_id = ? OR pm.user_id = ?
        `;
        db.all(sql, [req.user.id, req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    }
});

app.post('/api/projects', authenticateToken, requirePM, (req, res) => {
    const { name, description, owner_id, due_date, member_ids } = req.body;
    let targetOwnerId = req.user.id;
    if (req.user.username === 'admin' && owner_id) {
        targetOwnerId = owner_id;
    }
    const sql = "INSERT INTO projects (name, description, created_by, due_date) VALUES (?, ?, ?, ?)";
    db.run(sql, [name, description, targetOwnerId, due_date || null], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        const projectId = this.lastID;
        
        // Handle members
        if (member_ids && Array.isArray(member_ids) && member_ids.length > 0) {
            const placeholders = member_ids.map(() => "(?, ?)").join(",");
            const values = [];
            member_ids.forEach(uid => {
                values.push(projectId, uid);
            });
            db.run(`INSERT INTO project_members (project_id, user_id) VALUES ${placeholders}`, values, (err) => {
               if (err) console.error("Error inserting project members:", err);
               res.json({ id: projectId, name, description, created_by: targetOwnerId, due_date });
            });
        } else {
            res.json({ id: projectId, name, description, created_by: targetOwnerId, due_date });
        }
    });
});
 
app.get('/api/projects/:id/members', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.all("SELECT user_id FROM project_members WHERE project_id = ?", [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.user_id));
    });
});

app.put('/api/projects/:id', authenticateToken, requirePM, (req, res) => {
    const { id } = req.params;
    const { name, description, owner_id, due_date } = req.body;
    
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
        
        const updateSql = "UPDATE projects SET name=?, description=?, created_by=?, due_date=? WHERE id=?";
        db.run(updateSql, [name, description, targetOwnerId, due_date || null, id], function (err) {
            if (err) return res.status(400).json({ error: err.message });
            
            // Sync members
            db.run("DELETE FROM project_members WHERE project_id = ?", [id], (err) => {
                const member_ids = req.body.member_ids;
                if (member_ids && Array.isArray(member_ids) && member_ids.length > 0) {
                    const placeholders = member_ids.map(() => "(?, ?)").join(",");
                    const values = [];
                    member_ids.forEach(uid => values.push(id, uid));
                    db.run(`INSERT INTO project_members (project_id, user_id) VALUES ${placeholders}`, values, (err) => {
                        res.json({ updated: this.changes });
                    });
                } else {
                    res.json({ updated: this.changes });
                }
            });
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

    if (projectId === 'all') {
        const fetchTasksForAll = (projectIds) => {
            if (projectIds.length === 0) return res.json([]);
            const placeholders = projectIds.map(() => '?').join(',');
            const sql = `
                SELECT tasks.*, users.username as assignee_name, p.name as project_name 
                FROM tasks 
                LEFT JOIN users ON tasks.assignee_id = users.id 
                LEFT JOIN projects p ON tasks.project_id = p.id
                WHERE tasks.project_id IN (${placeholders})
            `;
            db.all(sql, projectIds, (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows);
            });
        };

        if (req.user.username === 'admin') {
            db.all("SELECT id FROM projects", (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                fetchTasksForAll(rows.map(r => r.id));
            });
        } else if (req.user.role === 'PM') {
            const sql = `
                SELECT DISTINCT projects.id
                FROM projects 
                LEFT JOIN project_members pm ON projects.id = pm.project_id
                WHERE projects.created_by = ? OR pm.user_id = ?
            `;
            db.all(sql, [req.user.id, req.user.id], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                fetchTasksForAll(rows.map(r => r.id));
            });
        } else {
            const sql = `
                SELECT DISTINCT projects.id
                FROM projects 
                LEFT JOIN tasks ON projects.id = tasks.project_id 
                LEFT JOIN project_members pm ON projects.id = pm.project_id
                WHERE tasks.assignee_id = ? OR pm.user_id = ?
            `;
            db.all(sql, [req.user.id, req.user.id], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                fetchTasksForAll(rows.map(r => r.id));
            });
        }
    } else {
        const sql = `
            SELECT tasks.*, users.username as assignee_name, p.name as project_name 
            FROM tasks 
            LEFT JOIN users ON tasks.assignee_id = users.id 
            LEFT JOIN projects p ON tasks.project_id = p.id
            WHERE tasks.project_id = ?
        `;
        db.all(sql, [projectId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    }
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
        const checkSql = `
            SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?
            UNION
            SELECT 1 FROM tasks WHERE project_id = ? AND assignee_id = ?
            LIMIT 1
        `;
        db.get(checkSql, [project_id, req.user.id, project_id, req.user.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(403).json({ error: '权限不足：您只能在参与的项目中添加任务' });
            insertTask();
        });
    }
});

app.put('/api/tasks/:id/status', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    db.get("SELECT assignee_id, status FROM tasks WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Task not found' });
        
        if (row.status === 'DONE' && status !== 'DONE' && req.user.role !== 'PM' && req.user.username !== 'admin') {
            return res.status(403).json({ error: '权限不足：只有项目经理及以上权限可将任务从“已完成”移出' });
        }
        
        if (req.user.role !== 'PM' && req.user.username !== 'admin' && req.user.id !== row.assignee_id) {
            return res.status(403).json({ error: '权限不足：您只能更新分配给自己的任务进度' });
        }
        
        let sql, params;
        if (status === 'DONE' && row.status !== 'DONE') {
            sql = "UPDATE tasks SET status = ?, completed_at = DATETIME('now', 'localtime') WHERE id = ?";
            params = [status, id];
        } else if (row.status === 'DONE' && status !== 'DONE') {
            sql = "UPDATE tasks SET status = ?, completed_at = NULL WHERE id = ?";
            params = [status, id];
        } else {
            sql = "UPDATE tasks SET status = ? WHERE id = ?";
            params = [status, id];
        }
        
        db.run(sql, params, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes });
        });
    });
});

app.put('/api/tasks/:id', authenticateToken, requirePM, (req, res) => {
    const { id } = req.params;
    const { project_id, title, description, assignee_id, due_date, priority } = req.body;
    let sql, params;
    
    if (req.user.username === 'admin' && project_id) {
        sql = "UPDATE tasks SET project_id=?, title=?, description=?, assignee_id=?, due_date=?, priority=? WHERE id=?";
        params = [project_id, title, description, assignee_id, due_date, priority || 'NORMAL', id];
    } else {
        sql = "UPDATE tasks SET title=?, description=?, assignee_id=?, due_date=?, priority=? WHERE id=?";
        params = [title, description, assignee_id, due_date, priority || 'NORMAL', id];
    }
    
    db.run(sql, params, function (err) {
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

// --- REPORTS API ---
app.get('/api/reports/projects', authenticateToken, (req, res) => {
    if (req.user.role !== 'PM' && req.user.username !== 'admin') {
        return res.status(403).json({ error: 'Requires admin or PM role to access reports' });
    }

    let sql = `
        SELECT 
            p.id as project_id, 
            p.name as project_name, 
            p.description as project_description, 
            p.due_date as project_due_date,
            u_owner.username as project_owner_name,
            t.id as task_id,
            t.title as task_title,
            t.description as task_description,
            t.status as task_status,
            t.due_date as task_due_date,
            t.completed_at as task_completed_at,
            u_assignee.username as task_assignee_name
        FROM projects p
        LEFT JOIN users u_owner ON p.created_by = u_owner.id
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN users u_assignee ON t.assignee_id = u_assignee.id
    `;

    let params = [];
    if (req.user.username !== 'admin') {
        sql += ` WHERE p.created_by = ?`;
        params.push(req.user.id);
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- FEEDBACKS API ---
app.get('/api/feedbacks', authenticateToken, (req, res) => {
    let sql = `
        SELECT f.*, u.username as user_name 
        FROM feedbacks f
        LEFT JOIN users u ON f.user_id = u.id
    `;
    let params = [];
    if (req.user.role !== 'PM' && req.user.username !== 'admin') {
        sql += ` WHERE f.user_id = ?`;
        params.push(req.user.id);
    }
    sql += ` ORDER BY f.created_at DESC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/feedbacks', authenticateToken, (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });
    
    const sql = "INSERT INTO feedbacks (content, user_id) VALUES (?, ?)";
    db.run(sql, [content, req.user.id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, content });
    });
});

app.put('/api/feedbacks/:id/status', authenticateToken, requirePM, (req, res) => {
    const { id } = req.params;
    const { status, remark } = req.body; // PENDING, PROCESSED, REJECTED
    
    let sql, params;
    if (remark !== undefined) {
        sql = "UPDATE feedbacks SET status = ?, remark = ? WHERE id = ?";
        params = [status, remark, id];
    } else {
        sql = "UPDATE feedbacks SET status = ? WHERE id = ?";
        params = [status, id];
    }
    
    db.run(sql, params, function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

// --- SETTINGS API ---
app.get('/api/settings', (req, res) => {
    db.all("SELECT * FROM settings", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    });
});

app.put('/api/settings', authenticateToken, requirePM, (req, res) => {
    const { software_name } = req.body;
    if (software_name === undefined) return res.status(400).json({ error: 'software_name is required' });
    
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('software_name', ?)", [software_name], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});



app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
});
