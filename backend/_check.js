const sqlite3 = require('c:/attendance-system/backend/node_modules/sqlite3');
const db = new sqlite3.Database('c:/attendance-system/backend/database.db', sqlite3.OPEN_READONLY, () => {
  db.all("SELECT name, sql FROM sqlite_master WHERE name IN ('compliance_checks','compliance_areas','equipment','patients')", (e, rows) => {
    console.log(e ? 'ERR ' + e.message : JSON.stringify(rows, null, 1));
    db.all("SELECT * FROM compliance_checks WHERE organization_id=3", (e2, r2) => {
      console.log(e2 ? 'ERR2 ' + e2.message : JSON.stringify(r2));
      db.close(() => process.exit(0));
    });
  });
});