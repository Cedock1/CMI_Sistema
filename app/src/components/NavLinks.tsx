'use client';
import { usePathname } from 'next/navigation';

// «Tu trabajo» va segundo, antes del tablero: para quien entra a hacer algo —no a
// mirar cómo va todo— es la primera pantalla útil (D56).
const LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/trabajo', label: 'Tu trabajo' },
  { href: '/tablero', label: 'Tablero' },
  { href: '/embudo', label: 'Captar' },
  { href: '/generar', label: 'Generar tareas' }
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <div className="links">
      {LINKS.map(l => (
        <a key={l.href} href={l.href} className={path === l.href ? 'active' : ''}>{l.label}</a>
      ))}
    </div>
  );
}
