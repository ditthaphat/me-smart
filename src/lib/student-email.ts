/** RMUTK student mailboxes use the student number without the separating hyphen. */
export function expectedStudentEmail(studentId: string | null | undefined): string | null {
  const id = (studentId ?? '').trim();
  if (!/^[0-9]+(?:-[0-9]+)?$/.test(id)) return null;
  return `${id.replace('-', '')}@mail.rmutk.ac.th`;
}

export function matchesStudentEmail(email: string | null | undefined, studentId: string | null | undefined): boolean {
  const expected = expectedStudentEmail(studentId);
  return Boolean(expected && (email ?? '').trim().toLowerCase() === expected);
}
