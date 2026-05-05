import './globals.css';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'DISTRITO 77 // PBBG',
  description: 'Juego tycoon asíncrono para 7 jugadores',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-transparent text-zinc-100 antialiased">
        {children}
        <Toaster position="top-right" theme="dark" richColors />
      </body>
    </html>
  );
}
