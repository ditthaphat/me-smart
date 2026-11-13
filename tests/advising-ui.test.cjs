const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let serial = 0;
const records = { advising_groups: [], advising_students: [], advising_sessions: [], advising_participants: [] };
function query(table) {
  let action = 'select', payload = null, filters = [], single = false, ignoreDuplicates = false;
  const result = () => {
    let rows = records[table];
    if (action === 'insert' || action === 'upsert') {
      const values = Array.isArray(payload) ? payload : [payload];
      const added = [];
      for (const value of values) {
        if (ignoreDuplicates && rows.some(row => row.session_id === value.session_id && row.student_id === value.student_id)) continue;
        const row = { id: ++serial, is_archived: false, attendance_status: 'not_recorded', ...value };
        rows.push(row); added.push(row);
      }
      rows = added;
    } else {
      rows = rows.filter(row => filters.every(([key, value]) => row[key] === value));
      if (action === 'update') rows.forEach(row => Object.assign(row, payload));
    }
    return { data: single ? rows[0] ?? null : rows.map(row => ({ ...row })), error: null };
  };
  const q = {
    select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, order() { return this; },
    insert(data) { action = 'insert'; payload = data; return this; }, update(data) { action = 'update'; payload = data; return this; },
    upsert(data, options) { action = 'upsert'; payload = data; ignoreDuplicates = Boolean(options?.ignoreDuplicates); return this; },
    single() { single = true; return Promise.resolve(result()); },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
  };
  return q;
}
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename.endsWith(path.join('src', 'app', 'AdvisingPanel.tsx'))) {
    if (request === '../lib/supabase') return { db: () => ({ from: query }) };
    if (request === './Pagination') return { __esModule: true, default: () => null };
    if (request.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  }
  return originalLoad.apply(this, arguments);
};
require.extensions['.tsx'] = (mod, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  mod._compile(output, filename);
};
const AdvisingPanel = require('../src/app/AdvisingPanel.tsx').default;
Module._load = originalLoad;

const findButton = (root, label) => root.findAllByType('button').find(button => button.children.includes(label));
const formWith = (root, label) => root.findAllByType('form').find(form => form.findAllByType('button').some(button => button.children.includes(label)));
async function click(button) { assert.ok(button); await act(async () => { await button.props.onClick(); }); }
async function submit(form) { assert.ok(form); await act(async () => { form.props.onSubmit({ preventDefault() {} }); }); }
async function change(input, value) { assert.ok(input); await act(async () => { input.props.onChange({ target: { value } }); }); }

test('teacher creates a group, roster, meeting and saved attendance without forging signatures', async () => {
  for (const table of Object.values(records)) table.length = 0;
  serial = 0;
  let renderer;
  await act(async () => { renderer = create(React.createElement(AdvisingPanel, { teacherId: 'teacher-1', teacherName: 'อาจารย์ตัวอย่าง' })); });
  const root = renderer.root;
  await change(root.findByProps({ placeholder: 'เช่น นักศึกษาที่ปรึกษา ชั้นปีที่ 1' }), 'กลุ่มทดสอบ');
  await submit(formWith(root, 'เพิ่มกลุ่ม'));
  assert.equal(records.advising_groups.length, 1);
  const roster = root.findAllByType('textarea').find(node => node.props.placeholder?.includes('66000000001'));
  await change(roster, 'S001,นักศึกษาตัวอย่าง ก\nS002,นักศึกษาตัวอย่าง ข');
  await submit(formWith(root, 'เพิ่มรายชื่อ'));
  assert.equal(records.advising_students.length, 2);
  await click(findButton(root, 'บันทึกการปรึกษา'));
  await click(findButton(root, '+ สร้างบันทึก'));
  const notes = root.findAllByType('textarea').find(node => node.props.maxLength === 20000);
  await change(notes, 'หัวข้อในการปรึกษาตัวอย่าง');
  await submit(formWith(root, 'บันทึกการปรึกษา'));
  assert.equal(records.advising_sessions.length, 1);
  assert.equal(records.advising_participants.length, 2);
  assert.equal(records.advising_sessions[0].discussion, 'หัวข้อในการปรึกษาตัวอย่าง');
  const status = root.findByProps({ 'aria-label': 'สถานะ นักศึกษาตัวอย่าง ก' });
  await change(status, 'present');
  assert.equal(records.advising_participants.find(row => row.student_number_snapshot === 'S001').attendance_status, 'present');
  const absent = root.findByProps({ 'aria-label': 'สถานะ นักศึกษาตัวอย่าง ข' });
  await change(absent, 'absent');
  const printedNumbers = () => root.findByProps({ id: 'advising-print' }).findAllByType('tbody')
    .flatMap(body => body.findAllByType('tr')).map(row => row.findAllByType('td')[1].children.join(''));
  assert.deepEqual(printedNumbers(), ['S001']);
  await change(absent, 'not_recorded');
  assert.deepEqual(printedNumbers(), ['S001']);
  const text = JSON.stringify(renderer.toJSON());
  assert.match(text, /ไม่ใช่ลายมือชื่อ/);
  await click(findButton(root, 'เพิ่มรายชื่อจากกลุ่ม'));
  assert.equal(records.advising_participants.length, 2);
  assert.equal(records.advising_participants.find(row => row.student_number_snapshot === 'S001').attendance_status, 'present');
  await act(async () => renderer.unmount());
});
