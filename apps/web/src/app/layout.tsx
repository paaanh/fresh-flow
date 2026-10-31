import '../styles/globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'FreshFlow — Quản lý đặt hàng & tồn kho', description: 'Nền tảng đặt hàng và quản lý phân phối hàng hóa theo ngày.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="vi"><body>{children}</body></html>; }
