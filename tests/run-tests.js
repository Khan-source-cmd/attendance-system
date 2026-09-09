/**
 * Universal Attendance System — automated end-to-end test suite.
 * Boots the real server on a test port, runs the full check battery,
 * then shuts down. Exit code 0 = all green.
 *
 * Run with:  npm test   (from the project root)
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.TEST_PORT || 4100;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  PASS ' + n); }
  else { fail++; failures.push(n + ' ' + x); console.log('  FAIL ' + n + ' ' + x); }
};

function req(m, p, b, tok) {
  return new Promise(res => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request({ hostname: '127.0.0.1', port: PORT, path: p, method: m,
      headers: Object.assign({ 'Content-Type': 'application/json' },
        d ? { 'Content-Length': Buffer.byteLength(d) } : {},
        tok ? { Authorization: 'Bearer ' + tok } : {}) },
      rs => { let x = ''; rs.on('data', c => x += c); rs.on('end', () => res({ s: rs.statusCode, h: rs.headers, b: x })); });
    r.on('error', e => res({ s: 0, b: e.code }));
    r.setTimeout(15000, () => { r.destroy(); res({ s: 0, b: 'timeout' }); });
    if (d) r.write(d); r.end();
  });
}
const j = b => { try { return JSON.parse(b || '{}'); } catch { return {}; } };

function waitForServer(timeoutMs = 45000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const r = http.get(BASE + '/pages/index.html', res => { res.resume(); resolve(); });
      r.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('Server did not start within ' + timeoutMs + 'ms'));
        setTimeout(tryOnce, 1000);
      });
      r.setTimeout(3000, () => { r.destroy(); setTimeout(tryOnce, 1000); });
    };
    tryOnce();
  });
}

async function runTests() {
  console.log('=== 1. FRONTEND PAGES + VENDOR ASSETS ===');
  const PAGES = ['index', 'register', 'reset-password', 'profile', 'settings', 'history', 'reports',
    'user-dashboard', 'admin-dashboard', 'teacher-dashboard', 'admin-attendance', 'class-management', 'class-schedule',
    'faculty-classes', 'integrations', 'corporate-admin-dashboard', 'corporate-user-dashboard', 'government-admin-dashboard',
    'government-user-dashboard', 'healthcare-admin-dashboard', 'healthcare-user-dashboard', 'manufacturing-admin-dashboard',
    'manufacturing-user-dashboard', 'retail-admin-dashboard', 'retail-user-dashboard'];
  for (const p of PAGES) { const r = await req('GET', '/pages/' + p + '.html'); ok('page ' + p, r.s === 200, r.s); }
  const V = ['bootstrap.min.css', 'bootstrap.bundle.min.js', 'fontawesome.all.min.css', 'chart.umd.min.js',
    'fullcalendar.global.min.js', 'qrcode.min.js', 'bootstrap-icons.css'];
  for (const v of V) { const r = await req('GET', '/vendor/' + v); ok('vendor ' + v, r.s === 200, r.s); }

  console.log('=== 2. SECURITY ===');
  for (const [m, p] of [['GET', '/api/profile'], ['GET', '/api/admin/users'], ['GET', '/api/attendance/history'],
    ['GET', '/api/student/stats'], ['GET', '/api/reports/export/attendance?format=csv']]) {
    const r = await req(m, p); ok(`unauth ${p} = 401`, r.s === 401, r.s);
  }
  ok('removed /api/test = 404', (await req('GET', '/api/test')).s === 404);
  const h = await req('GET', '/pages/index.html');
  ok('CSP header present', !!h.h['content-security-policy']);
  ok('nosniff header', h.h['x-content-type-options'] === 'nosniff');
  ok('X-Frame-Options DENY', h.h['x-frame-options'] === 'DENY');
  const ts = Date.now(); const pw = 'TestPass123!xyz';
  const badRole = await req('POST', '/api/register', { name: 'x', role: 'Administrator', email: `sec${ts}@t.com`, password: pw, industry_type: 'education', organization_code: 'ANY' });
  ok('admin self-registration blocked', badRole.s === 400, badRole.s + ' ' + j(badRole.b).message);
  const weak = await req('POST', '/api/register', { name: 'x', role: 'student', email: `sec2${ts}@t.com`, password: 'weak12', industry_type: 'education', organization_code: 'ANY' });
  ok('weak password blocked (min 12 chars)', weak.s === 400, weak.s);
  const forged = await req('GET', '/api/profile', null, 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from('{"digital_id":"ADMIN","role":"Administrator"}').toString('base64') + '.FAKED');
  ok('forged token rejected', forged.s === 401 || forged.s === 403, forged.s);

  console.log('=== 3. FULL USER JOURNEY (education org) ===');
  const reg = await req('POST', '/api/register-organization', { name: 'Test Admin', phone: '03000000000', email: `admin${ts}@t.com`, password: pw, industry_type: 'education', organization_name: 'Test Org ' + ts });
  const adm = j(reg.b);
  ok('register-organization (admin auto-verified)', reg.s === 200 && !!adm.token, reg.s);
  const A = adm.token;
  for (const [m, p] of [['GET', '/api/profile'], ['GET', '/api/admin/dashboard-stats'], ['GET', '/api/admin/users'],
    ['GET', '/api/admin/system-health'], ['GET', '/api/reports/dashboard/education'],
    ['GET', '/api/organization/details'], ['GET', '/api/organization/codes']]) {
    const r = await req(m, p, null, A); ok(`${m} ${p}`, r.s === 200, r.s);
  }
  const gc = await req('POST', '/api/organization/generate-code', { role: 'student', max_uses: 5 }, A);
  const code = j(gc.b).code?.code || j(gc.b).code;
  ok('generate org code', !!code);
  const sEmail = `student${ts}@t.com`;
  const sreg = await req('POST', '/api/register', { name: 'Test Student', phone: '03007654321', role: 'student', email: sEmail, password: pw, industry_type: 'education', organization_code: code });
  const sId = j(sreg.b).digital_id;
  ok('student self-register with valid code', sreg.s === 200 && !!sId, sreg.s + ' ' + (j(sreg.b).message || ''));

  const sqlite3 = require(path.join(ROOT, 'backend', 'node_modules', 'sqlite3'));
  const otp = await new Promise(r => {
    const d = new sqlite3.Database(path.join(ROOT, 'backend', 'database.db'), () => {
      const done = (e, row) => { if (row) { d.close(); r(row.otp); } };
      d.get('SELECT otp FROM otp_verifications WHERE identifier = ?', [sEmail.toLowerCase()], done);
      d.get('SELECT otp FROM otp_verifications WHERE identifier = ?', [sEmail], done);
      d.get('SELECT otp FROM otp_verifications WHERE identifier = ?', [sId], (e, row) => { d.close(); r(row ? row.otp : null); });
    });
  });
  ok('OTP persisted in store', !!otp);
  if (otp) { const v = await req('POST', '/api/verify', { digital_id: sId, otp }); ok('OTP verify', v.s === 200, v.s); }
  const slogin = j((await req('POST', '/api/login', { digital_id: sId, password: pw })).b);
  const S = slogin.token; ok('student login after verify', !!S);
  ok('punch in', (await req('POST', '/api/attendance/punch', { punch_type: 'in' }, S)).s === 200);
  const st = j((await req('GET', '/api/attendance/state', null, S)).b);
  ok('state = checked_in', (st.state || st.data?.state) === 'checked_in');
  ok('punch out', (await req('POST', '/api/attendance/punch', { punch_type: 'out' }, S)).s === 200);
  ok('history', (await req('GET', '/api/attendance/history', null, S)).s === 200);
  ok('student blocked from admin routes (403)', (await req('GET', '/api/admin/users', null, S)).s === 403);
  const csv = await req('GET', '/api/reports/export/attendance?format=csv', null, A);
  ok('CSV export', csv.s === 200 && (csv.h['content-type'] || '').includes('csv'), csv.s);

  console.log('=== 4. MULTI-TENANT ISOLATION ===');
  const reg2 = await req('POST', '/api/register-organization', { name: 'Iso Admin', phone: '03000000000', email: `iso${ts}@t.com`, password: pw, industry_type: 'healthcare', organization_name: 'Iso Org ' + ts });
  const B = j(reg2.b).token;
  ok('second (healthcare) org registered', reg.s === 200 && !!B);
  const aUsers = j((await req('GET', '/api/admin/users', null, A)).b);
  const bUsers = j((await req('GET', '/api/admin/users', null, B)).b);
  const aIds = (aUsers.users || []).map(u => u.digital_id);
  const bIds = (bUsers.users || []).map(u => u.digital_id);
  const overlap = aIds.filter(x => bIds.includes(x));
  ok('org A and org B user lists do not overlap', overlap.length === 0, JSON.stringify(overlap));
  ok('org B creates a production line', (await req('POST', '/api/admin/production/lines', { name: 'HealthLine', workers: 3 }, B)).s === 200);
  const aProd = j((await req('GET', '/api/admin/production', null, A)).b);
  ok('org A sees 0 production lines (isolated)', (aProd.lines || []).length === 0, JSON.stringify(aProd.lines));
  const bProd = j((await req('GET', '/api/admin/production', null, B)).b);
  ok('org B sees its own production line', (bProd.lines || []).some(l => l.name === 'HealthLine'));
  ok('student token cannot access any admin data', (await req('GET', '/api/admin/users', null, S)).s === 403);

  console.log('=== 5. SECTOR MODULES (real DB-backed) ===');
  ok('healthcare patient create', (await req('POST', '/api/admin/patients', { name: 'P1', doctor: 'Dr X', department: 'ICU' }, B)).s === 200);
  const pl = j((await req('GET', '/api/admin/patients', null, B)).b);
  ok('healthcare patient visible to own org', (pl.patients || []).some(p => p.name === 'P1'));
  const aPl = j((await req('GET', '/api/admin/patients', null, A)).b);
  ok('education admin sees 0 patients (isolated)', (aPl.patients || []).length === 0);
  ok('equipment create', (await req('POST', '/api/admin/equipment', { name: 'Crane', status: 'Operational', location: 'Yard' }, B)).s === 200);
  ok('inventory create', (await req('POST', '/api/admin/inventory/items', { name: 'Widget', current_qty: 10, minimum: 5 }, B)).s === 200);
  for (const p of ['/api/admin/productivity/report', '/api/admin/compliance/report', '/api/admin/safety/report',
    '/api/admin/sales-analytics/report', '/api/admin/sales-analytics/export']) {
    const r = await req('GET', p, null, B);
    ok(`CSV report ${p}`, r.s === 200 && (r.h['content-type'] || '').includes('csv'), r.s);
  }

  console.log('\n==============================');
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
  return fail === 0;
}

(async () => {
  const envPath = path.join(ROOT, 'backend', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('FATAL: backend/.env not found. Copy backend/.env.example and fill in secrets first.');
    process.exit(2);
  }
  console.log('Booting test server on port ' + PORT + ' ...');
  const server = spawn('node', ['index.js'], {
    cwd: path.join(ROOT, 'backend'),
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', d => process.env.TEST_VERBOSE === '1' && process.stderr.write(d));
  let allGreen = false;
  try {
    await waitForServer();
    allGreen = await runTests();
  } catch (e) {
    console.error('TEST HARNESS ERROR:', e.message);
  } finally {
    server.kill();
    setTimeout(() => process.exit(allGreen ? 0 : 1), 500);
  }
})();
