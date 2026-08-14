-- ============================================================================
-- Migración 0013 · La señal de trabajo sin repartir deja de marcar a los territoriales
--
-- QUÉ SE ROMPIÓ AL AGREGAR EL ROL TERRITORIAL (0012)
--   `v_apoyo_sin_subtarea` marca a los acompañantes que no tienen ninguna pieza a su
--   nombre. La regla que implementa es de MULTI-SECRETARÍA y es explícita:
--
--     «si una unidad figura como responsable de apoyo es porque HACE algo → debe tener
--      ≥1 subtarea a su nombre. Un apoyo con cero subtareas es señal de que no se
--      distribuyó el trabajo.»
--
--   Esa regla fue escrita para `concurrente` y `apoyo`, que figuran **porque ejecutan**.
--   El rol `territorial` que se agregó ayer figura por otra razón: **la subalcaldía
--   responde por su jurisdicción aunque no ejecute nada**. Es la definición que quedó
--   escrita en el comentario de la propia tabla.
--
--   Con la vista sin cambiar, cada territorial nuevo se marcaba como problema. Apareció
--   en la primera propuesta que los usó (Cota Cota): SAS figuraba como territorial de la
--   valoración de contaminación de la laguna —que la ejecuta Gestión Ambiental— y la
--   vista lo señalaba. Darle una subtarea artificial para «acallar» la señal habría sido
--   inventar trabajo; lo correcto es que la señal no lo mire.
--
-- POR QUÉ IMPORTA MÁS QUE UN AJUSTE COSMÉTICO
--   Una señal que marca casos correctos deja de leerse. Hoy `v_apoyo_sin_subtarea`
--   señala ~100 acompañantes heredados con trabajo sin repartir — información real que
--   hay que revisar. Si se le suman todos los territoriales, ese número crece por un
--   motivo que no es un problema y la señal se vuelve ruido.
--
--   Los territoriales sí se pueden consultar aparte: `v_tarea_territorio` los lista.
-- ============================================================================
set search_path to cmi, public;

create or replace view v_apoyo_sin_subtarea as
select tc.tarea_id, t.codigo, t.titulo, un.sigla, un.nombre, tc.rol
  from tarea_concurrente tc
  join tarea  t  on t.id  = tc.tarea_id
  join unidad un on un.id = tc.unidad_id
 -- SOLO los que figuran porque EJECUTAN. El territorial responde por el territorio.
 where tc.rol in ('concurrente', 'apoyo')
   and not exists (
     select 1 from subtarea s
      where s.tarea_id = tc.tarea_id and s.responsable_unidad_id = tc.unidad_id
   );

comment on view v_apoyo_sin_subtarea is
  'Concurrentes y apoyos sin ninguna subtarea a su nombre: señal de que no se distribuyó el trabajo. NO incluye el rol `territorial`, que figura por jurisdicción y no porque ejecute. Es señal para revisar, no un error de datos.';
