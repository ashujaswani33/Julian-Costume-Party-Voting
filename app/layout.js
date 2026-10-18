import './globals.css';

export const metadata = {
  title: 'Costume Party',
  description: 'Register your costume and vote for the best one.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
