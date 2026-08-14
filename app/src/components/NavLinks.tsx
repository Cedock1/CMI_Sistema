'use client';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Inicio' },
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
