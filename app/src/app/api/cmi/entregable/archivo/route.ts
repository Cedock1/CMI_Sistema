import { NextResponse } from 'next/server';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';
import { puedeMarcar, sesionConRol } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const BUCKET = 'entregables';
const MAX_BYTES = 15 * 1024 * 1024;   // el bucket también lo limita del lado del servidor

// POST multipart { archivo, subtarea_id } → sube el respaldo y devuelve su referencia.
//
// Va antes del PATCH que marca la subtarea: primero se guarda el archivo, después se
// registra el entregable que lo cita. Si el PATCH falla, queda un archivo huérfano en
// el almacenamiento — preferible a un entregable que cita un archivo que no se subió.
export async function POST(req: Request) {
  const sesion = await sesionConRol();
  if (!sesion) return NextResponse.json({ error: 'sin sesión' }, { status: 401 });
  if (!puedeMarcar(sesion.rol)) {
    return NextResponse.json({ error: `el rol «${sesion.rol}» no puede cargar entregables` },
      { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'se esperaba un formulario' }, { status: 400 });
  }

  const archivo = form.get('archivo');
  const subtareaId = Number(form.get('subtarea_id'));
  if (!(archivo instanceof File) || !archivo.size) {
    return NextResponse.json({ error: 'falta el archivo' }, { status: 400 });
  }
  if (!Number.isFinite(subtareaId) || subtareaId <= 0) {
    return NextResponse.json({ error: 'falta la subtarea' }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ error: 'el archivo supera los 15 MB' }, { status: 413 });
  }

  // Nombre saneado: solo se conserva la base y la extensión, sin rutas. El nombre que
  // llega es texto del cliente y podría traer «../» o separadores para escaparse de la
  // carpeta. El nombre original se guarda aparte, en la fila del entregable.
  const limpio = (archivo.name || 'archivo')
    .split(/[\\/]/).pop()!
    .replace(/[^\w.\- ]+/g, '_')
    .slice(-80);
  const ruta = `subtarea-${subtareaId}/${Date.now()}-${limpio}`;

  const { error } = await cmiAdmin(esquemaDe(req)).storage.from(BUCKET)
    .upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    archivo: { ref: ruta, nombre: archivo.name, tipo: 'archivo' as const },
  });
}

// GET ?ref=… → enlace firmado y temporal para descargar el respaldo.
// El bucket es privado: no hay URL pública, y cada descarga pasa por la sesión.
export async function GET(req: Request) {
  const sesion = await sesionConRol();
  if (!sesion) return NextResponse.json({ error: 'sin sesión' }, { status: 401 });

  const ref = new URL(req.url).searchParams.get('ref');
  if (!ref) return NextResponse.json({ error: 'falta la referencia' }, { status: 400 });

  const { data, error } = await cmiAdmin(esquemaDe(req)).storage.from(BUCKET)
    .createSignedUrl(ref, 300);   // 5 minutos: el tiempo de abrirlo, no de compartirlo
  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'no se pudo firmar' }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl });
}
