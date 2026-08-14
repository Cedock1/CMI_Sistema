import { NextResponse } from 'next/server';
import { sesionConRol } from '@/lib/auth';
import { esquemaDe } from '@/lib/supabase';
import { eventosDelDia } from '@/lib/cmi/agenda';

export const dynamic = 'force-dynamic';

// GET ?fecha=YYYY-MM-DD → qué hizo el alcalde ese día.
//
// La extracción ya devuelve la agenda de la fecha que leyó del texto. Esto existe para
// cuando la persona CORRIGE esa fecha: si el modelo leyó mal el día —o el texto no lo
// decía— la lista de eventos tiene que seguir a la corrección, no quedarse en la del
// primer intento. Sin esto, el cruce mostraría el día equivocado sin avisar.
export async function GET(req: Request) {
  const sesion = await sesionConRol();
  if (!sesion) return NextResponse.json({ error: 'sin sesión' }, { status: 401 });

  const fecha = new URL(req.url).searchParams.get('fecha') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'fecha inválida (se espera YYYY-MM-DD)' }, { status: 400 });
  }
  return NextResponse.json({ agenda: await eventosDelDia(fecha, esquemaDe(req)) });
}
