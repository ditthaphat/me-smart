export type AttendanceStatus = 'present' | 'late' | 'absent' | 'leave';
export type AttendanceDraft = {status: AttendanceStatus; note: string};
export function changedAttendance(draft: Record<string, AttendanceDraft>, saved: {student_id:string;status:AttendanceStatus;note:string|null}[]) {
  return Object.entries(draft).filter(([, d]) => Boolean(d.status)).filter(([id, d]) => {
    const row = saved.find(r => r.student_id === id);
    return !row || row.status !== d.status || (row.note ?? '') !== d.note;
  });
}
export function qrLink(origin:string, sessionId:number, token:string) {
  const url = new URL('/checkin', origin);
  // Keep the session and QR token together if an intermediate link handler
  // removes later query parameters. The server still validates the token.
  url.searchParams.set('session', `${sessionId}.${token}`);
  return url.toString();
}
export function parseCheckinParams(search:string) {
  const params = new URLSearchParams(search);
  const value = params.get('session') ?? '';
  const separator = value.indexOf('.');
  if (separator >= 0) {
    return { sessionId: Number(value.slice(0, separator)), token: value.slice(separator + 1) };
  }
  // Accept QR links created by deployments using the previous two-parameter format.
  return { sessionId: Number(value), token: params.get('token') ?? '' };
}
export function countdown(ends:string, now:number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(ends) - now) / 1000) || 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`;
}
export function validateWindow(minutes:number, late:number, gps:boolean, lat:string, lng:string, radius:number) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return 'กำหนดเวลาเปิดรับ 1–180 นาที';
  if (!Number.isInteger(late) || late < 0 || late > minutes) return 'เวลาเริ่มสายต้องอยู่ระหว่าง 0 ถึงเวลาเปิดรับ';
  if (gps && (!lat.trim() || !lng.trim() || !Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90 || !Number.isFinite(Number(lng)) || Math.abs(Number(lng)) > 180)) return 'กรุณากำหนดพิกัดห้องเรียนที่ถูกต้อง';
  if (!Number.isInteger(radius) || radius < 30 || radius > 2000) return 'กำหนดรัศมี 30–2,000 เมตร';
  return '';
}
