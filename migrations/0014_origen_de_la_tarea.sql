-- ============================================================================
-- Migración 0014 · De qué eventos viene cada tarea — trazabilidad de verdad
--
-- LA PREGUNTA DE CÉSAR (10-ago)
--   «Cuando se enriquece un compromiso queda registro de dónde y cuándo se enriqueció,
--    ¿cierto? Eso es muy importante.»
--
--   Quedaba, pero a medias. La bitácora guarda quién, cuándo se CARGÓ y por qué, y eso
--   permite leer la historia de una tarea. Pero tres cosas faltaban:
--
--     1. La FECHA DEL EVENTO estaba solo en prosa. Los 6 enriquecimientos dicen
--        `ts = 10-ago` porque es cuando se cargaron; que la inspección fue el 07-ago
--        vivía dentro de una frase.
--     2. La FUENTE no era un dato. C168 y C278 ni mencionan el archivo.
--     3. No se podía preguntar al revés: «¿qué compromisos tocó la inspección del
--        07-ago?». Eso obliga a leer justificaciones a mano — que es no tenerlo.
--
--   Y una cuarta: `tarea.entrada_texto` guarda UNA materia prima. C316 nació de Gallardo
--   y se enriqueció desde Cota Cota; la segunda transcripción no quedaba ligada.
--
-- QUÉ HACE ESTA TABLA
--   Un renglón por CADA VEZ que un evento tocó una tarea. Al darla de alta, uno. Al
--   enriquecerla, otro. Nunca se pisan: es append-only como todo el resto.
--
--   Con eso se responde en las dos direcciones:
--     · desde la tarea  → de qué eventos viene, en orden, con su cita y su archivo
--     · desde el evento → qué compromisos generó o tocó
--
--   La bitácora sigue siendo el registro general de TODO lo que le pasó a una tarea
--   (altas, correcciones, bajas). Esta tabla es específica del ORIGEN, que es lo que hay
--   que poder reconstruir dentro de un año cuando alguien pregunte de dónde salió algo.
-- ============================================================================
set search_path to cmi, public;

create table if not exists tarea_origen (
  id            bigserial primary key,
  tarea_id      bigint not null references tarea(id) on delete cascade,
  -- 'alta' = el evento que la originó · 'enriquecimiento' = un evento posterior que le
  -- sumó contexto sin crear una tarea nueva (la regla del cotejo: enriquecer, no clonar).
  tipo          text not null check (tipo in ('alta', 'enriquecimiento')),
  -- CUÁNDO OCURRIÓ el evento, no cuándo se cargó. `registrado_en` guarda lo segundo.
  fecha_evento  date,
  evento        text,          -- «Inspección Laguna Cota Cota», «Entrega de obra Calle Gallardo»
  lugar         text,
  fuente        text,          -- ruta del archivo de transcripción o del documento
  agenda_evento_id bigint references agenda_evento(id),
  -- La cita que ESE evento aportó. `tarea.antecedente` las acumula todas juntas; acá
  -- queda separada por evento, que es como se puede auditar.
  cita          text,
  nota          text,
  usuario       text not null,
  registrado_en timestamptz not null default now()
);

create index if not exists ix_tarea_origen_tarea  on tarea_origen(tarea_id);
create index if not exists ix_tarea_origen_fecha  on tarea_origen(fecha_evento);

comment on table tarea_origen is
  'De qué eventos viene cada tarea: uno por el alta y uno por cada enriquecimiento. Append-only. Responde en las dos direcciones — de qué eventos viene una tarea, y qué tareas tocó un evento.';

-- Qué compromisos tocó cada evento. Es la consulta que antes obligaba a leer
-- justificaciones a mano.
create or replace view v_evento_tareas as
select o.fecha_evento, o.evento, o.lugar, o.fuente,
       count(*)                                          as tareas,
       count(*) filter (where o.tipo = 'alta')            as nuevas,
       count(*) filter (where o.tipo = 'enriquecimiento') as enriquecidas,
       string_agg(t.codigo, ' ' order by t.codigo)        as codigos
  from tarea_origen o
  join tarea t on t.id = o.tarea_id
 group by o.fecha_evento, o.evento, o.lugar, o.fuente
 order by o.fecha_evento desc;

comment on view v_evento_tareas is
  'Qué compromisos generó o tocó cada evento captado, con sus códigos.';

-- Tareas que vienen de MÁS DE UN evento: el alcalde volvió sobre el mismo compromiso.
-- Es información de gestión, no un problema: dice qué temas insiste.
create or replace view v_tarea_reiterada as
select t.id as tarea_id, t.codigo, left(t.titulo, 70) as titulo,
       count(*)                as veces,
       min(o.fecha_evento)     as primera,
       max(o.fecha_evento)     as ultima,
       string_agg(coalesce(o.evento, '—') || ' (' || coalesce(o.fecha_evento::text, 's/f') || ')',
                  ' · ' order by o.fecha_evento) as eventos
  from tarea_origen o
  join tarea t on t.id = o.tarea_id
 group by t.id, t.codigo, t.titulo
having count(*) > 1;

comment on view v_tarea_reiterada is
  'Compromisos sobre los que el Alcalde volvió en más de un evento. Dice en qué insiste.';
