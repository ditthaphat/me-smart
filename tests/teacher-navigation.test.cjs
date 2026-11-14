const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let role = 'teacher';
let panelMounts = 0;
const students = Array.from({ length: 40 }, (_, i) => ({
  course_id: 5,
  student_id: `student-${i + 1}`,
  status: 'approved',
  profiles: { full_name: `นักศึกษา ${i + 1}`, student_id: String(i + 1) },
}));
const course = { id: 5, code: '4112203', title: 'Fluid Mechanics', term: '2/2569', status: 'approved' };

function query(table) {
  const filters = {};
  const result = () => {
    if (table === 'profiles') return { data: { id: 'user-1', full_name: 'ผู้ใช้ทดสอบ', student_id: role === 'student' ? '1' : null, role }, error: null };
    if (table === 'courses') return { data: [course], error: null };
    if (table === 'enrollments') return { data: filters.status === 'pending' ? [] : students, error: null };
    return { data: [], error: null };
  };
  const builder = {
    select() { return this; },
    eq(key, value) { filters[key] = value; return this; },
    order() { return this; },
    single() { return Promise.resolve(result()); },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
  };
  return builder;
}

const fakeDb = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  },
  from: query,
  rpc: async name => ({ data: name === 'my_courses' ? [course] : null, error: null }),
};

function FakeAttendance({ onLockChange }) {
  React.useEffect(() => { panelMounts++; }, []);
  return React.createElement('section', { 'data-testid': 'attendance-panel' },
    React.createElement('button', { 'data-testid': 'lock', onClick: () => onLockChange(true) }, 'lock'),
    React.createElement('button', { 'data-testid': 'unlock', onClick: () => onLockChange(false) }, 'unlock'));
}
const emptyComponent = () => null;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith(path.join('src', 'app', 'page.tsx'))) {
    if (request === 'next/image') return { __esModule: true, default: props => React.createElement('img', props) };
    if (request === '../lib/messages') return { userMessage: String };
    if (request === '../lib/supabase') return { db: () => fakeDb };
    if (request === './AttendancePanel') return { __esModule: true, default: FakeAttendance };
    if (['./AttendanceSecurity', './AttendanceAnalytics', './StudentLeaveRequest', './TeacherLeaveApproval', './Pagination', './AdvisingPanel', './GradebookPanel'].includes(request)) {
      return { __esModule: true, default: emptyComponent };
    }
    if (request.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  }
  return originalLoad.apply(this, arguments);
};
require.extensions['.tsx'] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  mod._compile(output, filename);
};
const Home = require('../src/app/page.tsx').default;
Module._load = originalLoad;

async function renderHome(asRole) {
  role = asRole;
  panelMounts = 0;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Home)); });
  return renderer;
}
async function click(element) { await act(async () => { await element.props.onClick(); }); }
const byId = (root, id) => root.findByProps({ id });

test('teacher course navigation retains the mounted attendance workspace', async () => {
  const renderer = await renderHome('teacher');
  const root = renderer.root;
  assert.equal(root.findAllByProps({ role: 'tab' }).length, 6);
  assert.equal(byId(root, 'teacher-tab-overview').props['aria-selected'], true);
  assert.equal(byId(root, 'teacher-panel-courses').props.hidden, true);
  await click(byId(root, 'teacher-tab-courses'));
  assert.equal(byId(root, 'teacher-panel-courses').props.hidden, false);
  const manage = root.findAllByType('button').find(button => button.children.includes('จัดการรายวิชา →'));
  await click(manage);
  assert.equal(panelMounts, 1);
  assert.ok(root.findByProps({ 'data-testid': 'attendance-panel' }));
  await click(byId(root, 'teacher-tab-research'));
  assert.equal(byId(root, 'teacher-panel-courses').props.hidden, true);
  await click(byId(root, 'teacher-tab-courses'));
  assert.equal(panelMounts, 1);
  assert.ok(root.findByProps({ 'data-testid': 'attendance-panel' }));
  await act(async () => renderer.unmount());
});

test('active or unsaved attendance prevents leaving or closing the course', async () => {
  const renderer = await renderHome('teacher');
  const root = renderer.root;
  await click(byId(root, 'teacher-tab-courses'));
  await click(root.findAllByType('button').find(button => button.children.includes('จัดการรายวิชา →')));
  await click(root.findByProps({ 'data-testid': 'lock' }));
  await click(byId(root, 'teacher-tab-advising'));
  assert.equal(byId(root, 'teacher-tab-courses').props['aria-selected'], true);
  assert.equal(root.findByProps({ role: 'alert' }).children[0].includes('ปิดรับ QR'), true);
  await click(root.findAllByType('button').find(button => button.children.includes('ปิดรายละเอียด')));
  assert.ok(root.findByProps({ 'data-testid': 'attendance-panel' }));
  await click(root.findByProps({ 'data-testid': 'unlock' }));
  await click(byId(root, 'teacher-tab-advising'));
  assert.equal(byId(root, 'teacher-tab-advising').props['aria-selected'], true);
  assert.equal(panelMounts, 1);
  await act(async () => renderer.unmount());
});

test('student dashboard keeps its course list without teacher navigation', async () => {
  const renderer = await renderHome('student');
  const root = renderer.root;
  assert.equal(root.findAllByProps({ role: 'tablist' }).length, 0);
  assert.ok(root.findAllByType('h2').some(node => node.children.includes('รายวิชาของฉัน')));
  assert.ok(root.findAllByType('h3').some(node => node.children.includes('Fluid Mechanics')));
  await act(async () => renderer.unmount());
});
