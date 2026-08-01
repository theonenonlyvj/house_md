import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'house_md — council of peers',
  description: 'Decision support, not diagnosis: the council argues, the clinician decides.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
