import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = {
  title: 'Academic Passport | School workspace',
  description: 'School assessment and academic continuity',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
