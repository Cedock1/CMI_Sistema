// Asignación aproximada de macrodistrito de La Paz: por palabra clave del lugar + cercanía de coordenadas.
//
// Los LÍMITES REALES no están disponibles: se buscaron el 15-ago en el atlas catastral del GAMLP
// (HTML y PDF, sin datos vectoriales), en `datos.gob.bo` (0 resultados) y en OpenStreetMap (los
// macrodistritos no están mapeados). Para tenerlos hay que pedirle el shapefile a Catastro o al
// SIT del GAMLP. Hasta entonces esto es lo que hay, y por eso importan las variantes de grafía.
//
// ⚠️ LA GRAFÍA J↔H ES EL PUNTO DÉBIL DE ESTA LISTA. Los topónimos aymaras castellanizados se
// escriben de las dos formas y la lista tenía una sola. Costó tres tareas: C161–C163 dicen
// «PampaJasí» y la clave era `pampahasi`, así que no casaron y el macrodistrito se resolvió por
// cercanía a una coordenada que además estaba mal — quedaron a 12,4 km de Pampahasi, al oeste en
// vez de al este. Al agregar una clave nueva, agregar también su otra grafía.

const KW: Record<string, string[]> = {
  'Cotahuma': ['cotahuma'],
  'Max Paredes': ['max paredes', 'maximiliano paredes', 'gran poder', 'chijini', "ch'ijini"],
  'Periférica': ['periferica', 'villa fatima', 'vino tinto', 'chuquiaguillo'],
  'San Antonio': ['san antonio', 'villa copacabana', 'pampahasi'],
  'Sur': ['zona sur', 'obrajes', 'calacoto', 'chasquipampa', 'achumani', 'irpavi', 'cota cota', 'los pinos'],
  'Mallasa': ['mallasa', 'mallasilla', 'aranjuez'],
  'Centro': ['centro historico', 'casco urbano', 'calle jaen', 'san pedro', 'churubamba', 'plaza', 'av. del poeta', 'avenida del poeta', 'sopocachi', 'miraflores', 'el vergel', 'bajo llojeta', 'llojeta'],
  'Hampaturi': ['hampaturi'],
  'Zongo': ['zongo']
};
const CENT: Record<string, [number, number]> = {
  'Centro': [-16.4970, -68.1330], 'Cotahuma': [-16.5080, -68.1420], 'Max Paredes': [-16.4930, -68.1470],
  'Periférica': [-16.4760, -68.1180], 'San Antonio': [-16.5080, -68.1030], 'Sur': [-16.5400, -68.0870],
  'Mallasa': [-16.5620, -68.0980], 'Hampaturi': [-16.4500, -68.0500], 'Zongo': [-16.1500, -68.3500]
};

// Normaliza para comparar: sin tildes, en minúsculas, y con la J y la H unificadas.
//
// Lo último no es un capricho: los topónimos aymaras castellanizados se escriben de las dos
// formas —«Pampahasi» y «Pampajasí» son el mismo barrio— y la lista de claves solo podía tener
// una. Unificarlas acá hace que cualquier clave case con las dos grafías **sin tener que
// adivinar cuáles existen**, que es lo que importa: escribir a mano las variantes sería inventar
// nombres, y este proyecto no inventa topónimos.
//
// Costó tres tareas antes de arreglarse: C161–C163 dicen «PampaJasí», la clave era `pampahasi`,
// no casaron, y el macrodistrito se resolvió por cercanía a una coordenada que además estaba mal
// —quedaron a 12,4 km de Pampahasi, al oeste en vez de al este—.
function na(s: string) {
  return (s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/j/g, 'h');
}

export function parseCoord(c?: string | null): { lat: number; lon: number } | null {
  if (!c) return null;
  const p = c.split(',').map(x => parseFloat(x.trim()));
  if (p.length === 2 && !isNaN(p[0]) && !isNaN(p[1])) return { lat: p[0], lon: p[1] };
  return null;
}

// Radio máximo del respaldo por cercanía, en grados (~0.25° ≈ 28 km desde el centro de un
// macrodistrito). Sin este techo, un punto mal geocodificado a 108 km igual se asignaba al
// macrodistrito "más cercano" como si estuviera dentro — una clasificación falsa que nadie
// podía detectar. 110 de las 271 tareas ubicadas dependen de este respaldo, así que el techo
// importa. Fuera del radio se devuelve null y la tarea aparece como "Sin ubicar", que es
// honesto: la coordenada existe pero no cae en ningún macrodistrito conocido.
const RADIO_MAX = 0.25;

export function macrodistrito(lugar?: string | null, coord?: { lat: number; lon: number } | null): string | null {
  // La palabra clave manda sobre la coordenada: el texto del lugar lo escribió una persona,
  // la coordenada la puso un geocodificador que puede haber elegido un homónimo rural.
  const l = na(lugar || '');
  // La clave TAMBIÉN pasa por `na()`: si no, las que llevan jota —`chijini`— dejarían de casar
  // en cuanto la normalización unifica J y H. Comparar un lado normalizado contra el otro crudo
  // es el error clásico de este tipo de arreglo.
  for (const m in KW) if (KW[m].some(k => l.includes(na(k)))) return m;
  if (coord) {
    let best: string | null = null, bd = Infinity;
    for (const m in CENT) {
      const d = (CENT[m][0] - coord.lat) ** 2 + (CENT[m][1] - coord.lon) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    return bd <= RADIO_MAX ** 2 ? best : null;
  }
  return null;
}

// ¿La coordenada cae dentro del área plausible del municipio? Sirve para marcar en pantalla
// los puntos que el geocodificador ubicó mal, en vez de dibujarlos como si fueran válidos.
// El caso documentado: "Valle de las Flores / Callapa" resuelto a 108 km al sur, el homónimo
// rural contra el que advierte la documentación del sistema de compromisos.
const MUNICIPIO = { latMin: -16.75, latMax: -16.05, lonMin: -68.55, lonMax: -67.90 };

export function coordFueraDeRango(c?: { lat: number; lon: number } | null): boolean {
  if (!c) return false;
  return c.lat < MUNICIPIO.latMin || c.lat > MUNICIPIO.latMax
      || c.lon < MUNICIPIO.lonMin || c.lon > MUNICIPIO.lonMax;
}
