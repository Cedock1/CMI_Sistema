-- ============================================================================
-- Vistas del CMI — v_avance (rollup por esfuerzo, D06) y v_conciliacion_poa (D32.4)
-- Bosquejo Fase 0. Postgres/Supabase. Ilustrativo — ajustar nombres al esquema final.
-- Corre en el schema `cmi` (D43).
-- ============================================================================
set search_path to cmi, public;

-- Regla de rollup (D06), documentada y uniforme en todos los niveles:
--   * Hoja = tarea. avance_hoja = tarea.avance_fisico (% declarado, D36).
--   * esfuerzo de la hoja = coalesce(rice_esfuerzo, promedio de hermanos, 1).
--       - si falta el esfuerzo de una tarea → se imputa el promedio de sus hermanas;
--       - si TODAS faltan en el grupo → coalesce a 1 = peso igual (fallback D06).
--   * Avance del padre = Σ(avance_hijo · esfuerzo_hijo) / Σ(esfuerzo_hijo)   (media ponderada
--     = Σ peso_hijo·avance_hijo, con peso_hijo = esfuerzo_hijo / Σ esfuerzo).
--   * Esfuerzo del padre = Σ esfuerzo_hijo (el esfuerzo sube sumado, para el siguiente nivel).
-- Supuesto: toda tarea cuelga de una actividad (si actividad_id es NULL → actividad "genérica"
-- del proyecto; ver §4 del esquema).

-- ---------- Nivel hoja: esfuerzo efectivo de cada tarea (con imputación) ----------
create or replace view v_tarea_peso as
select
  t.id                       as tarea_id,
  t.actividad_id,
  coalesce(t.avance_fisico, 0) as avance,
  coalesce(
    nullif(t.rice_esfuerzo, 0),
    avg(nullif(t.rice_esfuerzo, 0)) over (partition by t.actividad_id),  -- promedio de hermanas
    1                                                                    -- todas faltan → peso igual
  )                          as esfuerzo
from tarea t;

-- ---------- Actividad ----------
create or replace view v_avance_actividad as
select
  actividad_id,
  sum(avance * esfuerzo) / nullif(sum(esfuerzo), 0) as avance,
  sum(esfuerzo)                                     as esfuerzo
from v_tarea_peso
group by actividad_id;

-- ---------- Proyecto (pondera actividades por su esfuerzo agregado) ----------
create or replace view v_avance_proyecto as
select
  a.proyecto_id,
  sum(va.avance * va.esfuerzo) / nullif(sum(va.esfuerzo), 0) as avance,
  sum(va.esfuerzo)                                           as esfuerzo
from v_avance_actividad va
join actividad a on a.id = va.actividad_id
group by a.proyecto_id;

-- ---------- Programa ----------
create or replace view v_avance_programa as
select
  p.programa_id,
  sum(vp.avance * vp.esfuerzo) / nullif(sum(vp.esfuerzo), 0) as avance,
  sum(vp.esfuerzo)                                           as esfuerzo
from v_avance_proyecto vp
join proyecto p on p.id = vp.proyecto_id
group by p.programa_id;

-- ---------- Eje ----------
create or replace view v_avance_eje as
select
  pr.eje_codigo,
  sum(vpg.avance * vpg.esfuerzo) / nullif(sum(vpg.esfuerzo), 0) as avance,
  sum(vpg.esfuerzo)                                            as esfuerzo
from v_avance_programa vpg
join programa pr on pr.id = vpg.programa_id
group by pr.eje_codigo;

-- ---------- Vista unificada (un solo tablero de avance por nivel) ----------
create or replace view v_avance as
  select 'actividad' as nivel, actividad_id::text as id, avance, esfuerzo from v_avance_actividad
  union all select 'proyecto', proyecto_id::text, avance, esfuerzo from v_avance_proyecto
  union all select 'programa', programa_id::text, avance, esfuerzo from v_avance_programa
  union all select 'eje',      eje_codigo,        avance, esfuerzo from v_avance_eje;


-- ============================================================================
-- v_conciliacion_poa (D32.4): por proyecto — prioridad (RICE) vs plata vs avance.
-- Marca las 3 alertas: (a) prioritario SIN plata, (b) plata en NO-prioritario,
-- (c) plata SIN avance. Umbrales relativos (terciles de RICE) + constantes tunables.
-- ============================================================================
create or replace view v_conciliacion_poa as
with
-- plata y RICE agregados a nivel proyecto
agg as (
  select
    a.proyecto_id,
    sum(t.presupuesto_vigente)                as asignado,
    sum(coalesce(ej.ejecutado, 0))            as ejecutado,
    avg(t.rice_puntaje)                       as rice_prom
  from tarea t
  join actividad a on a.id = t.actividad_id
  left join (select tarea_id, sum(monto) as ejecutado from ejecucion group by tarea_id) ej
         on ej.tarea_id = t.id
  group by a.proyecto_id
),
-- prioridad relativa: tercil de RICE entre todos los proyectos con puntaje
prio as (
  select proyecto_id, rice_prom,
         percent_rank() over (order by rice_prom) as pr
  from agg where rice_prom is not null
)
select
  p.id            as proyecto_id,
  p.nombre,
  agg.rice_prom,
  case when r.pr >= 0.66 then 'alta'
       when r.pr <  0.33 then 'baja'
       else 'media' end                       as prioridad_rel,
  coalesce(agg.asignado, 0)                    as presupuesto_asignado,
  coalesce(agg.ejecutado, 0)                   as ejecutado,
  case when coalesce(agg.asignado,0) > 0
       then round(coalesce(agg.ejecutado,0) / agg.asignado, 3) end as pct_ejecucion,
  av.avance,
  -- (a) prioritario alto pero SIN presupuesto
  (r.pr >= 0.66 and coalesce(agg.asignado, 0) = 0)                       as alerta_prioritario_sin_plata,
  -- (b) tiene plata pero es de baja prioridad
  (coalesce(agg.asignado, 0) > 0 and r.pr < 0.33)                       as alerta_plata_en_no_prioritario,
  -- (c) ejecutó plata pero el avance físico es casi nulo (umbral 0.10 tunable)
  (coalesce(agg.ejecutado, 0) > 0 and coalesce(av.avance, 0) < 0.10)    as alerta_plata_sin_avance
from proyecto p
left join agg on agg.proyecto_id = p.id
left join prio r on r.proyecto_id = p.id
left join v_avance_proyecto av on av.proyecto_id = p.id;

-- Notas:
--  * Umbrales: prioridad alta/baja = terciles (0.66 / 0.33) de RICE — relativos, se recalibran solos.
--    El 0.10 de "plata sin avance" es constante tunable.
--  * v_semaforo (plazos) es aparte: usa tarea.plazo vs fecha corriente; no depende de RICE ni de plata.
