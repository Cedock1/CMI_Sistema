-- ============================================================================
-- Migración 0003 · `rice_nota` — el supuesto detrás de cada puntaje
--
-- El sistema hermano (`drica-sistema`) guarda una nota junto a cada valoración
-- RICE (`rice_nota text` en `20260728000001_rice.sql`) y el CMI no la tenía.
-- Sin ella el puntaje es una caja negra: se ve el número, no de dónde salió el
-- alcance ni por qué esa confianza. Y el método RICE es explícito en que los
-- supuestos deben declararse — "es mejor una primera pasada con supuestos
-- explícitos que trabar el análisis pidiendo datos que no existen".
--
-- Se replica el nombre de drica a propósito: es la plantilla replicable, y dos
-- nombres distintos para el mismo dato obligan a traducir en cada consulta que
-- cruce los dos sistemas.
-- ============================================================================
set search_path to cmi, public;

alter table tarea add column if not exists rice_nota text;

comment on column tarea.rice_nota is
  'Supuestos del puntaje RICE: de dónde sale el alcance y por qué ese impacto y '
  'confianza. Equivale a `tareas.rice_nota` de drica-sistema.';

-- Nota sobre las escalas (D07 + método de Intercom, tal como las implementa drica):
--   impacto   → masivo 3 · alto 2 · medio 1 · bajo 0.5 · mínimo 0.25
--   confianza → alta 1.0 · media 0.8 · baja 0.5
--   alcance   → beneficiarios por AÑO (número concreto)
--   esfuerzo  → días-persona (ya cargado: 300/300)
-- El CMI guarda impacto y confianza como `numeric` donde drica usa `text` con check;
-- se persisten los VALORES de esas escalas, así el puntaje es idéntico en ambos.

-- Fin migración 0003.
