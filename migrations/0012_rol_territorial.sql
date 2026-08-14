-- ============================================================================
-- Migración 0012 · El rol TERRITORIAL — la tercera forma de acompañar
--
-- LA PREGUNTA DE CÉSAR (10-ago)
--   «¿tenemos en cuenta el responsable secundario y apoyo de diferentes subalcaldías?
--    Y cuando el proyecto es muy grande puede haber más de dos responsables.»
--
--   Lo segundo YA estaba resuelto: `tarea_concurrente` no tiene límite, y la regla
--   MULTI-SECRETARÍA lo dice explícito («pueden ser 2, 5 o 20+»). Los datos lo confirman:
--   en Notion hay un compromiso con **5 concurrentes**.
--
--   Lo primero NO. Notion tiene CINCO relaciones de responsable y la Fase 2 trajo dos:
--     · Responsable institucional  295 → `tarea.responsable_unidad_id`   ✓
--     · Concurrentes                62 → rol 'concurrente'               ✓ (recuperado 0007)
--     · Responsable de apoyo        43 → rol 'apoyo'                     ✓ (recuperado 0007)
--     · **Responsable territorial   12 → NO ESTABA**                     ← esta migración
--     · Responsable propuesto       15 → NO es un rol (ver abajo)
--
-- POR QUÉ TERRITORIAL ES UN ROL DISTINTO, Y NO UN APOYO MÁS
--   Los 12 casos son todos SUBALCALDÍAS (SASA, SAC, SAP) con un responsable institucional
--   temático diferente: C075 → institucional UCPAT, territorial SAC. Responden preguntas
--   distintas: el institucional es QUIÉN LO HACE por materia; el territorial es DÓNDE
--   OCURRE y quién responde por ese territorio. Meterlos como 'apoyo' los mezclaría con
--   unidades que acompañan por especialidad, y se perdería el dato de jurisdicción.
--
--   En 2 de los 12 la subalcaldía es las dos cosas (C061 y C062: institucional SASA y
--   territorial SASA). Ahí la guarda `trg_apoyo_distinto` los rechaza — correctamente:
--   una unidad no se acompaña a sí misma. No es un error a corregir; es la guarda
--   diciendo que ya está registrada como principal.
--
-- «RESPONSABLE PROPUESTO» NO SE CARGA, A PROPÓSITO
--   Los 15 casos NO coinciden con el institucional en ninguno. Es el rastro del flujo de
--   `gamlp-chat`: lo que el modelo propuso y el humano confirmó distinto o dejó vacío.
--   Cargarlo como rol convertiría una propuesta descartada en una responsabilidad
--   asignada — exactamente lo contrario de «la IA propone, el humano dispone».
-- ============================================================================
set search_path to cmi, public;

alter table tarea_concurrente drop constraint if exists tarea_concurrente_rol_ck;
alter table tarea_concurrente add  constraint tarea_concurrente_rol_ck
  check (rol in ('concurrente', 'apoyo', 'territorial'));

comment on table tarea_concurrente is
  'Unidades que acompañan un compromiso además del principal (D19, MULTI-SECRETARÍA). Sin límite de cantidad. Tres roles: `concurrente` ejecuta parte del compromiso · `apoyo` acompaña sin ser dueño de un entregable · `territorial` es la subalcaldía donde ocurre, que responde por su jurisdicción aunque no ejecute. El principal vive en tarea.responsable_unidad_id; para leerlos juntos usar v_tarea_unidad.';

-- Quién responde por el TERRITORIO de cada tarea. Se separa del resto porque es la
-- pregunta que más se hace en el despacho: «¿de qué subalcaldía es esto?».
create or replace view v_tarea_territorio as
select t.id as tarea_id, t.codigo, t.titulo, t.lugar_captura,
       un.sigla as subalcaldia, un.nombre as subalcaldia_nombre
  from tarea t
  join tarea_concurrente tc on tc.tarea_id = t.id and tc.rol = 'territorial'
  join unidad un on un.id = tc.unidad_id
union all
-- Cuando el principal ya ES una subalcaldía, es su propio responsable territorial:
-- la guarda impide duplicarlo en la tabla, así que la vista lo une acá.
select t.id, t.codigo, t.titulo, t.lugar_captura, un.sigla, un.nombre
  from tarea t
  join unidad un on un.id = t.responsable_unidad_id
 where un.sigla like 'SA%' and un.nivel is not distinct from un.nivel;

comment on view v_tarea_territorio is
  'De qué subalcaldía es cada tarea: por rol territorial explícito, o porque el responsable principal ya es una subalcaldía.';
