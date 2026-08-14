// Arma el CONTEXTO de aterrizaje del embudo: las reglas duras + los catálogos contra
// los que la IA tiene que anclar lo que propone.
//
// Dos fuentes, y la diferencia importa:
//   · Las REGLAS viven en `src/fuentes/reglas_captura_v01.json` — archivo versionado,
//     fuente única. El prompt las CITA, nunca las repite (principio que el CMI toma de
//     drica: cambiar una regla se hace en el archivo, no editando un prompt).
//   · Los CATÁLOGOS (unidades, ejes, proyectos) viven en Postgres, que ya es su fuente
//     de verdad. No se copian a un CSV: se leen de la base, así nunca quedan viejos.
import { cmiAdmin } from '@/lib/supabase';
import reglas from '@/fuentes/reglas_captura_v01.json';

export const REGLAS_VERSION: string = reglas.version;

// ------------------------------------------------------------------ reglas

// Vuelca el JSON de reglas a texto legible para el modelo. Se recorre el objeto en vez
// de redactarlo a mano: si mañana se agrega una regla al archivo, entra sola al prompt.
function textoReglas(): string {
  const lineas: string[] = [
    `REGLAS DURAS DE CAPTURA — versión ${reglas.version} (${reglas.fecha})`,
    reglas.origen,
    '',
  ];
  const volcar = (valor: any, sangria: string) => {
    if (typeof valor === 'string') { lineas.push(`${sangria}${valor}`); return; }
    if (Array.isArray(valor)) { valor.forEach((v) => volcar(v, `${sangria}· `)); return; }
    for (const [k, v] of Object.entries(valor)) {
      if (typeof v === 'string') lineas.push(`${sangria}${k}: ${v}`);
      else { lineas.push(`${sangria}${k}:`); volcar(v, `${sangria}  `); }
    }
  };
  for (const bloque of ['principios', 'eje', 'responsable', 'multi_secretaria',
                        'que_vs_como', 'declaracion_publica', 'redaccion', 'plazo', 'subtareas',
                        'cotejo_de_duplicados', 'lugar_y_coordenadas', 'encaje'] as const) {
    lineas.push(`## ${bloque.replace(/_/g, ' ').toUpperCase()}`);
    volcar((reglas as any)[bloque], '  ');
    lineas.push('');
  }
  return lineas.join('\n');
}

// ------------------------------------------------------------------ catálogos

export type Catalogo = {
  texto: string;
  ejes: { codigo: string; nombre: string }[];
  proyectos: { id: number; nombre: string; programa: string; eje: string }[];
  unidades: { id: number; sigla: string; nombre: string }[];
};

/** Lee de Postgres los tres catálogos contra los que la IA debe casar lo que propone. */
export async function construirCatalogo(esquema?: string): Promise<Catalogo> {
  const db = cmiAdmin(esquema);
  const [{ data: ejes }, { data: progs }, { data: proys }, { data: unids }, { data: tareas }] =
    await Promise.all([
      db.from('eje').select('codigo, nombre, lema').order('codigo'),
      db.from('programa').select('id, nombre, eje_codigo'),
      db.from('proyecto').select('id, nombre, programa_id, objetivo, meta').order('nombre'),
      db.from('unidad').select('id, sigla, nombre, secretaria, es_descentralizada').order('sigla'),
      // Las tareas ya captadas: sin ellas la regla de cotejo de duplicados es letra muerta.
      db.from('tarea').select('codigo, titulo, eje_codigo, lugar_captura').order('codigo'),
    ]);

  const progMap = new Map((progs || []).map((p: any) => [p.id, p]));
  const listaProy = (proys || []).map((p: any) => {
    const pr: any = progMap.get(p.programa_id);
    return {
      id: p.id as number,
      nombre: p.nombre as string,
      programa: (pr?.nombre || '') as string,
      eje: (pr?.eje_codigo || '') as string,
      // La meta ayuda a decidir el encaje: dice qué cubre el proyecto de verdad,
      // no solo cómo se llama. Se recorta porque son 386.
      pista: (p.meta || p.objetivo || '').slice(0, 150) as string,
    };
  });

  const listaUnid = (unids || []).map((u: any) => ({
    id: u.id as number, sigla: u.sigla as string, nombre: u.nombre as string,
    secretaria: (u.secretaria || '') as string,
    descentralizada: !!u.es_descentralizada,
  }));

  const texto = [
    '## EJES DEL PLAN (el eje se elige por MATERIA, no por jerarquía)',
    ...(ejes || []).map((e: any) => `  ${e.codigo} | ${e.nombre}${e.lema ? ` — ${e.lema}` : ''}`),
    '',
    '## PROYECTOS DEL PLAN — la tarea DEBE colgar de uno (id | eje | programa | proyecto | qué cubre)',
    ...listaProy.map((p) => `  ${p.id} | ${p.eje} | ${p.programa} | ${p.nombre}${p.pista ? ` | ${p.pista}` : ''}`),
    '',
    '## UNIDADES DEL MOF — el responsable debe ser una de estas, EXACTO por sigla',
    ...listaUnid.map((u) =>
      `  ${u.sigla} | ${u.nombre}${u.secretaria ? ` | sec: ${u.secretaria}` : ''}` +
      (u.descentralizada ? ' | DESCENTRALIZADA (solo apoyo, nunca principal)' : '')),
    '',
    '## TAREAS YA CAPTADAS — cotejá contra estas ANTES de proponer una nueva',
    ...(tareas || []).map((t: any) =>
      `  ${t.codigo || '—'} | ${t.eje_codigo || '?'} | ${t.titulo}` +
      (t.lugar_captura ? ` | lugar: ${t.lugar_captura}` : '')),
  ].join('\n');

  return {
    texto,
    ejes: (ejes || []).map((e: any) => ({ codigo: e.codigo, nombre: e.nombre })),
    proyectos: listaProy.map(({ id, nombre, programa, eje }) => ({ id, nombre, programa, eje })),
    unidades: listaUnid.map(({ id, sigla, nombre }) => ({ id, sigla, nombre })),
  };
}

/** El bloque `system` completo: reglas + catálogos. Se cachea (es estable entre llamadas). */
export async function construirContexto(esquema?: string): Promise<{ texto: string; catalogo: Catalogo }> {
  const catalogo = await construirCatalogo(esquema);
  return {
    texto: `${textoReglas()}\n\n${catalogo.texto}`,
    catalogo,
  };
}
