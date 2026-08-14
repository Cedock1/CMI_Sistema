import { NextRequest, NextResponse } from 'next/server';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';
import { generarTareas, type ContextoProyecto } from '@/lib/cmi/generar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { proyecto_id } → la IA PROPONE tareas + subtareas + RICE (no persiste nada).
export async function POST(req: NextRequest) {
  try {
    const { proyecto_id } = await req.json();
    if (!proyecto_id) return NextResponse.json({ error: 'falta proyecto_id' }, { status: 400 });

    const db = cmiAdmin(esquemaDe(req));
    const { data: proy, error } = await db
      .from('proyecto')
      .select('id, nombre, objetivo, meta, indicador, programa_id')
      .eq('id', proyecto_id).single();
    if (error || !proy) return NextResponse.json({ error: 'proyecto no encontrado' }, { status: 404 });

    const { data: prog } = await db.from('programa').select('nombre, eje_codigo').eq('id', proy.programa_id).single();
    let ejeNombre = prog?.eje_codigo || '';
    if (prog?.eje_codigo) {
      const { data: eje } = await db.from('eje').select('nombre').eq('codigo', prog.eje_codigo).single();
      if (eje?.nombre) ejeNombre = eje.nombre;
    }

    const ctx: ContextoProyecto = {
      eje: ejeNombre, programa: prog?.nombre || '', proyecto: proy.nombre,
      objetivo: proy.objetivo, meta: proy.meta, indicador: proy.indicador
    };
    const propuesta = await generarTareas(ctx);
    return NextResponse.json({ proyecto: { id: proy.id, nombre: proy.nombre, programa: ctx.programa, eje: ejeNombre }, ...propuesta });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error al generar' }, { status: 500 });
  }
}
