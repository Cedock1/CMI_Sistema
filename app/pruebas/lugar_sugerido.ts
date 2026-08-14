// Prueba de `lugarSugerido` contra títulos REALES de la agenda del alcalde.
// Correr: npx tsx pruebas/lugar_sugerido.ts
//
// Existe porque la primera versión estaba al revés (tiraba el paréntesis, que es donde
// va el lugar) y solo se vio al mirar los datos. Cada caso de acá salió de la agenda.
import { lugarSugerido } from '../src/lib/cmi/agenda';

const CASOS: [string, string | null][] = [
  // Las 8 inspecciones que hay que cargar
  ['INSPECCIÓN MERCADO BOLIVAR CENTRAL(calle Catacora)', 'calle Catacora, La Paz'],
  ['VISITA E INSPECCIÓN TÉCNICA TERMINAL DE MINASA',     'TERMINAL DE MINASA, La Paz'],
  ['VISITA E INSPECCIÓN TÉCNICA CENTRO DE SALUD EL VERGEL', 'CENTRO DE SALUD EL VERGEL, La Paz'],
  ['Visita e Inspección Teatro al Aire Libre',           'Teatro al Aire Libre, La Paz'],
  ['Inspección Hospital San Antonio (Villa San Antonio Calle 5)', 'Villa San Antonio Calle 5, La Paz'],
  ['Inspección Jardín Botánico / EMAVERDE',              'Jardín Botánico, La Paz'],
  ['Inspección San Isidro',                              'San Isidro, La Paz'],
  ['Inspección CITE DE JOYERÍA (Centro de Innovación Tecnológica - Costanera)',
                                                         'Centro de Innovación Tecnológica - Costanera, La Paz'],
  // El paréntesis es la ubicación, no un adorno
  ['Taller abierto de tejido y aguayo (Calle Sagárnaga)', 'Calle Sagárnaga, La Paz'],
  ['Concierto de música autóctona y sikuris (Plaza Mayor de San Francisco)',
                                                         'Plaza Mayor de San Francisco, La Paz'],
  // Lo que NO es un lugar: devolver null es la respuesta correcta
  ['Reunión de Gabinete Ampliado - 10A',                 null],
  ['Entrevista El Deber Sisi Añez (Virtual)',            null],
  ['Gremiales',                                          null],
  ['Casimira Lema (Presencial)',                         null],
];

let fallos = 0;
for (const [titulo, esperado] of CASOS) {
  const got = lugarSugerido(titulo, null);
  const ok = got === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? '✓' : '✗'} ${(got ?? '— null —').padEnd(50)} ← ${titulo.slice(0, 46)}`);
  if (!ok) console.log(`    esperaba: ${esperado ?? '— null —'}`);
}
console.log(fallos ? `\n${fallos} de ${CASOS.length} fallan` : `\nlos ${CASOS.length} casos pasan`);
