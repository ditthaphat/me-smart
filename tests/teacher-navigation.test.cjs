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
let materialMounts = 0;
let pendingRequests = [];
const students = Array.from({ length: 40 }, (_, i) => ({
  course_id: 5,
  student_id: `student-${i + 1}`,
  status: 'approved',
  profiles: { full_name: `นักศึกษา ${i + 1}`, student_id: String(i + 1) },
}));
const course = { id: 5, code: '4112203', title: 'Fluid Mechanics', term: '2/2569', status: 'approved' };
let studentCourses=[course];

function query(table) {
  const filters = {};
  const result = () => {
    if (table === 'profiles') return { data: { id: 'user-1', full_name: 'ผู้ใช้ทดสอบ', student_id: role === 'student' ? '1' : null, role }, error: null };
    if (table === 'courses') return { data: [course], error: null };
    if (table === 'enrollments') return { data: filters.status === 'pending' ? pendingRequests : students, error: null };
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
  rpc: async name => ({ data: name === 'my_courses' ? studentCourses : null, error: null }),
};

function FakeAttendance({ onLockChange }) {
  React.useEffect(() => { panelMounts++; }, []);
  return React.createElement('section', { 'data-testid': 'attendance-panel' },
    React.createElement('button', { 'data-testid': 'lock', onClick: () => onLockChange(true) }, 'lock'),
    React.createElement('button', { 'data-testid': 'unlock', onClick: () => onLockChange(false) }, 'unlock'));
}
function FakeMaterials({initialCourseId,onDirtyChange}) {
  const [draft,setDraft]=React.useState('');
  React.useEffect(()=>{materialMounts++;},[]);
  React.useEffect(()=>{onDirtyChange?.(Boolean(draft));},[draft,onDirtyChange]);
  return React.createElement('input',{'data-testid':'materials-draft','data-course':initialCourseId,value:draft,onChange:e=>setDraft(e.target.value)});
}
const fakeStudentMaterials=({course})=>React.createElement('div',{'data-testid':'my-materials','data-course':course.id});
const emptyComponent = () => null;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith(path.join('src', 'app', 'page.tsx'))) {
    if (request === 'next/image') return { __esModule: true, default: props => React.createElement('img', props) };
    if (request === '../lib/messages') return { userMessage: String };
    if (request === '../lib/supabase') return { db: () => fakeDb };
    if (request === './AttendancePanel') return { __esModule: true, default: FakeAttendance };
    if (request === './MaterialsPanel') return { __esModule: true, default: FakeMaterials };
    if (request === './StudentMaterials') return { __esModule: true, default: fakeStudentMaterials };
    if (request === './StudentGradebook') return { __esModule: true, default: ({userId,course}) => React.createElement('div',{'data-testid':'my-gradebook','data-user':userId,'data-course':course.id}) };
    if (request === './Pagination') return { __esModule: true, default: ({page,onChange}) => React.createElement('nav', null, React.createElement('button', {'data-testid':'next-page',onClick:()=>onChange(page+1)},'ถัดไป')) };
    if (['./AttendanceSecurity', './AttendanceAnalytics', './StudentLeaveRequest', './TeacherLeaveApproval', './AdvisingPanel', './GradebookPanel', './ResearchPanel'].includes(request)) {
      return { __esModule: true, default: emptyComponent };
    }
    if (request.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  }
  return originalLoad.apply(this, arguments);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  mod._compile(output, filename);
};
const Home = require('../src/app/page.tsx').default;
Module._load = originalLoad;

async function renderHome(asRole) {
  role = asRole;
  panelMounts = 0;
  materialMounts = 0;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Home)); });
  return renderer;
}
async function click(element) { await act(async () => { await element.props.onClick(); }); }
const byId = (root, id) => root.findByProps({ id });
const textOf = node => node.children.flatMap(x=>typeof x==='string'?[x]:typeof x==='object'?textOf(x):[]).join('');

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
  assert.equal(root.findAllByProps({ 'data-testid': 'materials-draft' }).length, 0);
  assert.ok(root.findAllByType('h2').some(node => node.children.includes('รายวิชาของฉัน')));
  assert.ok(root.findAllByType('h3').some(node => node.children.includes('Fluid Mechanics')));
  assert.equal(root.findAllByProps({'data-testid':'my-gradebook'}).length,0);
  const scoreButton=root.findAllByType('button').find(button=>button.children.includes('ดูคะแนนของฉัน →'));
  assert.ok(scoreButton);
  await click(scoreButton);
  assert.equal(root.findByProps({'data-testid':'my-gradebook'}).props['data-user'],'user-1');
  assert.equal(root.findByProps({'data-testid':'my-gradebook'}).props['data-course'],5);
  await click(root.findAllByType('button').find(button=>button.children.includes('ปิดตารางคะแนน')));
  assert.equal(root.findAllByProps({'data-testid':'my-gradebook'}).length,0);
  await act(async () => renderer.unmount());
});

test('students get a score button only for an approved course',async()=>{
 studentCourses=[course,{id:7,code:'CAE',title:'CAE',term:'2/2569',status:'approved'},{id:6,code:'PENDING',title:'รออนุมัติ',term:'2/2569',status:'pending'}];
 let renderer;
 try{
  renderer=await renderHome('student');
  const buttons=renderer.root.findAllByType('button').filter(button=>button.children.includes('ดูคะแนนของฉัน →'));
  assert.equal(buttons.length,2);
  await click(buttons[0]);
  assert.equal(renderer.root.findByProps({'data-testid':'my-gradebook'}).props['data-course'],5);
  const documents=renderer.root.findAllByType('button').filter(button=>button.children.includes('เอกสารรายวิชานี้ →'));
  assert.equal(documents.length,2);
  await click(documents[1]);
  assert.equal(renderer.root.findByProps({'data-testid':'my-materials'}).props['data-course'],7);
  assert.equal(renderer.root.findAllByProps({'data-testid':'my-gradebook'}).length,0);
  await click(renderer.root.findAllByType('button').find(button=>button.children.includes('เอกสารรายวิชานี้ →')));
  assert.equal(renderer.root.findByProps({'data-testid':'my-materials'}).props['data-course'],5);
 }finally{
  studentCourses=[course];
  if(renderer)await act(async()=>renderer.unmount());
 }
});

test('course documents preserve an unsaved draft across tabs and ask before closing the course',async()=>{
 const oldWindow=global.window;
 let accept=false;
 global.window={confirm:()=>accept};
 const renderer=await renderHome('teacher');
 try{
  const root=renderer.root;
  await click(byId(root,'teacher-tab-courses'));
  await click(root.findAllByType('button').find(b=>b.children.includes('จัดการรายวิชา →')));
  await click(root.findAllByType('button').find(b=>b.children.includes('เอกสาร / ตำรา')));
  let draft=root.findByProps({'data-testid':'materials-draft'});
  assert.equal(draft.props['data-course'],5);
  await act(async()=>draft.props.onChange({target:{value:'ยังไม่บันทึก'}}));
  await click(root.findAllByType('button').find(b=>b.children.includes('รายงาน')));
  await click(root.findAllByType('button').find(b=>b.children.includes('เอกสาร / ตำรา')));
  draft=root.findByProps({'data-testid':'materials-draft'});
  assert.equal(draft.props.value,'ยังไม่บันทึก');
  await click(root.findAllByType('button').find(b=>b.children.includes('ปิดรายละเอียด')));
  assert.ok(root.findByProps({id:'course-management'}));
  accept=true;
  await click(root.findAllByType('button').find(b=>b.children.includes('ปิดรายละเอียด')));
  assert.equal(root.findAllByProps({id:'course-management'}).length,0);
 }finally{await act(async()=>renderer.unmount());global.window=oldWindow;}
});

test('teaching materials opens lazily and keeps unsaved work while switching tabs', async () => {
  const renderer=await renderHome('teacher'); const root=renderer.root;
  assert.equal(materialMounts,0);
  await click(byId(root,'teacher-tab-materials'));
  assert.equal(materialMounts,1);
  await act(async()=>{root.findByProps({'data-testid':'materials-draft'}).props.onChange({target:{value:'ร่างเอกสาร'}});});
  await click(byId(root,'teacher-tab-advising'));
  await click(byId(root,'teacher-tab-materials'));
  assert.equal(materialMounts,1);
  assert.equal(root.findByProps({'data-testid':'materials-draft'}).props.value,'ร่างเอกสาร');
  await act(async()=>renderer.unmount());
});

test('course members and pending requests use ascending student numbers regardless of arrival order', async () => {
  const previous = students.splice(0, students.length);
  const make = (id, studentId, status='approved') => ({course_id:5,student_id:id,status,profiles:{full_name:`นักศึกษา ${id}`,student_id:studentId}});
  students.push(make('first','686040300125'),make('second','675040300425'));
  for(let i=9;i>=0;i--)students.push(make(`extra-${i}`,`69${String(i).padStart(10,'0')}`));
  pendingRequests=[make('pending-later','686040300125','pending'),make('pending-earlier','675040300425','pending')];
  let renderer;
  let capturedBlob;
  const previousDocument=global.document, oldCreate=URL.createObjectURL, oldRevoke=URL.revokeObjectURL;
  try {
    global.document={createElement:()=>({click(){}})};
    URL.createObjectURL=blob=>{capturedBlob=blob;return 'blob:student-sort-test';};
    URL.revokeObjectURL=()=>{};
    renderer=await renderHome('teacher');
    const root=renderer.root;
    await click(byId(root,'teacher-tab-courses'));
    const pending=root.findAllByProps({className:'listItem'}).map(textOf);
    assert.ok(pending[0].includes('675040300425'));
    assert.ok(pending[1].includes('686040300125'));
    pendingRequests.push(make('pending-new','665040300111','pending'));
    await click(root.findAllByType('button').find(button=>button.children.includes('↻ อัปเดตคำขอ')));
    const refreshedPending=root.findAllByProps({className:'listItem'}).map(textOf);
    assert.ok(refreshedPending[0].includes('665040300111'));
    await click(root.findAllByType('button').find(button=>button.children.includes('จัดการรายวิชา →')));
    const roster=()=>root.findByProps({id:'course-management'}).findByType('tbody').findAllByType('tr').map(textOf);
    assert.ok(roster()[0].includes('675040300425'));
    assert.ok(roster()[1].includes('686040300125'));
    await click(root.findAllByType('button').find(button=>button.children.includes('ส่งออก CSV (Excel)')));
    const csv=await capturedBlob.text();
    assert.ok(csv.indexOf('675040300425')<csv.indexOf('686040300125'),'CSV must match the displayed order');
    assert.equal(csv.trim().split('\r\n').length,13,'CSV must include all students, including those on later pages');
    students.push(make('third','665040300111'));
    await click(root.findAllByType('button').find(button=>button.children.includes('↻ อัปเดตรายชื่อ')));
    assert.ok(roster()[0].includes('665040300111'),'a new lower number is inserted at the top after refresh');
    assert.ok(roster()[1].includes('675040300425'));
    assert.ok(roster()[2].includes('686040300125'));
    await click(root.findByProps({'data-testid':'next-page'}));
    assert.equal(roster().length,3,'remaining sorted students are on the next page');
  } finally {
    if(renderer)await act(async()=>renderer.unmount());
    students.splice(0,students.length,...previous);
    pendingRequests=[];
    global.document=previousDocument;
    URL.createObjectURL=oldCreate;
    URL.revokeObjectURL=oldRevoke;
  }
});

