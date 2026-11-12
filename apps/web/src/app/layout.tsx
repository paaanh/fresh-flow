import '../styles/globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'FreshFlow — Quản lý đặt hàng & tồn kho',
  description: 'Nền tảng đặt hàng và quản lý phân phối hàng hóa theo ngày.',
};

// resizes-content: on Android Chrome the layout viewport shrinks when the virtual keyboard opens,
// so dvh-based layouts such as the chat keep the input visible.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased text-[#18231f] bg-white">{children}</body>
    </html>
  );
}
