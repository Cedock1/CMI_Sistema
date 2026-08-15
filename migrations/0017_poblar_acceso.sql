-- ============================================================================
-- Migración 0017 · Poblar el control de acceso (D56.1)
--
-- QUÉ RESUELVE
--   Las seis cuentas de `auth.users` entran a la app y ven las 434 tareas por
--   igual: `cmi.usuario` tenía UNA fila (César) y `usuario_ambito` otra. Sin
--   ámbito no existe «mis tareas», que es lo que bloquea toda la pantalla
--   `/trabajo`.
--
-- ⚠️ EL CORREO VA EN MINÚSCULAS — no es un detalle de estilo
--   La API de Supabase normaliza el correo al crear la cuenta: se pidió
--   `CesarM@gamlp.com` y en `auth.users` quedó `cesarm@gamlp.com`.
--   `sesionConRol()` (app/src/lib/auth.ts) cruza la sesión contra
--   `usuario.correo` por IGUALDAD EXACTA. Cargarlo con mayúsculas deja al
--   usuario entrando a la app pero SIN ROL y sin poder marcar nada — falla en
--   silencio, que es la peor forma de fallar. El bloque de verificación del
--   final aborta si algún correo de acá no existe tal cual en `auth.users`.
--
-- POR QUÉ ESTOS ÁMBITOS
--   DAM (1) es la unidad raíz: ámbito DAM = ve todo el árbol (D31, «el Despacho
--   ve todo»). DGEG (5) es la Dirección de Gestión Estratégica y Gabinete.
--   El ámbito describe SOBRE QUÉ TRABAJA la persona, no dónde está su ítem de
--   RRHH: Franz figura en DAM por planilla y en DGEG por función (D30 lo define
--   Jefe de Unidad de Asuntos Estratégicos «virtualmente», del equipo de Javier).
--
--   `persona_id` queda NULO a propósito: `cmi.persona` está en 0 filas y
--   cargarla es decisión aparte, con su propia regla —solo el nombre en cada
--   cargo ya definido, la estructura no se toca—. Dar de alta seis usuarios no
--   es excusa para colar esa carga.
--
-- IDEMPOTENTE: se puede correr dos veces sin duplicar ni pisar nada.
-- ============================================================================
set search_path to cmi, public;

-- ---------- Las personas ----------
-- `correo` es unique, así que el ON CONFLICT hace de llave natural.
insert into usuario (nombre, correo) values
  ('César Mérida',                      'cesardockm@gmail.com'),
  ('César Mérida',                      'cesarm@gamlp.com'),
  ('Administrador del sistema',         'admin@gamlp.com'),
  ('Javier Reynaldo Delgadillo Andrade','javierd@gamlp.com'),
  ('Franz Rolando Choque Espinoza',     'franz@gamlp.com'),
  ('Willam Cristian Baptista Noya',     'willam@gamlp.com')
on conflict (correo) do update set nombre = excluded.nombre;

-- ---------- El ámbito y el rol ----------
-- La unidad se resuelve por SIGLA, no por id a mano: si el organigrama se
-- recarga y los ids cambian, esto sigue apuntando a la unidad correcta.
insert into usuario_ambito (usuario_id, unidad_id, rol_codigo)
select u.id, un.id, v.rol
from (values
  ('cesardockm@gmail.com', 'DAM',  'administrador'),
  ('cesarm@gamlp.com',     'DAM',  'administrador'),
  ('admin@gamlp.com',      'DAM',  'administrador'),
  ('javierd@gamlp.com',    'DGEG', 'director'),
  ('franz@gamlp.com',      'DGEG', 'jefe_unidad'),
  ('willam@gamlp.com',     'DAM',  'rol_especializado')
) as v(correo, sigla, rol)
join usuario u  on u.correo = v.correo
join unidad  un on un.sigla = v.sigla
on conflict (usuario_id, unidad_id, rol_codigo) do nothing;

-- ---------- Verificación: que ningún correo quede huérfano ----------
-- Un usuario de `cmi.usuario` que no exista en `auth.users` no puede entrar
-- nunca, y uno de `auth.users` sin ámbito entra pero no puede marcar. Las dos
-- cosas fallan calladas, así que se comprueban acá y la migración ABORTA.
do $$
declare
  sin_auth   text;
  sin_ambito text;
begin
  select string_agg(u.correo, ', ') into sin_auth
  from usuario u
  where not exists (select 1 from auth.users a where a.email = u.correo);

  if sin_auth is not null then
    raise exception
      'Estos correos de cmi.usuario NO existen en auth.users: %. '
      'Revisá mayúsculas: la API de Supabase normaliza el correo a minúsculas.', sin_auth;
  end if;

  select string_agg(a.email, ', ') into sin_ambito
  from auth.users a
  where not exists (
    select 1 from usuario u join usuario_ambito ua on ua.usuario_id = u.id
    where u.correo = a.email
  );

  if sin_ambito is not null then
    raise exception
      'Estas cuentas de auth.users entran a la app pero quedan SIN ROL: %.', sin_ambito;
  end if;

  raise notice 'Acceso poblado: % usuarios, % ámbitos, 0 huérfanos en cualquier dirección.',
    (select count(*) from usuario), (select count(*) from usuario_ambito);
end $$;

-- Fin migración 0017.
