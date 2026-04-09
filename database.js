const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'taskmanage.db');
const db = new sqlite3.Database(dbPath);

const initDb = () => {
    db.serialize(() => {
        // Create Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'MEMBER'
        )`);

        // Create Projects table
        db.run(`CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            due_date DATE,
            FOREIGN KEY (created_by) REFERENCES users (id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            assignee_id INTEGER,
            status TEXT DEFAULT 'TODO',
            due_date DATE,
            priority TEXT DEFAULT 'NORMAL',
            completion_result TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (project_id) REFERENCES projects (id),
            FOREIGN KEY (assignee_id) REFERENCES users (id)
        )`);
        
        // Create project_members table (Relationship)
        db.run(`CREATE TABLE IF NOT EXISTS project_members (
            project_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            PRIMARY KEY (project_id, user_id),
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`);

        // Create Feedbacks table
        db.run(`CREATE TABLE IF NOT EXISTS feedbacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            user_id INTEGER,
            status TEXT DEFAULT 'PENDING',
            remark TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // Create Settings table
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        // Initialize default settings
        db.get("SELECT * FROM settings WHERE key = 'software_name'", (err, row) => {
            if (!row) {
                db.run("INSERT INTO settings (key, value) VALUES ('software_name', 'TaskManage')");
            }
        });

        // 自动添加缺失的字段以进行向后兼容
        db.all("PRAGMA table_info(projects);", (err, rows) => {
            if (!err && rows && !rows.some(row => row.name === 'due_date')) {
                db.run("ALTER TABLE projects ADD COLUMN due_date DATE");
            }
        });
        db.all("PRAGMA table_info(tasks);", (err, rows) => {
            if (!err && rows) {
                if (!rows.some(row => row.name === 'completed_at')) {
                    db.run("ALTER TABLE tasks ADD COLUMN completed_at DATETIME");
                }
                if (!rows.some(row => row.name === 'completion_result')) {
                    db.run("ALTER TABLE tasks ADD COLUMN completion_result TEXT");
                }
            }
        });

        // Initialize admin user if none exists
        db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
            if (!row) {
                const hash = bcrypt.hashSync('admin123', 10);
                db.run("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'PM')", [hash]);
                console.log("Superadmin 'admin/admin123' created.");
            }
        });
    });
};

module.exports = { db, initDb };
