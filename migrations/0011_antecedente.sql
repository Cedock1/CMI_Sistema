-- ============================================================================
-- Migración 0011 · Antecedente — la cita textual de lo que dijo el alcalde
--
-- QUÉ SE PERDIÓ
--   El sistema de compromisos guarda, junto a cada tarea, la **cita literal** de lo que
--   el alcalde dijo. Es un campo obligatorio allá y su regla es explícita
--   (`gamlp-chat/lib/prompts.js:176`):
--
--     «antecedente: CITA TEXTUAL literal de lo que dijo el alcalde (obligatorio,
--      NO corrijas la cita: va verbatim, tal como se dijo).»
--
--   En Notion **179 de los 300** compromisos la tienen. La migración de la Fase 2 no la
--   trajo: la columna no existía en el CMI. `scripts/recuperar_antecedente_notion.py`
--   las trae.
--
-- POR QUÉ IMPORTA MÁS DE LO QUE PARECE
--   La descripción la redacta el modelo — es interpretación. La cita es lo ÚNICO que no
--   se puede discutir: dice qué se dijo, con esas palabras. Cuando dentro de un año
--   alguien pregunte «¿de dónde salió este compromiso?», la respuesta no puede ser un
--   resumen; tiene que ser la frase.
--
--   Por eso va VERBATIM, sin corregir ni la ortografía. La `descripcion` sí se corrige
--   (el audio viene ruidoso y hay que entender la intención); la cita no. Son dos campos
--   con dos contratos distintos y mezclarlos arruina al segundo.
--
-- TAMBIÉN EN LA SUBTAREA
--   La misma regla aplica a cada pieza: «antecedente: la cita textual si la hubo (o "")».
--   Y ahí se combina con `subtarea.inferida`, que el CMI **sí** conserva poblado
--   (206 `dictada` · 26 `sugerida`): dictada = la dijo el alcalde y nace activa;
--   sugerida = la infirió el modelo y la confirma el despacho. Una subtarea `dictada`
--   sin cita es una contradicción — si se dictó, hay frase.
-- ============================================================================
set search_path to cmi, public;

alter table tarea    add column if not exists antecedente text;
alter table subtarea add column if not exists antecedente text;

comment on column tarea.antecedente is
  'Cita TEXTUAL y literal de lo que dijo el alcalde. VERBATIM: no se corrige ni la ortografía — a diferencia de `descripcion`, que sí se redacta. Es la prueba de origen del compromiso.';

comment on column subtarea.antecedente is
  'Cita textual de la pieza, si la hubo. Una subtarea con inferida=''dictada'' debería tener una.';

-- Las que se dictaron y no tienen cita: no es un error de datos, es algo para revisar.
-- Se declara como vista en vez de forzarlo con una restricción, porque las 206 heredadas
-- nacieron sin el campo y prohibirlo ahora bloquearía la recuperación.
create or replace view v_dictada_sin_cita as
select s.id, s.tarea_id, t.codigo, left(t.titulo, 60) as tarea, left(s.nombre, 70) as subtarea
  from subtarea s
  join tarea t on t.id = s.tarea_id
 where s.inferida = 'dictada'
   and (s.antecedente is null or btrim(s.antecedente) = '');

comment on view v_dictada_sin_cita is
  'Subtareas marcadas como dictadas por el alcalde pero sin cita textual. Si se dictó, hay frase: revisar.';
