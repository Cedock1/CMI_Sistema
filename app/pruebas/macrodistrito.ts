// Prueba de `macrodistrito()` — la asignación por palabra clave.
//
// Existe por el arreglo del 15-ago: unificar J y H para que «Pampajasí» case con `pampahasi`
// puede romper en silencio las claves que YA llevaban jota (`chijini`). Un cambio de
// normalización toca todas las claves a la vez, así que se prueban todas.
//
//     npx tsx pruebas/macrodistrito.ts

import { macrodistrito } from '../src/lib/cmi/geo';

type Caso = { lugar: string; espera: string | null; porque: string };

const CASOS: Caso[] = [
  // El caso que motivó el arreglo: las dos grafías del mismo barrio.
  { lugar: 'Cancha Venus, Pampahasi, La Paz', espera: 'San Antonio', porque: 'grafía con H' },
  { lugar: 'Cancha Venus, Pampajasí, La Paz', espera: 'San Antonio', porque: 'grafía con J (C161–C163)' },
  { lugar: 'PAMPAJASI', espera: 'San Antonio', porque: 'mayúsculas y sin tilde' },

  // Las claves que YA llevaban jota: no deben romperse al unificar.
  { lugar: 'Feria de Chijini', espera: 'Max Paredes', porque: 'clave con J, no debe romperse' },
  { lugar: 'Mercado de Chihini', espera: 'Max Paredes', porque: 'la misma con H' },

  // Claves con hache: tampoco deben romperse.
  { lugar: 'Av. Cotahuma', espera: 'Cotahuma', porque: 'clave con H' },
  { lugar: 'Represa de Hampaturi', espera: 'Hampaturi', porque: 'clave con H inicial' },
  { lugar: 'Achumani, Zona Sur', espera: 'Sur', porque: 'clave sin J ni H' },

  // Sin ninguna clave: no se inventa macrodistrito.
  { lugar: 'Lugar que no existe', espera: null, porque: 'sin coincidencia y sin coordenada' },
  { lugar: '', espera: null, porque: 'vacío' },
];

let fallas = 0;
for (const c of CASOS) {
  const dio = macrodistrito(c.lugar, null);
  const ok = dio === c.espera;
  if (!ok) fallas++;
  console.log(`${ok ? '  ok  ' : '  FALLA'} ${JSON.stringify(c.lugar).padEnd(36)}`
    + ` → ${String(dio).padEnd(12)} (esperado ${String(c.espera)})  · ${c.porque}`);
}

console.log(`\n${CASOS.length - fallas}/${CASOS.length} pasan`);
if (fallas) process.exit(1);
