const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { location: { origin: 'https://preview.example', search: '' } };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: { getCurrentPosition(resolve) { resolve({ coords: { latitude: 13.7, longitude: 100.5, accuracy: 5 } }); } } } });
let opened = false;
const rpcCalls = [];
const session = { id: 123, session_date: '2026-11-16', topic: 'Test', is_cancelled: false };
function query(table) {
  const result = () => {
    if (table === 'smart_attendance_windows') return { data: opened ? { is_open: true, closes_at: new Date(Date.now() + 900000).toISOString(), late_after_minutes: 10, require_location: false, latitude: null, longitude: null, radius_m: 150 } : null, error: null };
    if (table === 'attendance_records') return { data: null, count: 0, error: null };
    if (table === 'attendance_sessions') return { data: { ...session, course_id: 5 }, error: null };
    return { data: null, error: null };
  };
  const builder = { select() { return this; }, eq() { return this; }, in() { return this; }, maybeSingle() { return Promise.resolve(result()); }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
  return builder;
}
const fakeDb = {
  from: query,
  auth: { getUser: async () => ({ data: { user: { id: 'test-student' } }, error: null }) },
  rpc: async (name, args) => {
    rpcCalls.push({ name, args });
    if (name === 'smart_start_window') opened = true;
    if (name === 'smart_stop_window') opened = false;
    if (name === 'smart_rotate_qr') return { data: 'synthetic-token', error: null };
    if (name === 'my_courses') return { data: [{ id: 5, code: 'TEST', title: 'Test course' }], error: null };
    if (name === 'smart_checkin_v7') return { data: { ok: true, status: 'present', code: 'accepted_present' }, error: null };
    return { data: null, error: null };
  },
};
const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'qrcode.react') return { QRCodeSVG: props => React.createElement('output', { 'data-testid': 'rendered-qr', 'data-value': props.value }) };
  if (request.endsWith('/lib/supabase')) return { db: () => fakeDb };
  if (request.endsWith('/lib/messages')) return { userMessage: String };
  if (request.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  return originalLoad.apply(this, arguments);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  mod._compile(output, filename);
};
const Teacher = require('../src/app/SmartAttendanceTeacher.tsx').default;
const Checkin = require('../src/app/checkin/page.tsx').default;
const { qrLink, parseCheckinParams } = require('../src/lib/attendance-utils.ts');
Module._load = originalLoad;

test('single-parameter QR link safely encodes and decodes token characters', () => {
  const token = 'test.with-characters+%&=';
  const link = new URL(qrLink('https://preview.example', 123, token));
  assert.equal([...link.searchParams.keys()].length, 1);
  assert.deepEqual(parseCheckinParams(link.search), { sessionId: 123, token });
});

test('teacher QR supplies both parameters to the student check-in flow', async () => {
  let teacher, student;
  try {
    await act(async () => { teacher = create(React.createElement(Teacher, { session, courseCode: 'TEST', onLockChange() {} })); });
    const open = teacher.root.findAllByType('button').find(b => b.children.includes('เปิดรับเช็คชื่อ'));
    await act(async () => { open.props.onClick(); });
    const qr = teacher.root.findByProps({ 'data-testid': 'rendered-qr' }).props['data-value'];
    const link = new URL(qr);
    assert.equal(link.pathname, '/checkin');
    assert.equal(link.searchParams.get('session'), `${session.id}.synthetic-token`);
    assert.equal([...link.searchParams.keys()].length, 1);
    window.location.search = link.search;
    await act(async () => { student = create(React.createElement(Checkin)); });
    assert.equal(student.root.findAllByProps({ role: 'alert' }).length, 0);
    const confirm = student.root.findAllByType('button').find(b => b.children.includes('ยืนยันการเข้าเรียน'));
    assert.ok(confirm);
    assert.equal(confirm.props.disabled, false);
    await act(async () => { confirm.props.onClick(); });
    const call = rpcCalls.find(c => c.name === 'smart_checkin_v7');
    assert.equal(call.args.p_session_id, session.id);
    assert.equal(call.args.p_token, 'synthetic-token');
    assert.equal(call.args.p_accuracy, 5);
    assert.ok(student.root.findAllByType('strong').some(node => node.children.includes('บันทึกสำเร็จ')));
  } finally {
    if (student) await act(async () => student.unmount());
    if (teacher) await act(async () => teacher.unmount());
  }
});

test('links from the previous version remain valid for student check-in', async () => {
  window.location.search = '?session=123&token=previous-token';
  let student;
  try {
    await act(async () => { student = create(React.createElement(Checkin)); });
    assert.equal(student.root.findAllByProps({ role: 'alert' }).length, 0);
    const confirm = student.root.findAllByType('button').find(b => b.children.includes('ยืนยันการเข้าเรียน'));
    assert.ok(confirm);
    await act(async () => { confirm.props.onClick(); });
    const calls = rpcCalls.filter(c => c.name === 'smart_checkin_v7');
    assert.equal(calls.at(-1).args.p_token, 'previous-token');
  } finally {
    if (student) await act(async () => student.unmount());
  }
});

test('student is warned and no check-in is sent when QR parameters are missing', async () => {
  window.location.search = '?session=123';
  let student;
  const previousCalls = rpcCalls.filter(c => c.name === 'smart_checkin_v7').length;
  try {
    await act(async () => { student = create(React.createElement(Checkin)); });
    assert.ok(student.root.findAllByProps({ role: 'alert' }).some(node => JSON.stringify(node.children).includes('ลิงก์ QR ไม่ครบถ้วน')));
    assert.equal(student.root.findAllByType('button').filter(b => b.children.includes('ยืนยันการเข้าเรียน')).length, 0);
    assert.equal(rpcCalls.filter(c => c.name === 'smart_checkin_v7').length, previousCalls);
  } finally {
    if (student) await act(async () => student.unmount());
  }
});
