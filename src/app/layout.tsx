import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata={title:'ME-Smart | วิศวกรรมเครื่องกล RMUTK',description:'ระบบจัดการรายวิชา นักศึกษา และการเข้าเรียน สาขาวิชาวิศวกรรมเครื่องกล'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>}
