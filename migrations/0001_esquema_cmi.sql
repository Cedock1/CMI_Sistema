-- ============================================================================
-- Migración 0001 · Esquema base del CMI (Fase 1)
-- Postgres / Supabase. Materializa el bosquejo de Esquema_base_CMI.md (D35–D40).
-- Orden: referencia (eje, unidad, persona, rol) → estratégico → presupuesto → control.
-- Las vistas (v_avance, v_conciliacion_poa) van en 0002 (Vistas_CMI.sql).
-- ----------------------------------------------------------------------------
-- AISLAMIENTO (D43): todo el CMI vive en el schema `cmi`. NO toca `public`
-- (donde corre despacho-dam: tramites, documentos, fichas, etc.).
-- ============================================================================
create schema if not exists cmi;
set search_path to cmi, public;

-- ---------- CAPA ORGANIZACIONAL (MOF) ----------
create table unidad (
  id           bigserial primary key,
  -- OJO: la sigla NO es única en el MOF (ej.: 'SAF' Sección Administrativa Financiera y 'CMAC'
  -- Coordinación Macrodistrital existen en varias secretarías). PK = id surrogate; sigla indexada.
  sigla        text not null,
  nombre       text not null,
  nivel        text,                         -- DIRECTIVO/EJECUTIVO/OPERATIVO/…
  depende_de   bigint references unidad(id), -- jerarquía (self-FK); también cuelga sub-unidades
  secretaria   text,
  eje          text,
  objetivo     text,
  funciones    text,
  palabras_clave text,
  es_descentralizada bool default false,     -- regla dura: solo apoyo, nunca responsable principal
  es_sub_mof   bool default false            -- D40 Opción A: sub-oficina bajo el MOF (hospitales, etc.)
);
create index ix_unidad_depende on unidad(depende_de);
create index ix_unidad_secretaria on unidad(secretaria);
create index ix_unidad_sigla on unidad(sigla);

create table persona (
  id        bigserial primary key,
  nombre    text not null,
  unidad_id bigint references unidad(id),
  cargo     text,
  correo    text,
  vigente   bool default true
);

-- ---------- CAPA ESTRATÉGICA ----------
create table eje (
  codigo text primary key,                   -- EJE-01 … EJE-10
  romano text,
  nombre text not null,
  lema   text,
  ambito text
);

create table programa (
  id          bigserial primary key,
  eje_codigo  text references eje(codigo),
  nombre      text not null,
  objetivo    text,
  indicadores text,
  meta_2030   text
);
create index ix_programa_eje on programa(eje_codigo);

create table proyecto (
  id            bigserial primary key,
  programa_id   bigint references programa(id),
  nombre        text not null,
  tipo          text check (tipo in ('estrategico','general','fortalecimiento','paraguas')) default 'general',
  objetivo      text,
  meta          text,
  indicador     text,
  resultado_2030 text
);
create index ix_proyecto_programa on proyecto(programa_id);

create table actividad (
  id            bigserial primary key,
  proyecto_id   bigint references proyecto(id),
  nombre        text not null,
  esfuerzo      numeric,                      -- opcional; el rollup usa el agregado de tareas
  presupuesto_asignado numeric,
  fuente_financiamiento text,
  va_al_concejo bool default false,
  fecha_limite  date
);
create index ix_actividad_proyecto on actividad(proyecto_id);

create table tarea (
  id            bigserial primary key,
  actividad_id  bigint references actividad(id),   -- NULL → actividad "genérica" del proyecto
  codigo        text,                              -- C### o el 'Código único' de la Matriz Maestra
  sub_ambito    text,                              -- residuo bajo MOF si no se creó sub-unidad
  titulo        text not null,
  descripcion   text,
  responsable_unidad_id bigint references unidad(id),
  eje_codigo    text references eje(codigo),       -- eje por materia (desacoplado del organigrama)
  estado        text,
  semaforo      text,
  prioridad_declarada text,                        -- Alta/Media/Baja (Matriz Maestra); coexiste con RICE
  plazo         date,
  fecha_inicio  date,
  fecha_real    date,
  origen        text,
  lugar_captura text,
  coordenadas   text,
  -- RICE (D07)
  rice_alcance   numeric,
  rice_impacto   numeric,
  rice_confianza numeric,
  rice_esfuerzo  numeric,
  rice_puntaje   numeric,                          -- (alcance*impacto*confianza)/esfuerzo
  -- presupuesto / avance (D36)
  presupuesto_vigente numeric default 0,
  avance_fisico  numeric default 0,                -- % declarado (hoja del rollup)
  -- circulación (D31)
  seguimiento_despacho bool default false,         -- elevación al Despacho
  -- materia prima
  entrada_texto text,
  entrada_ref   text,
  analisis_ia   jsonb
);
create index ix_tarea_actividad on tarea(actividad_id);
create index ix_tarea_unidad on tarea(responsable_unidad_id);
create index ix_tarea_eje on tarea(eje_codigo);

create table subtarea (
  id            bigserial primary key,
  tarea_id      bigint references tarea(id) on delete cascade,
  nombre        text not null,
  responsable_unidad_id bigint references unidad(id),
  fecha_limite  date,
  estado        text,
  inferida      text                               -- dictada/sugerida
);
create index ix_subtarea_tarea on subtarea(tarea_id);

-- multi-secretaría (D19): unidades de apoyo/concurrentes → habilita el cruce puntual entre secretarías (D38)
create table tarea_concurrente (
  tarea_id  bigint references tarea(id) on delete cascade,
  unidad_id bigint references unidad(id),
  rol       text,                                  -- apoyo/concurrente
  primary key (tarea_id, unidad_id)
);

-- ---------- CAPA PRESUPUESTARIA (POA · D32/D36) ----------
create table poa_partida (
  id            bigserial primary key,
  tarea_id      bigint references tarea(id),       -- baja a tarea (D36); fallback a actividad "genérica"
  partida_codigo text,
  monto_asignado numeric,
  fuente        text,
  periodo       text
);

create table poa_mapeo (
  partida_poa text,
  tarea_id    bigint references tarea(id),
  primary key (partida_poa, tarea_id)
);

create table ejecucion (                            -- gasto con histórico (D36)
  id            bigserial primary key,
  tarea_id      bigint references tarea(id),
  monto         numeric not null,
  fecha         date,
  glosa         text,
  partida_codigo text,
  fuente        text
);
create index ix_ejecucion_tarea on ejecucion(tarea_id);

-- ---------- ACCESO (D31/D38) ----------
create table rol (
  codigo      text primary key,                     -- administrador/director/jefe_unidad/…
  descripcion text
);

create table usuario (
  id      bigserial primary key,
  nombre  text not null,
  correo  text unique,
  persona_id bigint references persona(id)
);

create table usuario_ambito (
  usuario_id bigint references usuario(id),
  unidad_id  bigint references unidad(id),          -- ámbito (secretaría = frontera de lectura, D38)
  rol_codigo text references rol(codigo),
  primary key (usuario_id, unidad_id, rol_codigo)
);

-- ---------- CONTROL (reglas duras) ----------
create table validacion (                           -- multi-firma (D36)
  id          bigserial primary key,
  tarea_id    bigint references tarea(id),
  tipo        text check (tipo in ('admin_financiera','juridica','comunicacional')),
  estado      text,
  responsable text,
  fecha       date
);

create table bitacora (                             -- append-only (regla dura)
  id           bigserial primary key,
  entidad      text not null,
  entidad_id   text,
  accion       text not null,
  usuario      text,
  justificacion text,
  ts           timestamptz default now()
);
create index ix_bitacora_entidad on bitacora(entidad, entidad_id);

-- Fin migración 0001.
