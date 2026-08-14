// Cruce con la agenda del Alcalde.
//
// El embudo geocodifica el lugar que el modelo saca de la transcripción. Eso no tiene con
// qué contrastarse: si la transcripción dice mal la fecha o el lugar, nadie se entera.
// Cruzar la agenda por fecha responde otra pregunta —**dónde estuvo realmente**— y da:
//   · confirmación de que el evento existió, y a qué hora
//   · el lugar cuando la transcripción no lo dice (del título o de la descripción)
//   · constancia del origen: «capturado en «Inspección Jardín Botánico»», tenga pin o no
//
// El cruce NO decide solo: devuelve los candidatos y una persona elige. Es la misma regla
// de siempre —la IA propone, el humano dispone— y acá pesa más, porque un día puede tener
// varios eventos y elegir mal significa fechar y ubicar mal un compromiso.
import { cmiAdmin } from '@/lib/supabase';

export type EventoAgenda = {
  id: number;
  tema: string;
  hora: string;
  descripcion: string | null;
  lugar: string | null;
  origen: string;
  /** Lo que el evento sugiere como lugar, sin inventar nada: ver `lugarSugerido`. */
  sugerencia: string | null;
};

// Verbos con los que el despacho titula una salida a terreno. Lo que viene después ES el
// lugar: «Inspección Jardín Botánico» → «Jardín Botánico».
const VERBO = /^(inspecci[oó]n|visita|recorrido|entrega|inauguraci[oó]n|supervisi[oó]n)\b/i;

// Lo que se le pega adelante al verbo y tampoco es el lugar. El despacho titula en frases
// compuestas —«VISITA E INSPECCIÓN TÉCNICA TERMINAL DE MINASA»—, así que sacar UN verbo no
// alcanza: quedaba «E INSPECCIÓN TÉCNICA TERMINAL DE MINASA» como si fuera un lugar.
// Se saca la frase verbal entera, token por token, y solo desde el principio.
const PEGADO = /^(inspecci[oó]n|visita|recorrido|entrega|inauguraci[oó]n|supervisi[oó]n|t[eé]cnic[ao]|[ey]|de|del|al?|en|la|el|los|las)\b\s*/i;

/**
 * Qué lugar sugiere este evento — o null, que es una respuesta válida y frecuente.
 *
 * Se probó contra la agenda real y la primera versión estaba al revés: tiraba el
 * paréntesis y se quedaba con el nombre del evento. Pero en esta agenda **el paréntesis
 * ES la ubicación**: «Taller de tejido (Calle Sagárnaga)», «Concierto (Plaza Mayor)»,
 * «CITE DE JOYERÍA (Centro de Innovación...)». Y el nombre del evento, casi nunca:
 * «Feria de los agachaditos» no es un lugar, «Reunión de Gabinete» tampoco.
 *
 * El orden, de más confiable a menos:
 *   1. El campo `lugar` declarado en el calendario (casi siempre vacío, pero si está, manda).
 *   2. El paréntesis del título.
 *   3. El título, SOLO si empieza con un verbo de salida a terreno.
 *   4. null — y esto no es una falla: una reunión de gabinete no tiene lugar que deducir.
 *
 * Devolver null es preferible a arriesgar: lo que salga de acá se geocodifica, y un pin
 * en el lugar equivocado es peor que ningún pin.
 */
export function lugarSugerido(tema: string, lugar: string | null): string | null {
  const conCiudad = (s: string) => {
    const t = s.trim().replace(/[,;]$/, '');
    if (t.length < 4 || t.split(/\s+/).length > 8) return null;
    return /la paz/i.test(t) ? t : `${t}, La Paz`;
  };

  if (lugar && lugar.trim().length > 3) return conCiudad(lugar);

  const titulo = (tema || '').trim();

  // 2. El paréntesis: en esta agenda es donde va la dirección.
  const par = /\(([^)]{4,})\)/.exec(titulo);
  if (par) {
    const dentro = par[1].trim();
    // Salvo que sea una aclaración y no un lugar. Salieron de la agenda real:
    // «Presencial», «Virtual», «Por confirmar», «10A». Geocodificar «Presencial»
    // devolvería cualquier cosa, que es peor que no devolver nada.
    if (!/^(virtual|presencial|h[ií]brido|online|zoom|meet|por confirmar|a confirmar|s\/?d|\d+\w?)$/i.test(dentro)) {
      const r = conCiudad(dentro);
      if (r) return r;
    }
  }

  // 3. El título, solo si EMPIEZA con un verbo de salida a terreno. Que el verbo esté al
  //    principio es la condición: «Inspección X» es una salida, «Informe sobre la
  //    inspección» no, y el lugar de la segunda no se puede sacar del título.
  if (VERBO.test(titulo)) {
    let resto = titulo.split('/')[0].replace(/\(.*$/, '');
    // Se come la frase verbal completa desde el principio, no un solo verbo.
    let antes = '';
    while (resto !== antes) { antes = resto; resto = resto.replace(PEGADO, ''); }
    return conCiudad(resto);
  }

  // 4. No se adivina.
  return null;
}

/** Eventos de la agenda de ese día, en horario de Bolivia. Nunca lanza. */
export async function eventosDelDia(fecha: string, esquema?: string): Promise<EventoAgenda[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return [];
  try {
    const db = cmiAdmin(esquema);
    const { data } = await db
      .from('v_agenda_dia')
      .select('id, tema, hora, descripcion, lugar, origen')
      .eq('dia', fecha)
      .order('hora');
    return (data || []).map((e: any) => ({
      id: e.id, tema: e.tema, hora: e.hora,
      descripcion: e.descripcion, lugar: e.lugar, origen: e.origen,
      sugerencia: lugarSugerido(e.tema, e.lugar),
    }));
  } catch {
    // Que la agenda no esté no puede impedir captar un compromiso.
    return [];
  }
}
