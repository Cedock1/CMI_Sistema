-- ============================================================================
-- Migración 0008 · v_conciliacion_poa — capturar una vista que existía fuera de las migraciones
--
-- POR QUÉ ESTA MIGRACIÓN NO AGREGA NADA NUEVO
--   La vista YA EXISTE en `cmi` desde la Fase 2, pero **no estaba en ningún archivo de
--   migración**: se creó a mano en una sesión y se aplicó directo a la base. La deriva
--   apareció al montar `cmi_pruebas`, que reproduce las migraciones de cero: dieron
--   10 vistas contra las 11 de `cmi`, y la que faltaba era esta.
--
--   Eso es exactamente lo que el esquema de pruebas tenía que revelar. Sin él, el día
--   que alguien reconstruyera el CMI desde `migrations/` —una instancia nueva, una
--   secretaría replicada, una recuperación— la conciliación POA no habría estado, y
--   nadie se habría enterado hasta necesitarla.
--
--   La definición de abajo es la que está corriendo hoy, extraída con `pg_get_viewdef`.
--   `create or replace` la deja igual en `cmi` (no rompe nada) y la crea donde falte.
--
-- QUÉ HACE LA VISTA (D32)
--   Cruza tres cosas por proyecto —prioridad RICE, plata asignada y avance— y levanta
--   tres alertas:
--     · prioritario sin plata      → lo más valorado no tiene presupuesto
--     · plata en no prioritario    → hay presupuesto donde el RICE dice que no urge
--     · plata sin avance           → se ejecutó gasto y la obra no se movió
--   La prioridad es RELATIVA (terciles por `percent_rank`), no un umbral fijo: lo que
--   importa es el orden entre proyectos, no un número absoluto que envejece.
--
--   ⚠ Hoy las tres alertas dan vacío porque `poa_partida` y `ejecucion` están vacías:
--   falta el export de piso 8 (partida, monto, a qué tarea corresponde). La vista está
--   lista y espera el dato.
-- ============================================================================
set search_path to cmi, public;

create or replace view v_conciliacion_poa as
 with agg as (
   select a.proyecto_id,
          sum(t.presupuesto_vigente)              as asignado,
          sum(coalesce(ej.ejecutado, 0::numeric)) as ejecutado,
          avg(t.rice_puntaje)                     as rice_prom
     from cmi.tarea t
     join cmi.actividad a on a.id = t.actividad_id
     left join (select ejecucion.tarea_id, sum(ejecucion.monto) as ejecutado
                  from cmi.ejecucion group by ejecucion.tarea_id) ej on ej.tarea_id = t.id
    group by a.proyecto_id
 ), prio as (
   -- Terciles por percent_rank: la prioridad es relativa al resto, no un corte fijo.
   select agg_1.proyecto_id, agg_1.rice_prom,
          percent_rank() over (order by agg_1.rice_prom) as pr
     from agg agg_1
    where agg_1.rice_prom is not null
 )
 select p.id as proyecto_id,
        p.nombre,
        agg.rice_prom,
        case when r.pr >= 0.66::double precision then 'alta'::text
             when r.pr <  0.33::double precision then 'baja'::text
             else 'media'::text end as prioridad_rel,
        coalesce(agg.asignado, 0::numeric)  as presupuesto_asignado,
        coalesce(agg.ejecutado, 0::numeric) as ejecutado,
        case when coalesce(agg.asignado, 0::numeric) > 0::numeric
             then round(coalesce(agg.ejecutado, 0::numeric) / agg.asignado, 3)
             else null::numeric end as pct_ejecucion,
        av.avance,
        r.pr >= 0.66::double precision
          and coalesce(agg.asignado, 0::numeric) = 0::numeric  as alerta_prioritario_sin_plata,
        coalesce(agg.asignado, 0::numeric) > 0::numeric
          and r.pr < 0.33::double precision                    as alerta_plata_en_no_prioritario,
        coalesce(agg.ejecutado, 0::numeric) > 0::numeric
          and coalesce(av.avance, 0::numeric) < 0.10           as alerta_plata_sin_avance
   from cmi.proyecto p
   left join agg  on agg.proyecto_id = p.id
   left join prio r on r.proyecto_id = p.id
   left join cmi.v_avance_proyecto av on av.proyecto_id = p.id;

comment on view v_conciliacion_poa is
  'Conciliación POA ↔ CMI (D32): cruza prioridad RICE, presupuesto asignado y avance por proyecto, y levanta las tres alertas. Espera el export de piso 8 para tener datos.';
