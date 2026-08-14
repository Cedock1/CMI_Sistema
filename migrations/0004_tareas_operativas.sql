-- ============================================================================
-- Migración 0004 · Categoría OP — tareas operativas
--
-- QUÉ RESUELVE
--   El CMI trataba como "sin clasificar" (un dato faltante a corregir) lo que en
--   el sistema hermano de compromisos es una categoría deliberada. Sus dos
--   ejemplos canónicos —documentados en `gamlp-avance-2031/LOGICA_DE_EJES.md`—
--   estaban entre nuestras 8 tareas sin eje:
--
--     C015 · «Cambiar el vidrio de la entrada de la oficina del despacho»
--     C056 · «Bailar con los caporales en su próxima presentación»
--
--   El criterio de aquel sistema: una tarea operativa es una acción del día a día
--   que NO hace avanzar ninguno de los ejes estratégicos — gestión doméstica,
--   logística o gestos puntuales. La prueba es «¿esto mueve algún eje, o es tarea
--   interna del despacho?». Es un juicio de contenido, no una regla mecánica:
--   reparar el sistema eléctrico de un centro de salud SÍ es estratégico (avanza
--   un servicio de ciudad); cambiar el vidrio del despacho no.
--
-- CÓMO SE MODELA
--   Como una fila más en `eje`, igual que el sistema hermano la modela como una
--   página más en su base de Ejes. Así reutiliza la llave foránea que ya existe y
--   no hace falta una columna nueva ni un caso especial en cada consulta.
--
--   El peso es CERO: una tarea operativa no aporta ni resta al avance de ningún
--   eje. `v_tarea_peso` le asigna esfuerzo 0, con lo que no entra ni al numerador
--   ni al denominador de la media ponderada — queda fuera del rollup sin tener que
--   filtrarla en los cinco niveles.
--
--   Su RICE se conserva: son puntajes bajos (8 y 6) que las dejan al final del
--   orden por sí solas, y borrarlos escondería que se evaluaron.
-- ============================================================================
set search_path to cmi, public;

-- ---------- 1 · La categoría ----------
insert into eje (codigo, romano, nombre, lema, ambito)
values ('OP', null, 'Tareas operativas',
        'El día a día que no mueve un eje del Plan', 'operativo')
on conflict (codigo) do nothing;

comment on table eje is
  'Los 10 ejes del Plan Ciudad Humana + la categoría OP (tareas operativas, peso 0). '
  'OP no es un eje del Plan: es la bolsa de lo que no aporta a ninguno.';

-- ---------- 2 · Las dos tareas operativas identificadas ----------
-- Se marcan solo estas dos: son los ejemplos canónicos del sistema hermano, así que
-- la clasificación no la está inventando el modelo. Las otras 6 tareas sin eje
-- quedan como están, visibles y pendientes de que una persona decida — que es
-- justamente el punto de mostrarlas aparte en vez de repartirlas en silencio.
update tarea set eje_codigo = 'OP' where codigo in ('C015', 'C056');

insert into bitacora (entidad, entidad_id, accion, usuario, justificacion)
select 'tarea', codigo, 'clasificar_operativa', 'migracion 0004',
       'Marcada como tarea operativa (OP, peso 0). Es uno de los dos ejemplos '
       'canónicos de la categoría en gamlp-avance-2031/LOGICA_DE_EJES.md.'
from tarea where codigo in ('C015', 'C056');

-- ---------- 3 · Peso 0 en el rollup ----------
-- Único cambio en la cadena de vistas: la hoja. Los cuatro niveles de arriba
-- heredan el efecto sin tocarse, porque todos ponderan por el esfuerzo que les
-- llega desde abajo.
create or replace view v_tarea_peso as
select
  t.id            as tarea_id,
  t.actividad_id,
  t.avance_fisico as avance,          -- NULL = sin medición, no 0%
  case
    when t.eje_codigo = 'OP' then 0   -- operativa: no mueve ningún eje
    else coalesce(
      nullif(t.rice_esfuerzo, 0),
      -- El promedio de hermanas ignora a las operativas: si entraran, una tarea
      -- sin esfuerzo estimado heredaría un promedio arrastrado hacia abajo por
      -- ceros que no representan trabajo, sino exclusión.
      avg(nullif(t.rice_esfuerzo, 0)) filter (where t.eje_codigo is distinct from 'OP')
        over (partition by t.actividad_id),
      1
    )
  end             as esfuerzo
from tarea t;

comment on view v_tarea_peso is
  'Esfuerzo efectivo de cada tarea para el rollup (D06). Las operativas pesan 0: '
  'quedan fuera del avance de los ejes sin necesidad de filtrarlas nivel por nivel.';

-- Fin migración 0004.
