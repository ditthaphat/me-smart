/** Extract messages from Supabase plain objects as well as native Errors. */
export function userMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/invalid login credentials/i.test(raw)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
  if (/email not confirmed/i.test(raw)) return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
  if (/failed to fetch|networkerror/i.test(raw)) return 'เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง';
  const checkinMessages: Record<string, string> = {
    'Please sign in': 'กรุณาเข้าสู่ระบบก่อนเช็คชื่อ',
    'Class session not found': 'ไม่พบคาบเรียนนี้ กรุณาสแกน QR จากอาจารย์อีกครั้ง',
    'Check-in denied: class session is cancelled': 'คาบเรียนนี้ยกเลิกแล้ว ไม่สามารถเช็คชื่อได้',
    'Not enrolled in this course': 'บัญชีนี้ยังไม่ได้รับอนุมัติเข้าร่วมรายวิชา',
    'Check-in closed': 'ปิดรับเช็คชื่อแล้ว กรุณาติดต่ออาจารย์',
    'QR expired or invalid': 'QR หมดอายุหรือไม่ถูกต้อง กรุณาสแกน QR ล่าสุด',
    'Location unavailable or accuracy too low; ask teacher to verify': 'ระบุตำแหน่งไม่ได้หรือพิกัดคลาดเคลื่อนมาก กรุณาให้อาจารย์ตรวจสอบ',
    'Outside classroom zone; ask teacher to verify': 'พิกัดอยู่นอกบริเวณห้องเรียน กรุณาให้อาจารย์ตรวจสอบ',
    'Attendance already recorded; ask teacher if correction needed': 'มีบันทึกการเข้าเรียนแล้ว กรุณาตรวจประวัติ หรือติดต่ออาจารย์หากต้องแก้ไข',
  };
  if (checkinMessages[raw]) return checkinMessages[raw];
  return raw || 'เกิดข้อผิดพลาด กรุณาลองอีกครั้งหรือติดต่ออาจารย์';
}
