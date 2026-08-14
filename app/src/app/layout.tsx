import './globals.css';
import { usuarioSesion } from '@/lib/auth';
import BotonSalir from '@/components/BotonSalir';
import NavLinks from '@/components/NavLinks';

export const metadata = { title: 'CMI GAMLP — Despacho' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioSesion();
  return (
    <html lang="es">
      <body>
        {usuario && (
          <nav className="top">
            <a href="/" className="brand">CMI <span>·</span> GAMLP</a>
            <NavLinks />
            <span className="sp" />
            <span className="user">{usuario}</span>
            <BotonSalir />
          </nav>
        )}
        {children}
      </body>
    </html>
  );
}
