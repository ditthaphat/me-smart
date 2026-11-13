const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { location: { origin: 'https://test.example' }, confirm: () => true };
const course = { id: 5, code: '4112203', title: 'Fluid Mechanics', term: '2/2569' };
const session = { id: 8, course_id: 5, session_date: '2026-11-16', topic: 'Test', is_cancelled: false, cancelled_at: null };
let opened = false;
const calls = [];

function query(table) {
  const filters = {};
  const result = () => {
    if (table === 'profiles') return { data: { id: 'teacher', full_name: 'Teacher', student_id: null, role: 'teacher' }, error: null };
    if (table === 'courses') return { data: [course], error: null };
    if (table === 'attendance_sessions') return { data: [session], error: null };
    if (table === 'smart_attendance_windows') return { data: opened ? { is_open: true, closes_at: new Date(Date.now() + 900000).toISOString(), late_after_minutes: 10, require_location: false, latitude: null, longitude: null, radius_m: 150 } : null, error: null };
    if (table === 'attendance_records') return { data: [], count: 0, error: null };
    return { data: [], error: null };
  };
  const builder = {
    select() { return this; }, eq(k, v) { filters[k] = v; return this; }, in() { return this; }, order() { return this; },
    single() { return Promise.resolve(result()); }, maybeSingle() { return Promise.resolve(result()); },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
  };
  return builder;
}
const fakeDb = {
  auth: { getUser: async () => ({ data: { user: { id: 'teacher' } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  from: query,
  rpc: async name => {
    calls.push(name);
    if (name === 'smart_start_window') opened = true;
    if (name === 'smart_stop_window') opened = false;
    return { data: name === 'smart_rotate_qr' ? 'test-token' : null, error: null };
  },
};
const emptyComponent = () => null;
const originalLoad = Module._load;
Module._load = function(request, parent) {
  if (request === 'next/image') return { __esModule: true, default: props => React.createElement('img', props) };
  if (request === 'qrcode.react') return { QRCodeSVG: props => React.createElement('output', { 'data-testid': 'rendered-qr', 'data-value': props.value }) };
  if (request === '../lib/supabase') return { db: () => fakeDb };
  if (request === '../lib/messages') return { userMessage: String };
  if (request === '../lib/excel-export') return { downloadExcel: async () => {} };
  if (['./AttendanceSecurity', './AttendanceAnalytics', './StudentLeaveRequest', './TeacherLeaveApproval', './Pagination', './AdvisingPanel'].includes(request)) return { __esModule: true, default: emptyComponent };
  if (request.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  return originalLoad.apply(this, arguments);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  mod._compile(output, filename);
};
const Home = require('../src/app/page.tsx').default;
Module._load = originalLoad;

test('real teacher components lock navigation while a simulated QR window is open', async () => {
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(Home)); });
    const root = renderer.root;
    const click = async el => act(async () => { el.props.onClick(); });
    await click(root.findByProps({ id: 'teacher-tab-courses' }));
    await click(root.findAllByType('button').find(b => b.children.includes('จัดการรายวิชา →')));
    const button = text => root.findAllByType('button').find(b => b.children.includes(text));
    assert.equal(button('เปิดรับเช็คชื่อ').props.disabled, false);
    await click(button('เปิดรับเช็คชื่อ'));
    assert.equal(opened, true);
    assert.ok(calls.includes('smart_start_window'));
    assert.ok(calls.includes('smart_rotate_qr'));
    assert.match(root.findByProps({ 'data-testid': 'rendered-qr' }).props['data-value'], /^https:\/\/test\.example\/checkin\?/);
    await click(root.findByProps({ id: 'teacher-tab-advising' }));
    assert.equal(root.findByProps({ id: 'teacher-tab-courses' }).props['aria-selected'], true);
    assert.ok(root.findAllByProps({ role: 'alert' }).some(el => String(el.children[0]).includes('ปิดรับ QR')));
    await click(button('ปิดรับเช็คชื่อ'));
    assert.equal(opened, false);
    await click(root.findByProps({ id: 'teacher-tab-advising' }));
    assert.equal(root.findByProps({ id: 'teacher-tab-advising' }).props['aria-selected'], true);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
});
