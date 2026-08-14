-- ============================================================================
-- Migración 0007 · Concurrentes — que el acompañante deje de ser fantasma
--
-- LA TABLA YA EXISTÍA. Esto NO la crea.
--   `cmi.tarea_concurrente` viene del esquema 0001 (D19), con `(tarea_id, unidad_id,
--   rol)` y **62 filas ya cargadas**. Lo escribo grande porque yo mismo empecé esta
--   migración creándola de nuevo: `create table if not exists` no hizo nada, y la
--   vista siguiente falló pidiendo una columna que yo había inventado. La lección
--   general: **antes de crear, mirar si ya está** — el esquema del CMI es más
--   completo de lo que uno recuerda.
--
-- QUÉ FALTABA DE VERDAD (medido, no supuesto)
--   1. Las 62 filas son TODAS `rol = 'concurrente'`. La migración de la Fase 2 trajo
--      la relación «Concurrentes» de Notion y **dejó afuera «Responsable de apoyo»**.
--      Contra Notion faltan **29 relaciones** mapeables por código, más hasta 18 de
--      las tareas cuyo `Código` quedó vacío allá (las C270–C301). Las trae
--      `scripts/recuperar_concurrentes_notion.py`.
--   2. `rol` no tenía restricción: aceptaba cualquier texto, o nada.
--   3. No había forma de leer "todas las unidades que trabajan en esto" de una vez.
--   4. **El avance no las ponderaba.** Esa es la regla de César del 11-jul y era la
--      única parte de MULTI-SECRETARÍA que el CMI no podía cumplir.
--   5. `unidad.es_descentralizada` estaba en `false` en las 163 filas: la columna
--      existía y nadie la pobló, así que la regla «descentralizada solo como apoyo»
--      no tenía contra qué compararse.
--
-- EL PRINCIPAL NO SE MUEVE ACÁ
--   Sigue en `tarea.responsable_unidad_id`. Esta tabla guarda SOLO quienes acompañan.
--   Duplicarlo daría dos fuentes del mismo dato y algún día discreparían. Para leer
--   todos juntos está `v_tarea_unidad`.
--
-- LAS GUARDAS SON TRIGGERS, NO CONFIANZA EN LA APLICACIÓN
--   Las dos ya se rompieron antes desde el código de gamlp-chat. En la base no.
--
-- LO QUE NO SE BLINDA, A PROPÓSITO
--   «Cada apoyo debe tener ≥1 subtarea» es SEÑAL DE ERROR, no restricción: al dar de
--   alta el compromiso las subtareas todavía no existen, y un trigger haría imposible
--   el alta. Va como vista — que es lo que la regla pide: revisar, no prohibir.
-- ============================================================================
set search_path to cmi, public;

-- ---------------------------------------------------------------- 1. el dato que faltaba

-- Las 6 descentralizadas reales del MOF, nombradas en las reglas de captura
-- (`app/src/fuentes/reglas_captura_v01.json` → responsable.descentralizadas).
update unidad set es_descentralizada = true
 where sigla in ('EMAVERDE', 'EMAVIAS', 'SAMAPA', 'EDMC', 'EDMTB', 'EDMME')
   and es_descentralizada is distinct from true;

-- ---------------------------------------------------------------- 2. completar la tabla existente

alter table tarea_concurrente add column if not exists motivo    text;
alter table tarea_concurrente add column if not exists origen    text not null default 'migracion';
alter table tarea_concurrente add column if not exists creado_en timestamptz not null default now();

-- `rol` aceptaba cualquier texto. Las 62 filas existentes son todas 'concurrente',
-- así que acotarlo no rompe nada. La distinción viene de Notion, que tiene las dos
-- relaciones separadas: `concurrente` ejecuta parte del compromiso, `apoyo` acompaña.
update tarea_concurrente set rol = 'concurrente' where rol is null or btrim(rol) = '';
alter table tarea_concurrente alter column rol set not null;

alter table tarea_concurrente drop constraint if exists tarea_concurrente_rol_ck;
alter table tarea_concurrente add  constraint tarea_concurrente_rol_ck
  check (rol in ('concurrente', 'apoyo'));

create index if not exists ix_tarea_concurrente_unidad on tarea_concurrente(unidad_id);

comment on table tarea_concurrente is
  'Unidades que acompañan un compromiso además del principal (D19, MULTI-SECRETARÍA). El principal vive en tarea.responsable_unidad_id; para leerlos juntos usar v_tarea_unidad.';

-- ---------------------------------------------------------------- 3. guarda: apoyo ≠ principal

-- "Una unidad no se acompaña a sí misma."
--
-- ⚠ Los nombres van CALIFICADOS con `cmi.`. Una función plpgsql resuelve los nombres
-- sin esquema con el `search_path` de QUIEN LA DISPARA, no con el de quien la creó.
-- La primera versión decía `from tarea` y funcionó en la prueba —esa sesión tenía el
-- search_path puesto— pero explotó con «relation "tarea" does not exist» apenas la
-- llamó un script que no lo ponía. En un trigger nunca se asume el search_path.
create or replace function guardar_apoyo_distinto() returns trigger
language plpgsql as $$
declare v_sigla text;
begin
  select un.sigla into v_sigla
    from cmi.tarea t join cmi.unidad un on un.id = t.responsable_unidad_id
   where t.id = new.tarea_id and t.responsable_unidad_id = new.unidad_id;
  if found then
    raise exception '% ya es responsable principal de la tarea %: una unidad no se acompaña a sí misma',
      v_sigla, new.tarea_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_apoyo_distinto on tarea_concurrente;
create trigger trg_apoyo_distinto
  before insert or update of unidad_id, tarea_id on tarea_concurrente
  for each row execute function guardar_apoyo_distinto();

-- ---------------------------------------------------------------- 4. guarda: descentralizada nunca principal

-- No tienen titular cargado: como principal, el aviso no le llegaría a nadie.
create or replace function guardar_descentralizada_no_principal() returns trigger
language plpgsql as $$
declare v_sigla text;
begin
  if new.responsable_unidad_id is null then return new; end if;
  select sigla into v_sigla from cmi.unidad         -- calificado: ver nota del trigger anterior
   where id = new.responsable_unidad_id and es_descentralizada;
  if found then
    raise exception '% es una entidad descentralizada: solo puede acompañar, nunca ser responsable principal (no tiene titular cargado, el aviso no le llegaría a nadie)',
      v_sigla;
  end if;
  return new;
end $$;

drop trigger if exists trg_descentralizada_no_principal on tarea;
create trigger trg_descentralizada_no_principal
  before insert or update of responsable_unidad_id on tarea
  for each row execute function guardar_descentralizada_no_principal();

-- ---------------------------------------------------------------- 5. leer todas juntas

create or replace view v_tarea_unidad as
  select t.id as tarea_id, t.responsable_unidad_id as unidad_id,
         'principal'::text as rol, null::text as motivo
    from tarea t
   where t.responsable_unidad_id is not null
  union all
  select tc.tarea_id, tc.unidad_id, tc.rol, tc.motivo
    from tarea_concurrente tc;

comment on view v_tarea_unidad is
  'Todas las unidades que trabajan en cada tarea: el principal (de tarea) más los acompañantes (de tarea_concurrente).';

-- ---------------------------------------------------------------- 6. el avance las pondera a todas

-- Cada tarea cuenta ENTERA para cada unidad que participa — no se reparte. Es la
-- decisión de César del 11-jul: si una secretaría figura es porque hace algo, y su
-- avance no vale menos por estar acompañada.
--
-- Consecuencia buscada, no error de conteo: la suma de `tareas` de todas las
-- unidades es MAYOR que 300, porque un transversal se cuenta en cada una. Para el
-- total real hay que contar `tarea`, no esta vista.
create or replace view v_avance_unidad as
select
  un.id                                                 as unidad_id,
  un.sigla,
  un.nombre,
  count(*)                                              as tareas,
  count(*) filter (where tu.rol = 'principal')          as como_principal,
  count(*) filter (where tu.rol <> 'principal')         as acompanando,
  count(*) filter (where t.avance_fisico is not null)   as tareas_medidas,
  round(sum(coalesce(t.avance_fisico, 0) * p.esfuerzo)
        / nullif(sum(p.esfuerzo), 0), 2)                as avance
from v_tarea_unidad tu
join tarea        t  on t.id  = tu.tarea_id
join unidad       un on un.id = tu.unidad_id
join v_tarea_peso p  on p.tarea_id = t.id
group by un.id, un.sigla, un.nombre;

comment on view v_avance_unidad is
  'Avance por unidad ponderado por esfuerzo (D06). Un transversal cuenta ENTERO para cada participante: la suma de tareas supera el total real, a propósito.';

-- ---------------------------------------------------------------- 7. la señal de error

-- "Si una unidad figura como apoyo es porque HACE algo → debe tener ≥1 subtarea a su
-- nombre. Un apoyo con cero subtareas es señal de que no se distribuyó el trabajo."
create or replace view v_apoyo_sin_subtarea as
select tc.tarea_id, t.codigo, t.titulo, un.sigla, un.nombre, tc.rol
  from tarea_concurrente tc
  join tarea  t  on t.id  = tc.tarea_id
  join unidad un on un.id = tc.unidad_id
 where not exists (
   select 1 from subtarea s
    where s.tarea_id = tc.tarea_id and s.responsable_unidad_id = tc.unidad_id
 );

comment on view v_apoyo_sin_subtarea is
  'Acompañantes sin ninguna subtarea a su nombre: señal de que no se distribuyó el trabajo. Hay que revisar; no es un error de datos.';
