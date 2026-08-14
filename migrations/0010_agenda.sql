-- ============================================================================
-- Migración 0010 · Agenda del Alcalde — para que el pin salga de dónde estuvo,
--                  no de dónde el modelo cree que estuvo
--
-- QUÉ RESUELVE
--   El embudo geocodifica el `lugar_captura` que el modelo saca de la transcripción.
--   Funciona, pero no tiene con qué contrastar: si la transcripción dice mal la fecha o
--   el lugar, nadie se entera. El sistema anterior no hacía eso — **cruzaba la agenda del
--   alcalde por fecha y hora** y de ahí deducía el lugar
--   (`gamlp-sistema/handoffs/2026-07-13_13h33_HANDOFF_pin.md`).
--
--   Su regla de oro, que se conserva: **el modelo NUNCA escribe coordenadas.** Deduce el
--   lugar en TEXTO; las coordenadas las resuelve un geocodificador real, o no hay pin.
--   «Un pin en el lugar equivocado es peor que ningún pin.»
--
-- POR QUÉ UNA TABLA EN EL CMI Y NO LEER NOTION
--   Notion se apaga. Y hay una razón mejor: el espejo de Apps Script solo refleja **los
--   próximos 30 días**, así que la agenda de Notion tiene julio (216) y agosto (182) pero
--   **junio no existe** — y hay transcripciones de junio por cargar. Leyendo el calendario
--   directo se puede traer el pasado, que el espejo nunca trajo.
--
-- DOS FUENTES, A PROPÓSITO
--   `origen = 'notion'`  → los 400 eventos que ya están, para que el cruce funcione HOY.
--   `origen = 'calendar'` → del calendario del alcalde vía su URL iCal privada. Trae la
--                           DESCRIPCIÓN, que es de donde se deduce el lugar.
--   El `uid` es la clave: el mismo evento traído por las dos vías no se duplica, y lo de
--   Calendar pisa a lo de Notion porque viene con más datos.
--
--   ⚠ Hoy solo **14 de 400** eventos de Notion tienen Notas. El paso del espejo que copiaba
--   la descripción quedó en «Fuente lista. Desplegás vos» el 13-jul y parece que nunca se
--   desplegó. Por eso importa leer el Calendar directo: ahí la descripción sí está.
-- ============================================================================
set search_path to cmi, public;

create table if not exists agenda_evento (
  id          bigserial primary key,
  -- Identidad estable del evento. De Calendar es el UID del iCal; de Notion, el page_id.
  uid         text not null unique,
  inicio      timestamptz not null,
  fin         timestamptz,
  tema        text not null,
  -- La DESCRIPCIÓN es lo valioso: de ahí se deduce el lugar cuando el título no alcanza.
  descripcion text,
  -- Lo que el calendario declara como ubicación. El del alcalde casi nunca lo llena
  -- (lo dice el propio `espejo.gs`), así que se guarda como un dato más, no como fuente única.
  lugar       text,
  origen      text not null check (origen in ('notion', 'calendar')),
  -- Lugar deducido y verificado. Se llena una sola vez y no se recalcula: si alguien lo
  -- corrigió a mano, una resincronización no debe pisarlo.
  lugar_pin   text,
  coordenadas text,
  sincronizado timestamptz not null default now()
);

create index if not exists ix_agenda_inicio on agenda_evento(inicio);

comment on table agenda_evento is
  'Agenda del Alcalde. Sirve para cruzar una transcripción por fecha y hora: confirma que el evento existió, de dónde salió el compromiso, y da el lugar cuando la transcripción no lo dice.';

-- La tarea guarda de qué evento salió, tenga pin o no. «Lo que no se registró, no se
-- gestiona»: dejar constancia del origen vale aunque la ubicación no se resuelva.
alter table tarea add column if not exists agenda_evento_id bigint references agenda_evento(id);

comment on column tarea.agenda_evento_id is
  'Evento de la agenda del que salió esta tarea, si se pudo cruzar. Constancia del origen, independiente de que haya coordenadas.';

-- Lo que el embudo consulta: eventos con su día en hora de Bolivia, listos para cruzar.
create or replace view v_agenda_dia as
select
  id, uid, tema, descripcion, lugar, lugar_pin, coordenadas, origen,
  (inicio at time zone 'America/La_Paz')::date       as dia,
  to_char(inicio at time zone 'America/La_Paz', 'HH24:MI') as hora,
  inicio
from agenda_evento;

comment on view v_agenda_dia is
  'Agenda con el día y la hora ya en horario de Bolivia — el cruce es por fecha local, no UTC.';
