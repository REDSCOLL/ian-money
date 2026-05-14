const Database = require('better-sqlite3');
const db = new Database('sqlite.db');
const rows = db.prepare('SELECT receipt_image FROM expenses WHERE receipt_image IS NOT NULL').all();
console.log(JSON.stringify(rows, null, 2));
db.close();
