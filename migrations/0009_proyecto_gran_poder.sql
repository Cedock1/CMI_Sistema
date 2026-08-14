-- ============================================================================
-- Migración 0009 · Proyecto «Entrada del Gran Poder»
--
-- POR QUÉ ES UN CASO ESPECIAL, Y HAY QUE DECIRLO
--   Los 386 proyectos del CMI salen de la matriz del Plan Ciudad Humana. **Este no.**
--   El Plan no tiene ningún proyecto para la Entrada del Gran Poder — se verificó contra
--   `docs/Proyectos_matriz_CiudadHumana.csv` y no hay coincidencia.
--
--   Lo detectó el propio embudo: al procesar una reunión de coordinación del Gran Poder
--   devolvió `proyecto_id: 0` con el motivo «ninguno del catálogo encaja con precisión»,
--   en vez de forzar uno. César pidió crearlo (10-ago).
--
--   Es el **primer proyecto que el CMI agrega por fuera del Plan**, y tiene que poder
--   distinguirse: si mañana alguien compara el CMI contra la matriz, necesita ver cuál es
--   de más y por qué, sin arqueología. Para eso se agrega la columna `proyecto.origen`.
--
--   ⚠ Primero intenté marcarlo con `tipo = 'fuera_de_plan'` y la base lo rechazó: `tipo`
--   tiene un CHECK con cuatro valores (estrategico/general/fortalecimiento/paraguas) y
--   describe la NATURALEZA del proyecto, no su procedencia. Meter ahí la procedencia
--   habría mezclado dos preguntas distintas en una columna. La restricción tenía razón.
--
-- QUÉ CUBRE, Y SOBRE TODO QUÉ NO
--   Cubre el evento COMO EVENTO: su organización, el operativo del recorrido, la
--   coordinación con las fraternidades y con los sectores.
--
--   NO absorbe las tareas del Gran Poder que ya existen, y eso es deliberado. Hay cinco,
--   repartidas en cuatro proyectos distintos POR MATERIA (D20):
--     C134 bolardos        → Regulación del Espacio Público   (EJE-08)
--     C136 cámaras         → Barrios Seguros desde la Comunidad (EJE-05)
--     C138 aceras          → Caminabilidad Distrital           (EJE-08)
--     C287 iluminación     → La Vía es Nuestra                 (EJE-08)
--     C139 cambio de ruta  → Casa Ordenada                     (EJE-06)
--   Traerlas acá sería agrupar por EVENTO en vez de por materia — exactamente lo que D20
--   prohíbe— y le sacaría a EJE-08 tres tareas que sí son movilidad. Reparar una acera
--   sigue siendo caminabilidad aunque se repare para una fiesta.
--
-- DÓNDE VA
--   EJE-06 · programa «Culturas para la Vida» (id 46), al lado de «Festival de la Paz»:
--   misma naturaleza —producir una fiesta de ciudad— y así el rollup del programa suma
--   las dos grandes festividades juntas.
--
-- ⚠ LA META NECESITA REVISIÓN, COMO LAS OTRAS 84
--   Se redactó sin tareas todavía cargadas, así que describe la INTENCIÓN del proyecto,
--   no lo que sus tareas cubren. Entra en la misma revisión pendiente de César y las
--   secretarías. Cuando se capten sus compromisos, conviene reescribirla desde ellos.
-- ============================================================================
set search_path to cmi, public;

-- De dónde salió el proyecto. Los 386 vienen de la matriz del Plan; los que agregue el
-- CMI se marcan, para que la comparación contra el Plan siga siendo posible.
alter table proyecto add column if not exists origen text not null default 'plan';
alter table proyecto drop constraint if exists proyecto_origen_ck;
alter table proyecto add  constraint proyecto_origen_ck check (origen in ('plan', 'cmi'));

comment on column proyecto.origen is
  'plan = viene de la matriz Ciudad Humana · cmi = lo agregó el CMI porque el Plan no lo tenía. Sirve para comparar el CMI contra el Plan sin arqueología.';

insert into proyecto (programa_id, nombre, tipo, origen, objetivo, meta, indicador, resultado_2030)
select 46,
  'Entrada del Gran Poder',
  'general',
  'cmi',
  'Que la fiesta mayor de La Paz se realice con un operativo coordinado entre todas las '
  || 'secretarías que intervienen, sin que el vecino, el visitante ni el fraterno sufran '
  || 'la improvisación.',
  'Operativo integral de la Entrada del Gran Poder ejecutado de forma coordinada entre las '
  || 'secretarías que intervienen —movilidad, seguridad, culturas, comunicación y la '
  || 'subalcaldía del recorrido—, con acuerdo previo con las fraternidades, en la edición 2027.',
  '# de secretarías con responsabilidad asignada y cumplida en el operativo · '
  || 'días de anticipación con que se publican los desvíos · '
  || '# de incidentes reportados durante el recorrido',
  'Entrada del Gran Poder organizada bajo un protocolo municipal permanente, con roles '
  || 'definidos por secretaría y acuerdos estables con las fraternidades, sin rearmarse '
  || 'de cero cada año.'
where not exists (select 1 from proyecto where nombre = 'Entrada del Gran Poder');

