const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  mod._compile(output, filename);
};
const {expectedStudentEmail,matchesStudentEmail} = require('../src/lib/student-email.ts');

test('RMUTK student email is the student ID without the hyphen', () => {
  assert.equal(expectedStudentEmail(' 66504030041-0 '), '665040300410@mail.rmutk.ac.th');
  assert.equal(expectedStudentEmail('665040300410'), '665040300410@mail.rmutk.ac.th');
  assert.equal(matchesStudentEmail(' 665040300410@MAIL.RMUTK.AC.TH ', '66504030041-0'),true);
});
test('rejects missing, mismatched, spoofed and malformed identities', () => {
  for (const email of ['66504030041-0@mail.rmutk.ac.th','665040300411@mail.rmutk.ac.th','665040300410@gmail.com','665040300410@mail.rmutk.ac.th.evil.com','665040300410+other@mail.rmutk.ac.th','']) {
    assert.equal(matchesStudentEmail(email,'66504030041-0'),false,email);
  }
  for (const id of ['',null,'TEST123','123--45','123 45','-123','123-'])assert.equal(expectedStudentEmail(id),null);
});
