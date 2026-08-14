-- ============================================================================
-- Migración 0006 · Entregables — la constancia de que algo se hizo
--
-- QUÉ RESUELVE
--   Marcar una subtarea como hecha no dejaba rastro de EN QUÉ se basó. El clic
--   quedaba en la bitácora, pero no qué se entregó. Sin eso el avance es una
--   afirmación, no una evidencia — y el sistema existe para producir evidencia.
--
-- MODELO
--   Copiado de `drica-sistema` (docs/esquema/drica_esquema_v01.sql → `entregables`),
--   que es la plantilla replicable: el entregable cuelga de la SUBTAREA, no de la
--   tarea, porque la subtarea ya es la unidad de entrega (D18). Se simplifica: sin
--   revisión por rúbrica todavía (allá es el módulo M5), que se puede agregar
--   después colgando una tabla de revisiones de esta.
--
--   APPEND-ONLY, como toda la bitácora: desmarcar no borra el entregable anterior.
--   Si algo se marcó, se desmarcó y se volvió a marcar, quedan las tres constancias
--   y se puede reconstruir qué pasó. Nada se borra (regla dura).
--
-- LA NOTA ES OBLIGATORIA, EL ARCHIVO NO
--   Decisión de César: exigir archivo trabaría las subtareas que no producen uno
--   —una reunión, una gestión, una coordinación— y hoy el riesgo mayor es que
--   nadie marque nada. La nota siempre es posible y ya es constancia: dice qué
--   quedó hecho, quién lo dice y cuándo.
-- ============================================================================
set search_path to cmi, public;

create table if not exists entregable (
  id            bigserial primary key,
  subtarea_id   bigint not null references subtarea(id) on delete cascade,
  -- Qué quedó hecho. Obligatorio: es el mínimo de constancia.
  nota          text not null check (length(btrim(nota)) >= 3),
  -- Archivo o enlace de respaldo. Opcional.
  archivo_ref     text,   -- ruta en el almacenamiento, o URL si es un enlace
  archivo_nombre  text,   -- nombre original, para mostrarlo
  archivo_tipo    text,   -- 'archivo' | 'enlace'
  usuario       text not null,
  creado_en     timestamptz not null default now()
);
create index if not exists ix_entregable_subtarea on entregable(subtarea_id, creado_en desc);

comment on table entregable is
  'Constancia de que una subtarea se dio por hecha: qué se entregó, quién lo dice y '
  'cuándo. Append-only — desmarcar no borra. Réplica simplificada de `entregables` '
  'de drica-sistema, sin la revisión por rúbrica (su módulo M5).';

-- ---------- Quién puede marcar ----------
-- Hoy solo el administrador. El camino de ampliación ya está en el esquema y es el
-- que definió César: administrador → subalcaldías y secretarías (`director`) →
-- direcciones y unidades (`jefe_unidad`). No hace falta modelo nuevo, solo dar de
-- alta usuarios con su ámbito.
insert into usuario (nombre, correo)
values ('César Mérida', 'cesardockm@gmail.com')
on conflict (correo) do nothing;

-- Ámbito = DAM (Despacho Alcalde Municipal), la unidad raíz del organigrama.
-- Administrador sobre la raíz = ve y puede todo, que es la definición del rol.
insert into usuario_ambito (usuario_id, unidad_id, rol_codigo)
select u.id, 1, 'administrador' from usuario u where u.correo = 'cesardockm@gmail.com'
on conflict do nothing;

-- Resuelve el rol de un correo. Devuelve null si no está dado de alta — y sin rol
-- no se marca nada: es preferible que alguien no pueda marcar a que marque sin
-- quedar registrado quién es.
create or replace view v_usuario_rol as
select u.correo, u.nombre, ua.rol_codigo, ua.unidad_id, un.sigla as unidad_sigla
from usuario u
join usuario_ambito ua on ua.usuario_id = u.id
left join unidad un on un.id = ua.unidad_id;

-- Fin migración 0006.
