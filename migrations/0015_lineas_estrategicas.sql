-- ============================================================================
-- Migración 0015 · Líneas estratégicas y el esquema de hitos
--
-- QUÉ RESUELVE
--   En el gabinete del 12-ago el Alcalde rechazó el reporte de resultados con
--   dos preguntas que el CMI hoy no puede contestar:
--
--     «contra qué vamos a contrastar los resultados… contra nuestro 30-60-100»
--     «¿dónde está el plan 30-60-100? … necesito saber si hemos avanzado o no
--      sobre los temas estratégicos»
--
--   Y la Dirección de Gestión Estratégica cerró su propia presentación diciendo
--   que «lo que falta es el cruce entre el plan, la matriz de planificación, y
--   estos resultados».
--
--   El CMI mide eje → programa → proyecto → actividad → tarea → subtarea. Las
--   LÍNEAS ESTRATÉGICAS —las apuestas de gestión que el Alcalde enumera de
--   memoria— no existían como objeto. Sin ellas no hay dónde leer «¿avanzamos
--   en lo estratégico?», por más compromisos que se capten.
--
-- POR QUÉ NO SON TAREAS
--   El 13-ago se decidió NO registrarlas como compromisos: no tienen plazo ni
--   entregable único, y cargarlas habría metido ~40 obras plurianuales con el
--   semáforo naciendo en rojo. Son el NIVEL CONTRA EL CUAL se mide el resto.
--
-- LA LÍNEA NO REEMPLAZA AL EJE  (ojo, esto ya costó caro una vez)
--   D20 dejó dos criterios de eje conviviendo con 43% de divergencia. Acá se
--   agrega un segundo modo de agrupar, y hay que decir en qué se diferencian:
--     · el EJE dice de qué MATERIA es el compromiso (criterio del Plan);
--     · la LÍNEA dice a qué APUESTA DE GESTIÓN aporta (criterio del Alcalde).
--   Un compromiso puede tener eje y no tener línea. Nunca se deriva uno del otro.
--
-- REFERENCIA: docs/Bitacora_de_decisiones_CMI.md · D55
-- ============================================================================
set search_path to cmi, public;

-- ---------- 1 · Las líneas ----------
--
-- La lista se movió TRES VECES EN TRES DÍAS: 14 el 12-ago (gabinete), 17 el
-- 13-ago (Javier: «los 17 no me quedaron claro»), 21 el 13-ago (lista de César).
-- Por eso `version_lista` y `fecha_lista`: va a volver a moverse, y cuando pase
-- hay que poder decir contra qué versión se midió, en vez de descubrir que el
-- denominador cambió sin aviso.
create table if not exists linea_estrategica (
  id             serial primary key,
  codigo         text unique not null,
  nombre         text not null,
  secretaria     text,                       -- cabeza; texto hasta casar con el MOF
  unidad_id      integer references unidad(id),
  orden          integer,
  version_lista  text not null default 'v21-2026-08-13',
  fecha_lista    date not null default '2026-08-13',
  vigente        boolean not null default true,
  nota           text
);

comment on table linea_estrategica is
  'Apuestas de gestión del Alcalde (21 al 13-ago-2026). No son proyectos del Plan ni tareas: son el nivel contra el cual se mide el avance estratégico.';
comment on column linea_estrategica.version_lista is
  'La lista creció de 14 a 21 en tres días. Sin versión, un cambio de denominador pasa inadvertido.';

-- ---------- 2 · El esquema de hitos ----------
--
-- Ocho hitos idénticos para toda línea. NO se inventaron acá: son los que ALAX
-- ya usa y que el Alcalde mandó replicar —«esa ruta crítica debería ser el
-- método para que todas las secretarías trabajen sobre ese método» (13-ago)—.
-- El propósito explícito es «que ningún responsable invente sus propios pasos
-- ni su propia granularidad».
create table if not exists hito_estandar (
  codigo     text primary key,
  orden      integer not null,
  nombre     text not null,
  entregable text not null,
  responsable_tipo text
);

insert into hito_estandar (codigo, orden, nombre, entregable, responsable_tipo) values
  ('H1', 1, 'Alcance y responsable',    'Ficha firmada por la secretaría cabeza',        'secretaria_cabeza'),
  ('H2', 2, 'Cobertura POA y presupuesto','Certificación POA y presupuestaria',          'planificacion_finanzas'),
  ('H3', 3, 'Línea base',               'Estado inicial verificable del problema',       'secretaria_cabeza'),
  ('H4', 4, 'Ejecución',                'Avance físico con medio de verificación',       'secretaria_cabeza'),
  ('H5', 5, 'Verificación',             'Constatación en terreno',                       'secretaria_cabeza'),
  ('H6', 6, 'Habilitación normativa',   'Norma o resolución, si aplica',                 'juridica'),
  ('H7', 7, 'Entrega pública',          'Acto y pieza comunicacional',                   'comunicacion'),
  ('H8', 8, 'Medición',                 'Indicador de RESULTADO, no de actividad',       'gabinete')
on conflict (codigo) do nothing;

-- H2 no es burocracia: existe porque el Alcalde se compromete en inspecciones
-- con cosas no inscritas en el POA que, por normativa nacional, no se pueden
-- ejecutar. Es el mismo hallazgo que Franz explicó el 10-ago y el riesgo #5 de
-- la hoja de ruta de ALAX. Bloquea el anuncio, no solo la ejecución.

-- ---------- 3 · El avance de cada línea por hito ----------
create table if not exists linea_hito (
  id          serial primary key,
  linea_id    integer not null references linea_estrategica(id) on delete cascade,
  hito        text not null references hito_estandar(codigo),
  entregable  text,
  responsable text,
  fecha_objetivo date,
  fecha_real  date,
  estado      text not null default 'pendiente'
              check (estado in ('pendiente','en_curso','cumplido','no_aplica')),
  evidencia   text,
  nota        text,
  unique (linea_id, hito)
);

comment on table linea_hito is
  'Regla de operación de ALAX, adoptada como general: ningún servicio avanza al hito siguiente sin el entregable del anterior.';

-- ---------- 4 · El vínculo con lo ya captado ----------
--
-- Opcional a propósito. Un compromiso puede no pertenecer a ninguna línea, y eso
-- se ve; forzar la atribución para que no quede vacío es exactamente lo que las
-- reglas de captura prohíben (`vacio > equivocado`).
alter table tarea add column if not exists linea_id integer references linea_estrategica(id);
alter table tarea add column if not exists linea_confianza text
  check (linea_confianza in ('alta','media','baja'));

create index if not exists idx_tarea_linea on tarea(linea_id);

-- ---------- 5 · Los dos campos que el gabinete midió como faltantes ----------
--
-- Sobre 225 resultados declarados en julio: solo 54 traían línea base y 3
-- población beneficiaria. Los otros dos huecos que midió —evidencia (190/225) y
-- fecha de la acción (75/225)— el CMI ya los resuelve por diseño con `entregable`
-- (0006, obligatoria para marcar) y `tarea.fecha_real`.
--
-- Se llenan DE AQUÍ EN ADELANTE. Retro-completar 343 compromisos sería inventar.
alter table tarea add column if not exists linea_base text;
alter table tarea add column if not exists poblacion_beneficiaria text;

comment on column tarea.linea_base is
  'Estado inicial verificable del problema que ataca (H3). Vacío en lo captado antes del 13-ago: no se retro-completa.';

-- ---------- 6 · Las 21 líneas ----------
--
-- Lista fijada por César el 13-ago-2026. `secretaria` va en texto porque todavía
-- no se casó contra el catálogo del MOF: se deja el nombre declarado y NULL donde
-- no consta, antes que aproximar una sigla que no existe.
insert into linea_estrategica (codigo, nombre, secretaria, orden) values
  ('LE-01','Comisión de Transparencia',            'Transparencia',                     1),
  ('LE-02','ALAX',                                 'Gestión Eficiente (SEMGE)',         2),
  ('LE-03','Estrategia de Recaudaciones',          'Autoridad Tributaria Municipal',    3),
  ('LE-04','Salud a 1 Paso',                       'Ciudad Vital',                      4),
  ('LE-05','Hospital Móvil de la Mujer',           'Ciudad Vital',                      5),
  ('LE-06','La Paz Inteligente (IoT)',             'Ciudad Inteligente',                6),
  ('LE-07','CITE',                                 'Ciudad Productiva',                 7),
  ('LE-08','Mercados y Comercio Digno',            'Ciudad Productiva',                 8),
  ('LE-09','La Paz Hub de Turismo de Altura',      'Ciudad Cultural, Turismo de Altura y Economía Naranja', 9),
  ('LE-10','Juventud Con Propósito',               null,                               10),
  ('LE-11','La Paz de Oportunidades',              null,                               11),
  ('LE-12','La Paz Iluminada',                     'Ciudad Verde + Ciudad Inteligente', 12),
  ('LE-13','La Paz Sin Baches',                    'Ciudad Conectada',                 13),
  ('LE-14','La Paz No Se Cae',                     'Ciudad Planificada',               14),
  ('LE-15','La Paz Conectada',                     'Ciudad Conectada',                 15),
  ('LE-16','La Paz Sin Trameaje',                  'Ciudad Conectada',                 16),
  ('LE-17','Gestión Integral de Residuos Sólidos', 'Ciudad Verde',                     17),
  ('LE-18','Parque Urbano Central',                'Ciudad Verde',                     18),
  ('LE-19','La Paz Genera Energía',                'Ciudad Verde',                     19),
  ('LE-20','La Paz con Economía Circular',         'Ciudad Verde',                     20),
  ('LE-21','Límites',                              'Ciudad Planificada',               21)
on conflict (codigo) do nothing;

-- La Paz Iluminada la declaró el Alcalde como un solo proceso con dos secretarías:
-- «ahí combina el ciudad verde y ciudad inteligente. Es un solo proceso. No son
-- dos. Es uno solo.» (gabinete, 12-ago). Por eso el texto compuesto.
update linea_estrategica set nota =
  'El Alcalde la declaró explícitamente como UN solo proceso con Ciudad Verde y Ciudad Inteligente juntas (gabinete 12-ago).'
  where codigo = 'LE-12';

update linea_estrategica set nota =
  'Única línea con hitos, fechas y responsable definidos al 13-ago. Su ruta crítica es el modelo que el Alcalde mandó replicar. Doc: ~/Documents/ALAX/'
  where codigo = 'LE-02';

update linea_estrategica set nota =
  'No estaba entre las 14 del gabinete. Entró tras la inspección del 13-ago, que encontró sectores cerrados hace 9 a 15 años y creó una unidad dedicada.'
  where codigo = 'LE-18';

update linea_estrategica set nota =
  'No estaba entre las 14 del gabinete. Es el reclamo recurrente de las subalcaldías del Sur y Mallasa: fiscalizaciones frenadas desde Palca y Mecapaca.'
  where codigo = 'LE-21';

-- ---------- 7 · ALAX, con sus hitos reales ----------
--
-- R0 según la hoja de ruta v1.0 del 13-ago. Se cargan las fechas COMPROMETIDAS,
-- no las deseables: la propia hoja advierte que once días es un plazo severo y
-- que H2–H6 solo se sostienen si el módulo ya está avanzado en el proveedor y la
-- habilitación normativa no requiere ordenanza del Concejo.
insert into linea_hito (linea_id, hito, entregable, responsable, fecha_objetivo)
select l.id, v.hito, v.entregable, v.responsable, v.fecha::date
from linea_estrategica l,
     (values
       ('H1','Ficha de servicio firmada',                       'Ciudad Conectada',        '2026-08-14'),
       ('H2','Certificación POA y presupuestaria',              'Planificación / Finanzas','2026-08-17'),
       ('H3','Padrón de espacios tarifados validado',           'Ciudad Conectada',        '2026-08-17'),
       ('H4','Módulo en ambiente de pruebas',                   'Tecnologías + proveedor', '2026-08-19'),
       ('H5','Informe de piloto en zona acotada',               'Tecnologías',             '2026-08-21'),
       ('H6','Resolución que habilita el pago digital',         'Jurídica',                '2026-08-21'),
       ('H7','App publicada en ambas tiendas + pieza comunicacional','Comunicación',       '2026-08-24'),
       ('H8','Tablero de descargas y transacciones',            'Gabinete',                '2026-08-31')
     ) as v(hito, entregable, responsable, fecha)
where l.codigo = 'LE-02'
on conflict (linea_id, hito) do nothing;

-- ---------- 8 · Cómo se lee el avance ----------
create or replace view v_avance_linea as
select
  l.codigo,
  l.nombre,
  l.secretaria,
  count(distinct t.id)                                              as compromisos,
  count(distinct t.id) filter (where t.linea_confianza = 'baja')     as encaje_dudoso,
  count(distinct h.id) filter (where h.estado = 'cumplido')          as hitos_cumplidos,
  count(distinct h.id)                                              as hitos_definidos,
  min(h.fecha_objetivo) filter (where h.estado <> 'cumplido')        as proximo_hito
from linea_estrategica l
left join tarea t on t.linea_id = l.id
left join linea_hito h on h.linea_id = l.id
where l.vigente
group by l.codigo, l.nombre, l.secretaria, l.orden
order by l.orden;

comment on view v_avance_linea is
  'Responde la pregunta del gabinete: ¿avanzamos o no en lo estratégico? Una fila por línea, con cuántos compromisos la sostienen y en qué hito va.';

-- ---------- 9 · Lo que esta migración NO hace ----------
--   · NO clasifica los 343 compromisos existentes contra las 21 líneas. Eso se
--     razona caso por caso, con `linea_confianza`, y lo revisa César: es el mismo
--     criterio del encaje al Plan. Lo que no case claro queda SIN línea.
--   · NO carga hitos de las otras 20 líneas: al 13-ago solo ALAX los tiene. El
--     resto los devuelve cada secretaría cabeza (paso 3 de la secuencia sugerida
--     en la hoja de ruta de ALAX).
--   · NO toca `eje`. La línea es otra dimensión, no un reemplazo.
