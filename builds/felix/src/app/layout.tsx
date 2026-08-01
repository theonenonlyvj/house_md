import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'house_md · Living Differential',
  description: 'Clinician-facing, evidence-grounded decision support.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
