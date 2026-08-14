-- ============================================================================
-- Migración 0002 · El avance se DERIVA de las subtareas
--
-- Cierra el último insumo de la Fase 3. Antes: `avance_fisico` se cargaba a mano
-- (y estaba vacío en las 300 tareas). Ahora lo calcula la base a partir de las
-- subtareas marcadas, que es el mecanismo de captura elegido: marcar una subtarea
-- es "hecho o no hecho sin discutir" (D18, prueba 2), no una declaración de
-- porcentaje que nadie puede verificar.
--
-- REGLAS (decididas con César, 07-ago):
--   1. BINARIO. avance = subtareas 'Listo' ÷ total. 'En curso' se ve en pantalla
--      pero NO suma: asignarle 50% inventaría una precisión que nadie midió.
--      Vocabulario oficial de `subtarea.estado`, tomado de Notion:
--      'Sin empezar' · 'En curso' · 'Listo'.
--   2. ACCIÓN ÚNICA. Una tarea sin subtareas (D18: 0 subtareas a propósito) no
--      tiene con qué medirse → queda en NULL = "sin reportar", hasta que se marca
--      cerrada con `fecha_real`, y ahí pasa a 100.
--   3. NULL NO ES CERO. `v_tarea_peso` hacía `coalesce(avance_fisico, 0)`, que
--      trataba "nadie lo reportó" igual que "no se hizo nada" — hundía el promedio
--      de cualquier padre con tareas sin medir. Ahora el NULL se propaga y las
--      tareas sin medición se EXCLUYEN del cálculo en vez de contar como cero.
--      Cada nivel informa además su cobertura, para que un 80% sobre 2 de 40
--      tareas no se lea como un 80% del proyecto.
-- ============================================================================
set search_path to cmi, public;

-- ---------- 1 · Función de recálculo ----------
create or replace function cmi.recalcular_avance_tarea(p_tarea_id bigint)
returns void language plpgsql as $$
declare
  v_total   int;
  v_listas  int;
  v_cerrada boolean;
begin
  select count(*), count(*) filter (where estado = 'Listo')
    into v_total, v_listas
    from cmi.subtarea where tarea_id = p_tarea_id;

  select fecha_real is not null into v_cerrada
    from cmi.tarea where id = p_tarea_id;

  update cmi.tarea set avance_fisico = case
      when v_total > 0 then round(v_listas::numeric * 100 / v_total, 2)
      when v_cerrada   then 100      -- acción única cerrada (regla 2)
      else null                      -- sin subtareas y sin cierre → sin reportar
    end
  where id = p_tarea_id;
end $$;

comment on function cmi.recalcular_avance_tarea(bigint) is
  'Deriva tarea.avance_fisico de sus subtareas marcadas Listo (binario, D18). '
  'Sin subtareas: 100 si la tarea tiene fecha_real, NULL si no.';

-- ---------- 2 · Disparadores ----------
create or replace function cmi.trg_subtarea_avance()
returns trigger language plpgsql as $$
begin
  -- En UPDATE con cambio de tarea_id hay dos padres que recalcular, no uno.
  if tg_op in ('UPDATE', 'DELETE') then
    perform cmi.recalcular_avance_tarea(old.tarea_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform cmi.recalcular_avance_tarea(new.tarea_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_subtarea_avance on cmi.subtarea;
create trigger trg_subtarea_avance
  after insert or update or delete on cmi.subtarea
  for each row execute function cmi.trg_subtarea_avance();

-- Cierre de una tarea de acción única. Acotado a `of fecha_real` a propósito:
-- así el UPDATE de avance_fisico que hace la función NO vuelve a disparar el
-- trigger, y no hay recursión.
create or replace function cmi.trg_tarea_cierre_avance()
returns trigger language plpgsql as $$
begin
  perform cmi.recalcular_avance_tarea(new.id);
  return null;
end $$;

drop trigger if exists trg_tarea_cierre_avance on cmi.tarea;
create trigger trg_tarea_cierre_avance
  after update of fecha_real on cmi.tarea
  for each row when (old.fecha_real is distinct from new.fecha_real)
  execute function cmi.trg_tarea_cierre_avance();

-- ---------- 3 · Vistas: el NULL deja de ser 0 ----------
-- Se mantienen los nombres y el orden de las columnas existentes; las de cobertura
-- se agregan AL FINAL, que es lo único que `create or replace view` permite cuando
-- hay vistas dependientes (v_conciliacion_poa cuelga de esta cadena).

create or replace view v_tarea_peso as
select
  t.id            as tarea_id,
  t.actividad_id,
  t.avance_fisico as avance,          -- sin coalesce: NULL = sin medición, no 0%
  coalesce(
    nullif(t.rice_esfuerzo, 0),
    avg(nullif(t.rice_esfuerzo, 0)) over (partition by t.actividad_id),
    1
  )               as esfuerzo
from tarea t;

create or replace view v_avance_actividad as
select
  actividad_id,
  sum(avance * esfuerzo) filter (where avance is not null)
    / nullif(sum(esfuerzo) filter (where avance is not null), 0) as avance,
  sum(esfuerzo)                                                  as esfuerzo,
  coalesce(sum(esfuerzo) filter (where avance is not null), 0)   as esfuerzo_medido,
  count(*) filter (where avance is not null)                     as tareas_medidas,
  count(*)                                                       as tareas_total
from v_tarea_peso
group by actividad_id;

-- Los niveles superiores ponderan por `esfuerzo_medido`, no por el esfuerzo total:
-- usar el total daría a una actividad con 2 de 40 tareas medidas el mismo peso que
-- a una medida por completo.
create or replace view v_avance_proyecto as
select
  a.proyecto_id,
  sum(va.avance * va.esfuerzo_medido) / nullif(sum(va.esfuerzo_medido), 0) as avance,
  sum(va.esfuerzo)                                                          as esfuerzo,
  sum(va.esfuerzo_medido)                                                   as esfuerzo_medido,
  sum(va.tareas_medidas)                                                    as tareas_medidas,
  sum(va.tareas_total)                                                      as tareas_total
from v_avance_actividad va
join actividad a on a.id = va.actividad_id
group by a.proyecto_id;

create or replace view v_avance_programa as
select
  p.programa_id,
  sum(vp.avance * vp.esfuerzo_medido) / nullif(sum(vp.esfuerzo_medido), 0) as avance,
  sum(vp.esfuerzo)                                                          as esfuerzo,
  sum(vp.esfuerzo_medido)                                                   as esfuerzo_medido,
  sum(vp.tareas_medidas)                                                    as tareas_medidas,
  sum(vp.tareas_total)                                                      as tareas_total
from v_avance_proyecto vp
join proyecto p on p.id = vp.proyecto_id
group by p.programa_id;

create or replace view v_avance_eje as
select
  pr.eje_codigo,
  sum(vpg.avance * vpg.esfuerzo_medido) / nullif(sum(vpg.esfuerzo_medido), 0) as avance,
  sum(vpg.esfuerzo)                                                            as esfuerzo,
  sum(vpg.esfuerzo_medido)                                                     as esfuerzo_medido,
  sum(vpg.tareas_medidas)                                                      as tareas_medidas,
  sum(vpg.tareas_total)                                                        as tareas_total
from v_avance_programa vpg
join programa pr on pr.id = vpg.programa_id
group by pr.eje_codigo;

create or replace view v_avance as
  select 'actividad' as nivel, actividad_id::text as id, avance, esfuerzo,
         esfuerzo_medido, tareas_medidas, tareas_total from v_avance_actividad
  union all select 'proyecto', proyecto_id::text, avance, esfuerzo,
         esfuerzo_medido, tareas_medidas, tareas_total from v_avance_proyecto
  union all select 'programa', programa_id::text, avance, esfuerzo,
         esfuerzo_medido, tareas_medidas, tareas_total from v_avance_programa
  union all select 'eje', eje_codigo, avance, esfuerzo,
         esfuerzo_medido, tareas_medidas, tareas_total from v_avance_eje;

-- ---------- 4 · Backfill ----------
-- Deja las 300 tareas coherentes con la regla desde el arranque, sin esperar a que
-- alguien toque una subtarea.
select cmi.recalcular_avance_tarea(id) from cmi.tarea;

-- Fin migración 0002.
