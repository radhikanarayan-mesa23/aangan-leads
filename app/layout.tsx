import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aangan Leads',
  description: 'Every enquiry answered, graded and on a designer’s board.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
