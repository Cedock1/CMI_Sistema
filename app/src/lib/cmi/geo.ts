// Asignación aproximada de macrodistrito de La Paz: por palabra clave del lugar + cercanía de coordenadas.
// (Se afinará con los límites reales de los 9 macrodistritos.)

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

function na(s: string) {
  return (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
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
  for (const m in KW) if (KW[m].some(k => l.includes(k))) return m;
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
