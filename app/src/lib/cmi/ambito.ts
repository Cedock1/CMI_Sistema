// El ÁMBITO de un usuario: sobre qué unidades trabaja (D31/D38).
//
// Vive acá y no dentro de una ruta porque lo necesitan DOS: `/api/cmi/trabajo` para
// decidir qué mostrar y `/api/cmi/subtarea` para decidir qué se puede marcar. Si cada
// una lo calculara por su lado, se podría VER una cosa y PODER otra — que es
// exactamente el agujero que D31 manda evitar («aislamiento por permisos en servidor»).

// La unidad del ámbito más TODAS sus descendientes, por `unidad.depende_de`.
// Se resuelve en memoria y no con un CTE recursivo porque `unidad` son 163 filas y
// PostgREST no expone recursión: traerlas todas cuesta menos que una vista nueva.
// El `visto` corta cualquier ciclo — un organigrama mal cargado no debe colgar la app.
export function descendencia(
  unidades: { id: number; depende_de: number | null }[],
  raiz: number,
): Set<number> {
  const hijos = new Map<number, number[]>();
  unidades.forEach((u) => {
    if (u.depende_de == null) return;
    hijos.set(u.depende_de, [...(hijos.get(u.depende_de) || []), u.id]);
  });
  const visto = new Set<number>([raiz]);
  const cola = [raiz];
  while (cola.length) {
    for (const h of hijos.get(cola.shift()!) || []) {
      if (!visto.has(h)) { visto.add(h); cola.push(h); }
    }
  }
  return visto;
}

export type Ambito = {
  unidades: Set<number>;
  // ¿La unidad del ámbito es la raíz del organigrama? Es la condición de «el Despacho
  // ve todo» (D31). Solo a la raíz se le muestran —y se le dejan marcar— las tareas que
  // no caen en el ámbito de nadie: 71 sin responsable y 2 de unidades sueltas del MOF.
  esRaiz: boolean;
};

export async function ambitoDe(db: any, unidadId: number): Promise<Ambito> {
  const { data: unids } = await db.from('unidad').select('id, depende_de');
  const lista = unids || [];
  return {
    unidades: descendencia(lista, unidadId),
    esRaiz: (lista.find((u: any) => u.id === unidadId)?.depende_de ?? null) == null,
  };
}

// ¿Esta tarea cae dentro del ámbito? Cae si la unidad responsable está en él —o alguna
// que le cuelga— o si el ámbito la acompaña (concurrente/apoyo/territorial): la regla
// de César del 11-jul es que una tarea cuenta entera para cada unidad que participa,
// así que quien acompaña también puede marcar lo suyo.
//
// La raíz alcanza además las tareas sin responsable, que si no no podría tocar nadie.
export async function tareaEnAmbito(db: any, tareaId: number, ambito: Ambito): Promise<boolean> {
  const { data: t } = await db.from('tarea')
    .select('responsable_unidad_id').eq('id', tareaId).single();
  if (!t) return false;

  if (t.responsable_unidad_id == null) return ambito.esRaiz;
  if (ambito.unidades.has(t.responsable_unidad_id)) return true;
  // Una unidad que no cuelga de la raíz del organigrama solo la alcanza la raíz.
  if (ambito.esRaiz) return true;

  const { data: acomps } = await db.from('tarea_concurrente')
    .select('unidad_id').eq('tarea_id', tareaId);
  return (acomps || []).some((a: any) => ambito.unidades.has(a.unidad_id));
}
