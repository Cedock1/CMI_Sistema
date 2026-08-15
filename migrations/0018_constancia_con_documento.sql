-- ============================================================================
-- Migración 0018 · La constancia exige documento, con excepción declarada (D56.4)
--
-- QUÉ CAMBIA Y POR QUÉ
--   La 0006 dejó la nota obligatoria y el archivo OPCIONAL, con este motivo
--   escrito: «exigir archivo trabaría las subtareas que no producen uno —una
--   reunión, una gestión— y hoy el riesgo mayor es que nadie marque nada».
--   El motivo sigue siendo válido; lo que cambió es el contexto. Hasta hoy
--   marcaba UNA sola persona, la que administra el sistema. Desde D56 marcan
--   cuatro, y César lo planteó así: «necesito verificarles un entregable, o sea
--   algún documento que certifique que esto se hizo».
--
-- LA REGLA NUEVA
--   Para dar por hecha una subtarea hay que dejar respaldo: un archivo o un
--   enlace. Si la subtarea genuinamente no produce documento, hay que DECLARARLO
--   y escribir por qué. La nota sigue siendo obligatoria en los dos casos.
--
--   No es «archivo obligatorio a secas» porque eso congelaría las subtareas de
--   gestión y el avance con ellas — el riesgo que la 0006 identificó bien. Con
--   la excepción declarada no se traba nadie, y lo que se marcó sin respaldo
--   queda CONTADO Y VISIBLE en vez de confundirse con lo que sí lo tiene. Es el
--   mismo principio de siempre: nunca vacío en silencio.
--
-- POR QUÉ EL CHECK Y NO SOLO LA VALIDACIÓN DE LA RUTA
--   La ruta ya valida, pero la base es el único lugar por donde pasan TODAS las
--   escrituras: los scripts de carga no pasan por Next. Una regla que solo vive
--   en la ruta se saltea sin querer la primera vez que alguien escribe por SQL.
--
-- RETROACTIVIDAD: ninguna. Hoy `entregable` tiene 0 filas, así que no hay nada
--   que retro-completar; si las hubiera tampoco se tocarían — es append-only.
-- ============================================================================
set search_path to cmi, public;

alter table entregable
  add column if not exists sin_documento_motivo text;

comment on column entregable.sin_documento_motivo is
  'Por qué esta subtarea no produjo documento. Excluyente con archivo_ref: o hay '
  'respaldo, o hay una explicación de por qué no lo hay. Nunca las dos ni ninguna.';

-- Exactamente UNA de las dos cosas. Declarar «no produce documento» mientras se
-- adjunta uno es contradictorio, así que también se rechaza.
--
-- El mínimo de 10 caracteres es deliberado: deja pasar «fue una reunión» (15) y
-- rechaza «no aplica» (9). Un motivo que no dice nada no es una excepción
-- declarada, es la regla salteada con otro nombre.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_entregable_respaldo'
      and conrelid = 'cmi.entregable'::regclass
  ) then
    alter table entregable add constraint ck_entregable_respaldo check (
      (archivo_ref is not null and sin_documento_motivo is null)
      or
      (archivo_ref is null and length(btrim(coalesce(sin_documento_motivo, ''))) >= 10)
    );
  end if;
end $$;

-- ---------- La señal ----------
-- Qué se dio por hecho sin un documento detrás. No es una lista de errores: la
-- excepción es legítima. Es la lista de lo que, si alguien pregunta «¿con qué
-- lo prueban?», se responde con una explicación y no con un archivo.
create or replace view v_constancia_sin_documento as
select e.id            as entregable_id,
       t.codigo        as tarea,
       t.titulo        as tarea_titulo,
       s.id            as subtarea_id,
       s.nombre        as subtarea,
       e.nota,
       e.sin_documento_motivo as motivo,
       e.usuario,
       e.creado_en,
       un.sigla        as responsable
from entregable e
join subtarea s on s.id = e.subtarea_id
join tarea    t on t.id = s.tarea_id
left join unidad un on un.id = t.responsable_unidad_id
where e.archivo_ref is null
order by e.creado_en desc;

comment on view v_constancia_sin_documento is
  'Constancias que se apoyan en una explicación y no en un documento (D56.4). '
  'La excepción es válida; esta vista existe para que se pueda medir cuánta hay.';

-- Fin migración 0018.
