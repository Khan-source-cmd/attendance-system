// FINAL COMPREHENSIVE AUDIT - security + functionality + isolation
const http = require('http');
const path = require('path');

const BASE = 'http://127.0.0.1:4000';
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; failures.push(n + ' ' + x); console.log('  FAIL ' + n + ' ' + x); } };

function req(m, p, b, tok) {
  return new Promise(res => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request({ hostname: '127.0.0.1', port: 4000, path: p, method: m,
      headers: Object.assign({ 'Content-Type': 'application/json' }, d ? { 'Content-Length': Buffer.byteLength(d) } : {}, tok ? { Authorization: 'Bearer ' + tok } : {}) },
      rs => { let x = ''; rs.on('data', c => x += c); rs.on('end', () => res({ s: rs.statusCode, h: rs.headers, b: x })); });
    r.on('error', e => res({ s: 0, b: e.code }));
    r.setTimeout(15000, () => { r.destroy(); res({ s: 0, b: 'timeout' }); });
    if (d) r.write(d); r.end();
  });
}
const j = b => { try { return JSON.parse(b || '{}'); } catch { return {}; } };

(async () => {
  console.log('=== 1. FRONTEND PAGES + VENDOR ===');
  const PAGES = ['index', 'register', 'reset-password', 'profile', 'settings', 'history', 'reports',
    'user-dashboard', 'admin-dashboard', 'teacher-dashboard', 'admin-attendance', 'class-management', 'class-schedule',
    'faculty-classes', 'integrations', 'corporate-admin-dashboard', 'corporate-user-dashboard', 'government-admin-dashboard',
    'government-user-dashboard', 'healthcare-admin-dashboard', 'healthcare-user-dashboard', 'manufacturing-admin-dashboard',
    'manufacturing-user-dashboard', 'retail-admin-dashboard', 'retail-user-dashboard'];
  for (const p of PAGES) { const r = await req('GET', '/pages/' + p + '.html'); ok('page ' + p, r.s === 200, r.s); }
  const V = ['bootstrap.min.css', 'bootstrap.bundle.min.js', 'fontawesome.all.min.css', 'chart.umd.min.js', 'fullcalendar.global.min.js', 'qrcode.min.js', 'bootstrap-icons.css'];
  for (const v of V) { const r = await req('GET', '/vendor/' + v); ok('vendor ' + v, r.s === 200, r.s); }
  console.log('AUDIT-1-DONE');

  console.log('=== 2. SECURITY ===');
  for (const [m, p] of [['GET', '/api/profile'], ['GET', '/api/admin/users'], ['GET', '/api/attendance/history'], ['GET', '/api/student/stats'], ['GET', '/api/reports/export/attendance?format=csv']]) {
    const r = await req(m, p); ok(`unauth ${p} = 401`, r.s === 401, r.s);
  }
  ok('removed /api/test = 404', (await req('GET', '/api/test')).s === 404);
  const h = await req('GET', '/pages/index.html');
  ok('CSP header', !!h.h['content-security-policy']);
  ok('nosniff', h.h['x-content-type-options'] === 'nosniff');
  ok('X-Frame-Options DENY', h.h['x-frame-options'] === 'DENY');
  const bad = await req('POST', '/api/register', { name: 'x', role: 'Administrator', email: `sec${Date.now()}@t.com`, password: 'Password123!xyz', industry_type: 'education', organization_code: 'ANY' });
  ok('admin self-registration blocked', bad.s === 400, bad.s + ' ' + j(bad.b).message);
  const weak = await req('POST', '/api/register', { name: 'x', role: 'student', email: `sec2${Date.now()}@t.com`, password: 'weak12', industry_type: 'education', organization_code: 'ANY' });
  ok('weak password blocked (min 12)', weak.s === 400, weak.s);
  const forged = await req('GET', '/api/profile', null, 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from('{"digital_id":"ADMIN","role":"Administrator"}').toString('base64') + '.FAKED');
  ok('forged token rejected', forged.s === 401, forged.s);
  console.log('AUDIT-2-DONE');

  console.log('=== 3. FULL USER JOURNEY ===');
  const ts = Date.now(); const pw = 'JourneyPass123!x';
  const reg = await req('POST', '/api/register-organization', { name: 'Final Admin', phone: '03000000000', email: `final${ts}@t.com`, password: pw, industry_type: 'education', organization_name: 'Final Org ' + ts });
  const adm = j(reg.b);
  ok('register-organization', reg.s === 200 && !!adm.token, reg.s);
  const A = adm.token;
  for (const [m, p] of [['GET', '/api/profile'], ['GET', '/api/admin/dashboard-stats'], ['GET', '/api/admin/users'], ['GET', '/api/admin/system-health'], ['GET', '/api/reports/dashboard/education'], ['GET', '/api/organization/details'], ['GET', '/api/organization/codes']]) {
    const r = await req(m, p, null, A); ok(`${m} ${p}`, r.s === 200, r.s);
  }
  const gc = await req('POST', '/api/organization/generate-code', { role: 'student', max_uses: 5 }, A);
  const code = j(gc.b).code?.code || j(gc.b).code;
  ok('generate org code', !!code);
  const sEmail = `stu${ts}@t.com`;
  const sreg = await req('POST', '/api/register', { name: 'Final Student', phone: '03007654321', role: 'student', email: sEmail, password: pw, industry_type: 'education', organization_code: code });
  const sId = j(sreg.b).digital_id;
  ok('student register with code', sreg.s === 200 && !!sId, sreg.s + ' ' + (j(sreg.b).message || ''));
  const sqlite3 = require(path.join(__dirname, 'backend', 'node_modules', 'sqlite3'));
  const otp = await new Promise(r => { const d = new sqlite3.Database(path.join(__dirname, 'backend', 'database.db'), () => { const done = (e, row) => { if (row) { d.close(); r(row.otp); } }; d.get('SELECT otp FROM otp_verifications WHERE identifier = ?', [sEmail.toLowerCase()], done); d.get('SELECT otp FROM otp_verifications WHERE identifier = ?', [sEmail], done); d.get('SELECT otp FROM otp_verifications WHERE identifier = ?', [sId], (e, row) => { d.close(); r(row ? row.otp : null); }); }); });
  ok('OTP persisted', !!otp);
  if (otp) { const v = await req('POST', '/api/verify', { digital_id: sId, otp }); ok('OTP verify', v.s === 200, v.s); }
  const slogin = j((await req('POST', '/api/login', { digital_id: sId, password: pw })).b);
  const S = slogin.token; ok('student login', !!S);
  ok('punch in', (await req('POST', '/api/attendance/punch', { punch_type: 'in' }, S)).s === 200);
  const st = j((await req('GET', '/api/attendance/state', null, S)).b);
  ok('state = checked_in', (st.state || st.data?.state) === 'checked_in');
  ok('punch out', (await req('POST', '/api/attendance/punch', { punch_type: 'out' }, S)).s === 200);
  ok('history', (await req('GET', '/api/attendance/history', null, S)).s === 200);
  ok('student blocked from admin', (await req('GET', '/api/admin/users', null, S)).s === 403);
  const csv = await req('GET', '/api/reports/export/attendance?format=csv', null, A);
  ok('CSV export', csv.s === 200 && (csv.h['content-type'] || '').includes('csv'), csv.s);
  console.log('AUDIT-3-DONE');
})().catch(e => { console.error(e); process.exit(2); });
