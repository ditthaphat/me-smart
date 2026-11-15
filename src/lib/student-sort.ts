/**
 * Student numbers are identifiers, so compare their digits as strings rather
 * than converting them to JavaScript numbers (which can lose precision).
 */
const collator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });

export function compareStudentNumbers(left: string | null | undefined, right: string | null | undefined): number {
  const a = left?.trim() ?? '';
  const b = right?.trim() ?? '';
  if (!a || !b) return a ? -1 : b ? 1 : 0;

  const aIsNumeric = /^[0-9][0-9\s-]*$/.test(a);
  const bIsNumeric = /^[0-9][0-9\s-]*$/.test(b);
  if (aIsNumeric && bIsNumeric) {
    const digits = (value: string) => value.replace(/[\s-]/g, '').replace(/^0+(?=\d)/, '');
    const aDigits = digits(a);
    const bDigits = digits(b);
    return aDigits.length - bDigits.length || (aDigits < bDigits ? -1 : aDigits > bDigits ? 1 : 0) || collator.compare(a, b);
  }
  if (aIsNumeric !== bIsNumeric) return aIsNumeric ? -1 : 1;
  return collator.compare(a, b);
}

export function sortStudentsByNumber<T>(
  rows: readonly T[],
  numberOf: (row: T) => string | null | undefined,
  tieOf: (row: T) => string,
): T[] {
  return [...rows].sort((a, b) => compareStudentNumbers(numberOf(a), numberOf(b)) || collator.compare(tieOf(a), tieOf(b)));
}
