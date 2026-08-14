import { NextResponse } from 'next/server';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Lista los proyectos del CMI (con su programa y eje) para el selector de generación.
export async function GET(req: Request) {
  const db = cmiAdmin(esquemaDe(req));
  const { data: proys, error } = await db
    .from('proyecto')
    .select('id, nombre, tipo, programa_id')
    .order('nombre');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: progs } = await db.from('programa').select('id, nombre, eje_codigo');
  const { data: ejes } = await db.from('eje').select('codigo, nombre');
  const progMap = new Map((progs || []).map((p: any) => [p.id, p]));
  const ejeMap = new Map((ejes || []).map((e: any) => [e.codigo, e.nombre]));

  const lista = (proys || []).map((p: any) => {
    const prog: any = progMap.get(p.programa_id);
    const ejeCod = prog?.eje_codigo || '';
    return {
      id: p.id, nombre: p.nombre, tipo: p.tipo,
      programa: prog?.nombre || '', eje_codigo: ejeCod, eje: ejeMap.get(ejeCod) || ejeCod
    };
  });
  return NextResponse.json({ proyectos: lista });
}
