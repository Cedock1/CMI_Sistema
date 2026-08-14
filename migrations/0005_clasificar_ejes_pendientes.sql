-- ============================================================================
-- Migración 0005 · Las 6 tareas que quedaban sin eje
--
-- El eje se asigna POR MATERIA (D20): el tema del que trata la tarea, no la oficina
-- que la ejecuta ni el programa del que cuelga. Cada asignación se justifica con el
-- programa del eje que cubre esa materia — así la decisión es rastreable y no un
-- criterio del momento.
--
-- TRES DE LAS SEIS CAMBIAN respecto de lo que diría la jerarquía, y es el caso que
-- motivó la regla: la verbena paceña es un evento cultural, pero «desplegar seguridad
-- para la verbena» es seguridad ciudadana, y «reunir a las caseras por los espacios de
-- venta» es comercio. El evento no define la materia de cada tarea que lo rodea.
-- ============================================================================
set search_path to cmi, public;

-- codigo · eje · justificación (el programa del eje que cubre la materia)
create temp table _clasif(codigo text, eje text, motivo text) on commit drop;
insert into _clasif values
  ('C256','EJE-07','Derecho propietario del suelo y avasallamiento → programas «Gestión del Suelo y Asentamientos Seguros» y «Catastro Moderno y Justicia Urbana». La materia es la tenencia de la tierra, no el parque.'),
  ('C276','EJE-05','Seguridad ciudadana en evento masivo → programa «Seguridad Ciudadana con Comunidad». Sale de Cultural: el evento es cultural, el despliegue es seguridad.'),
  ('C286','EJE-06','Protección de patrimonio histórico edificado → programa «Patrimonio para el Futuro». Materia y jerarquía coinciden.'),
  ('C289','EJE-04','Medición del aporte económico a la reactivación → programa «Planificación Productiva, Competitividad y Oportunidades Territoriales». Lo que se entrega es una estimación económica.'),
  ('C291','EJE-04','Ordenamiento de comerciantes y puestos de venta → programa «Mercados y Comercio Digno». Sale de Cultural por la misma razón que C276.'),
  ('C299','EJE-02','Normativa de establecimientos de salud → programa «Salud Primaria Integral». Materia y jerarquía coinciden.');

update tarea t set eje_codigo = c.eje
from _clasif c where t.codigo = c.codigo and t.eje_codigo is null;

insert into bitacora (entidad, entidad_id, accion, usuario, justificacion)
select 'tarea', c.codigo, 'clasificar_eje', 'migracion 0005',
       'Eje ' || c.eje || ' asignado por MATERIA (D20). ' || c.motivo
from _clasif c;

-- Fin migración 0005.
