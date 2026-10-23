import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata={title:'ME-Smart Academic Platform',description:'ระบบจัดการรายวิชาและบัญชีนักศึกษา'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>}
