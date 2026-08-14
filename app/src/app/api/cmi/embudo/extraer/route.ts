import { NextResponse } from 'next/server';
import { sesionConRol, puedeMarcar } from '@/lib/auth';
import { extraer } from '@/lib/cmi/ia/extraer';
import { esquemaDe } from '@/lib/supabase';
import { eventosDelDia } from '@/lib/cmi/agenda';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;   // el análisis con contexto largo puede tardar

// POST { texto } → propuesta de compromisos. NO escribe nada en base.
//
// Es la mitad "la IA propone" del embudo. La mitad "el humano dispone" está en
// /registrar: hasta que alguien confirme ahí, esto es una pantalla y nada más.
export async function POST(req: Request) {
  const sesion = await sesionConRol();
  if (!sesion) return NextResponse.json({ error: 'sin sesión' }, { status: 401 });
  if (!puedeMarcar(sesion.rol)) {
    return NextResponse.json({ error: 'tu rol no puede captar compromisos' }, { status: 403 });
  }

  let cuerpo: any;
  try { cuerpo = await req.json(); }
  catch { return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 }); }

  const texto = String(cuerpo?.texto ?? '').trim();
  if (texto.length < 20) {
    return NextResponse.json(
      { error: 'pegá el texto de la inspección, el acta o la nota (al menos 20 caracteres)' },
      { status: 400 });
  }

  try {
    const esquema = esquemaDe(req);
    const r = await extraer(texto, esquema);
    // Qué hizo el alcalde ESE día. No decide nada: son candidatos para que la persona
    // confirme de qué evento salió el compromiso. Contrasta lo que dice la transcripción
    // contra lo que dice la agenda, que es lo único que el modelo no puede inventar.
    const agenda = await eventosDelDia(r.propuesta.fecha_evento, esquema);
    return NextResponse.json({
      propuesta: r.propuesta,
      agenda,
      // Los catálogos viajan para que la pantalla arme los selectores sin otra vuelta:
      // la persona tiene que poder CAMBIAR el proyecto y el responsable que propuso la IA.
      catalogo: {
        ejes: r.catalogo.ejes,
        proyectos: r.catalogo.proyectos,
        unidades: r.catalogo.unidades,
      },
      meta: { reglas_version: r.reglas_version, modelo: r.modelo, uso: r.uso },
    });
  } catch (e: any) {
    // Fallar sin romper no es fallar sin decir nada: el motivo llega a la pantalla.
    const msg = String(e?.message || e);
    const saldo = /credit balance|insufficient/i.test(msg);
    return NextResponse.json(
      { error: saldo ? 'se agotó el saldo de la API de Anthropic' : `no se pudo analizar: ${msg}` },
      { status: saldo ? 402 : 500 });
  }
}
