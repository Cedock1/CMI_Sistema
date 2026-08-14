-- ============================================================================
-- Migración 0016 · La línea estratégica se ancla al PROGRAMA, no a la tarea
--
-- QUÉ CORRIGE
--   La 0015 colgó la línea directamente de la tarea (`tarea.linea_id`). Eso
--   saltaba la jerarquía y creaba una segunda dimensión de agrupación en
--   paralelo — exactamente el riesgo que la propia 0015 advertía citando D20.
--
--   César (13-ago): «las 21 según mi lógica llegan a nivel de programa y de ahí
--   se anclan los proyectos y las tareas y subtareas».
--
--   Tiene razón, y simplifica: si la línea vive al nivel del programa, todo lo
--   de abajo hereda por la jerarquía que YA existe, y el rollup de avance ya
--   está construido (v_avance_programa → v_avance_proyecto → tarea). No hace
--   falta una dimensión nueva ni una forma nueva de sumar.
--
--       LÍNEA (21)
--         └─ programa   ← los 100 del Plan + los que faltaban
--              └─ proyecto (387)
--                   └─ actividad (182)
--                        └─ tarea (343)
--                             └─ subtarea
--
-- LA DECISIÓN DE FONDO: la línea AGRUPA programas, no los reemplaza
--   Un proyecto solo puede colgar de UN `programa_id`. Si las líneas fueran los
--   programas y se re-anclaran los proyectos, cada proyecto dejaría de colgar de
--   su programa del Plan y se perdería el cruce con la matriz — que es
--   justamente lo que el gabinete pidió el 12-ago. El Plan está aprobado y sus
--   programas no se tocan: la línea es un atributo del programa.
--
-- COBERTURA: `linea_id` es NULL-able a propósito
--   Un programa del Plan puede no pertenecer a ninguna apuesta de esta gestión, y
--   eso ES información: el Plan es a cinco años y cubre más que las 21 líneas.
--   Forzar la asignación para que no queden huecos es lo que las reglas de
--   captura prohíben (`vacio > equivocado`).
--
-- REFERENCIA: docs/Bitacora_de_decisiones_CMI.md · D55
-- ============================================================================
set search_path to cmi, public;

-- ---------- 1 · El ancla correcta ----------
alter table programa add column if not exists linea_id integer references linea_estrategica(id);
alter table programa add column if not exists linea_confianza text
  check (linea_confianza in ('alta','media','baja'));

create index if not exists idx_programa_linea on programa(linea_id);

comment on column programa.linea_id is
  'A qué apuesta de gestión aporta este programa. NULL es válido: el Plan cubre más que las 21 líneas.';

-- ---------- 2 · Se retira el atajo de la 0015 ----------
-- No hay datos que perder: quedó en 0 de 343 tareas, nunca se clasificó.
--
-- El orden importa: `v_avance_linea` de la 0015 lee `tarea.linea_id`, así que
-- Postgres no deja soltar la columna mientras la vista exista (2BP01). Se tira
-- la vista primero y se la vuelve a crear más abajo, ya sobre la jerarquía real.
drop view if exists v_avance_linea;

alter table tarea drop column if exists linea_id;
alter table tarea drop column if exists linea_confianza;

-- ---------- 3 · Los programas que el Plan no tenía ----------
--
-- Once de las 21 líneas no existen como programa. No es un error del Plan: son
-- apuestas nuevas de esta gestión (ALAX, La Paz Iluminada, Límites…). Se crean
-- como programas bajo el eje que les corresponde por MATERIA, que es el criterio
-- de D20 — nunca por la secretaría que las ejecuta.
insert into programa (nombre, eje_codigo, linea_id, linea_confianza)
select v.nombre, v.eje, l.id, 'alta'
from (values
  ('ALAX — plataforma digital única',        'EJE-01', 'LE-02'),
  ('Estrategia de Recaudaciones',            'EJE-01', 'LE-03'),
  ('Hospital Móvil de la Mujer',             'EJE-02', 'LE-05'),
  ('CITE — Centros de Innovación y Tecnología','EJE-04','LE-07'),
  ('La Paz de Oportunidades',                'EJE-04', 'LE-11'),
  ('La Paz Iluminada',                       'EJE-09', 'LE-12'),
  ('La Paz Sin Baches',                      'EJE-08', 'LE-13'),
  ('La Paz Conectada',                       'EJE-08', 'LE-15'),
  ('La Paz Sin Trameaje',                    'EJE-08', 'LE-16'),
  ('Parque Urbano Central',                  'EJE-09', 'LE-18'),
  ('Límites municipales',                    'EJE-10', 'LE-21')
) as v(nombre, eje, codigo)
join linea_estrategica l on l.codigo = v.codigo
where not exists (select 1 from programa p where p.nombre = v.nombre);

-- La Paz Iluminada va en EJE-09 porque su materia es energía y alumbrado, pero
-- el Alcalde la declaró como UN solo proceso con Ciudad Inteligente: el recambio
-- de luminarias es también el despliegue de la red IoT. Vigilar que no se parta.

-- ---------- 4 · Los programas del Plan que SÍ son una línea ----------
--
-- Solo los que casan por contenido, no por parecido de palabras. Los demás
-- quedan sin línea hasta que alguien los reclame.
update programa set linea_id = l.id, linea_confianza = 'alta'
from linea_estrategica l
where (programa.nombre, l.codigo) in (
  ('Transparencia y Ética Pública Municipal', 'LE-01'),
  ('Salud Primaria Integral',                 'LE-04'),
  ('Ciudad Inteligente',                      'LE-06'),
  ('Mercados y Comercio Digno',               'LE-08'),
  ('Turismo de Altura',                       'LE-09'),
  ('Gestión Integral de Residuos Sólidos',    'LE-17'),
  ('Energías Renovables y Eficiencia Energética','LE-19'),
  ('Economía Circular y Reciclaje Inclusivo', 'LE-20'),
  ('Prevención de Riesgos Urbanos',           'LE-14')
) and programa.linea_id is null;

-- Juventudes con Futuro ↔ Juventud Con Propósito: se marcan como MEDIA. El
-- programa del Plan es más amplio que el esquema de pasantías por brigadas que
-- el Alcalde llamó «Con Propósito» en el gabinete. Puede que corresponda crear
-- el programa aparte; lo decide César.
update programa set linea_id = l.id, linea_confianza = 'media'
from linea_estrategica l
where programa.nombre = 'Juventudes con Futuro' and l.codigo = 'LE-10'
  and programa.linea_id is null;

-- ---------- 5 · El avance, ahora por la jerarquía real ----------
create view v_avance_linea as
select
  l.codigo,
  l.nombre,
  l.secretaria,
  count(distinct pg.id)                                        as programas,
  count(distinct pr.id)                                        as proyectos,
  count(distinct t.id)                                         as compromisos,
  count(distinct t.id) filter (where t.estado = 'Vigente')      as vigentes,
  round(avg(t.avance_fisico) filter (where t.avance_fisico is not null), 1) as avance_promedio,
  count(distinct h.id) filter (where h.estado = 'cumplido')     as hitos_cumplidos,
  count(distinct h.id)                                         as hitos_definidos,
  min(h.fecha_objetivo) filter (where h.estado <> 'cumplido')   as proximo_hito
from linea_estrategica l
left join programa  pg on pg.linea_id  = l.id
left join proyecto  pr on pr.programa_id = pg.id
left join actividad a  on a.proyecto_id  = pr.id
left join tarea     t  on t.actividad_id = a.id
left join linea_hito h on h.linea_id   = l.id
where l.vigente
group by l.codigo, l.nombre, l.secretaria, l.orden
order by l.orden;

comment on view v_avance_linea is
  'Responde «¿avanzamos o no en lo estratégico?» (gabinete 12-ago) recorriendo la jerarquía real: línea → programa → proyecto → actividad → tarea.';

-- ---------- 6 · Lo que queda sin cubrir, visible a propósito ----------
create or replace view v_programa_sin_linea as
select p.id, p.nombre, p.eje_codigo, count(pr.id) as proyectos
from programa p
left join proyecto pr on pr.programa_id = p.id
where p.linea_id is null
group by p.id, p.nombre, p.eje_codigo
order by count(pr.id) desc, p.nombre;

comment on view v_programa_sin_linea is
  'Programas del Plan que no pertenecen a ninguna apuesta de gestión. El hueco es información, no un error a rellenar.';
