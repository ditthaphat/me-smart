'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '../../lib/supabase';
import styles from '../dashboard.module.css';

export default function ForgotPassword() {
  const [mode, setMode] = useState<'checking' | 'request' | 'recovery' | 'done'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    if (new URLSearchParams(window.location.search).get('recovery') !== '1') {
      setMode('request');
      return;
    }
    void db().auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError || !data.session) {
        setError('ลิงก์ตั้งรหัสผ่านหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่');
        setMode('request');
      } else setMode('recovery');
    });
    return () => { mounted = false; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(''); setMessage(''); setBusy(true);
    try {
      if (mode === 'request') {
        const { error: e } = await db().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` });
        if (e) throw e;
        setMessage('หากอีเมลนี้มีบัญชีในระบบ โปรดตรวจสอบอีเมลและโฟลเดอร์จดหมายขยะ แล้วกดลิงก์เพื่อตั้งรหัสผ่านใหม่');
      } else if (mode === 'recovery') {
        if (password.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
        if (password !== confirm) throw new Error('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        const { error: e } = await db().auth.updateUser({ password });
        if (e) throw e;
        setPassword(''); setConfirm(''); setMode('done');
      }
    } catch (e) {
      const reason = (e as { message?: string })?.message || '';
      setError(reason.toLowerCase().includes('rate limit') ? 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' : reason || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่');
    } finally { setBusy(false); }
  }

  return <main className={styles.container}>
    <section className={styles.card}>
      <h1>{mode === 'recovery' ? 'ตั้งรหัสผ่านใหม่' : 'ลืมรหัสผ่าน'}</h1>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {mode === 'checking' ? <p>กำลังตรวจสอบลิงก์...</p> : mode === 'done' ? <p role="status">เปลี่ยนรหัสผ่านแล้ว สามารถกลับไปเข้าสู่ระบบได้</p> : <form onSubmit={submit}>
        {mode === 'request' ? <><p>กรอกอีเมลที่ใช้สมัคร ME-Smart เพื่อรับลิงก์ตั้งรหัสผ่านใหม่</p><label className={styles.field}>อีเมล<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label></> : <><label className={styles.field}>รหัสผ่านใหม่<input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} /></label><label className={styles.field}>ยืนยันรหัสผ่านใหม่<input type="password" autoComplete="new-password" minLength={6} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label></>}
        <button className={styles.primaryButton} disabled={busy} type="submit">{busy ? 'กำลังดำเนินการ...' : mode === 'request' ? 'ส่งลิงก์ตั้งรหัสผ่าน' : 'บันทึกรหัสผ่านใหม่'}</button>
      </form>}
      <p><Link href="/">กลับไปหน้าเข้าสู่ระบบ</Link></p>
    </section>
  </main>;
}
