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
            FOREIGN KEY (created_by) REFERENCES users (id)
        )`);

        // Create Tasks table
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            assignee_id INTEGER,
            status TEXT DEFAULT 'TODO',
            due_date DATE,
            priority TEXT DEFAULT 'NORMAL',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id),
            FOREIGN KEY (assignee_id) REFERENCES users (id)
        )`);

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
