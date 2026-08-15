// Geocodifica el lugar de captura de una tarea nueva.
//
// Portado de `scripts/corregir_coordenadas.py`, que existe por un error real: Nominatim
// devuelve HOMÓNIMOS RURALES para los barrios de La Paz. «Callapa» resuelve primero a
// `Municipio Santiago de Callapa, Provincia Pacajes` (-17.4675) en vez de `Callapa, San
// Antonio` (-16.5012). Son 108 km, y ese punto malo estiró el mapa hasta dejar los reales
// en el 14% del lienzo.
//
// LA REGLA, y es doble a propósito:
//   1. El `display_name` tiene que decir «Nuestra Señora de La Paz» o «Murillo».
//   2. Y además la coordenada tiene que caer dentro de la caja del municipio.
// El sello solo no basta si el registro está mal en OSM; la caja sola tampoco, porque hay
// lugares vecinos dentro de la caja que no son el que se busca.
//
// Y NO SE INVENTAN COORDENADAS: si ninguna variante pasa la verificación, se devuelve null
// y la tarea queda sin pin. Vale más sin ubicar que mal ubicada — un punto equivocado
// arrastra la escala del mapa y hace desconfiar de todos los demás.

const SELLOS = ['Nuestra Señora de La Paz', 'Murillo'];
const CAJA = { latMin: -16.75, latMax: -16.05, lonMin: -68.55, lonMax: -67.90 };
const UA = 'CMI-GAMLP/1.0 (gestion municipal La Paz)';

const fuera = (lat: number, lon: number) =>
  lat < CAJA.latMin || lat > CAJA.latMax || lon < CAJA.lonMin || lon > CAJA.lonMax;

export type Ubicacion = { lat: number; lon: number; nombre: string; consulta: string };

async function nominatim(consulta: string): Promise<any[]> {
  const p = new URLSearchParams({
    q: consulta, format: 'jsonv2', limit: '8', addressdetails: '1', countrycodes: 'bo',
  });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return [];
  return r.json();
}

/**
 * Devuelve la primera coordenada VERIFICADA para el lugar, o null.
 *
 * Prueba variantes porque el lugar suele venir compuesto («Valle de las Flores / Callapa
 * (distrito 16)»). Nunca lanza: si la red falla, devuelve null y la tarea se guarda igual
 * sin pin — que no se pueda geocodificar no puede impedir registrar un compromiso.
 */
export async function geocodificar(lugar: string | null | undefined): Promise<Ubicacion | null> {
  const texto = (lugar || '').trim();
  if (!texto) return null;

  const base = texto.split('(')[0].split(/distrito/i)[0].replace(/^[\s,/]+|[\s,/]+$/g, '');
  const partes = base.split('/').map((s) => s.trim()).filter(Boolean);
  if (!partes.length) return null;

  // Si el texto YA dice «La Paz», no se le agrega otra vez: «Calle X, Zona Y, La Paz»
  // se convertía en «…, La Paz, La Paz, Bolivia» y Nominatim devolvía CERO resultados.
  // Pasó con la calle Antonio Gallardo (04-ago) y los 7 compromisos quedaron sin pin.
  const conCiudad = (t: string) => (/\bla\s*paz\b/i.test(t) ? `${t}, Bolivia` : `${t}, La Paz, Bolivia`);
  const variantes: string[] = [];
  if (partes.length > 1) variantes.push(conCiudad(`${partes[0]}, ${partes[1]}`));
  partes.forEach((p) => variantes.push(conCiudad(p)));
  // Última chance: solo el primer tramo, sin los calificativos que suelen sobrar
  // («Zona», «Barrio»). Un lugar más corto casa más seguido que uno muy descrito.
  const corto = partes[0].replace(/^(zona|barrio|urbanizaci[oó]n)\s+/i, '').trim();
  if (corto && corto !== partes[0]) variantes.push(conCiudad(corto));

  // Y al final las grafías J↔H, que en los topónimos aymaras castellanizados se usan
  // indistintamente: «Cancha Venus, PampaJasí» no resuelve y «PampaHasi» sí. Van ÚLTIMAS
  // porque primero se intenta con lo que literalmente dice el dato.
  // Mismo criterio que `scripts/corregir_coordenadas.py` — los dos lados tienen que
  // geocodificar igual, o la app y el script ubican distinto la misma tarea.
  const otraGrafia = (t: string) => [
    t.replace(/j/g, 'h').replace(/J/g, 'H'),
    t.replace(/h/g, 'j').replace(/H/g, 'J'),
  ].filter((x) => x !== t);
  [...variantes].forEach((v) => {
    const sinPais = v.replace(/, Bolivia$/, '');
    otraGrafia(sinPais).forEach((g) => variantes.push(`${g}, Bolivia`));
  });

  // Sin repetir, conservando el orden de preferencia: cada variante duplicada cuesta 1,1 s
  // de espera a Nominatim, que es el límite del servicio público.
  for (const v of [...new Set(variantes)]) {
    try {
      for (const r of await nominatim(v)) {
        const nombre = String(r.display_name || '');
        const lat = Number(r.lat), lon = Number(r.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (SELLOS.some((s) => nombre.includes(s)) && !fuera(lat, lon)) {
          return { lat, lon, nombre, consulta: v };
        }
      }
    } catch {
      // Nominatim caído o lento: se sigue con la próxima variante. Nunca rompe el registro.
    }
    // Nominatim pide 1 consulta por segundo. Respetarlo es la condición de poder usarlo.
    await new Promise((r) => setTimeout(r, 1100));
  }
  return null;
}

/** Formato en que `tarea.coordenadas` guarda el punto — el mismo que ya usan las 271. */
export const aTexto = (u: Ubicacion) => `${u.lat},${u.lon}`;
