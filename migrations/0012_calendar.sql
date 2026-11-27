-- Calendário da Home: campeonatos (nome, descrição e logo, editáveis no Editor) e os dias em que acontecem.
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  logo_key TEXT,
  url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- starts_at em segundos UTC: o site mostra no fuso de quem visita. label diferencia as edições ("67 EU").
CREATE TABLE tournament_dates (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  starts_at INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT ''
);
CREATE INDEX tournament_dates_starts_at ON tournament_dates(starts_at);

-- Ponto de partida: Deadlock Night Shift (edl.gg) até o fim de 2026. Horários tirados da contagem do edl.gg;
-- dá para corrigir, apagar ou subir a logo pelo Editor. OR IGNORE: rodar de novo não duplica nem desfaz edições.
-- A logo é um arquivo do site (public/tournaments/), para chegar junto com o deploy; dá para trocar pelo Editor.
INSERT OR IGNORE INTO tournaments (id, name, description, logo_key, url) VALUES
  ('night-shift', 'Deadlock Night Shift', 'Torneio semanal do EDL com times convidados. Uma edição por região: Europa na quarta, América do Norte na quinta e Ásia-Pacífico na sexta.', '/tournaments/night-shift.webp', 'https://edl.gg/events');

INSERT OR IGNORE INTO tournament_dates (id, tournament_id, starts_at, label) VALUES
  ('ns-67-eu', 'night-shift', 1796245200, '67 EU'),
  ('ns-68-eu', 'night-shift', 1796850000, '68 EU'),
  ('ns-69-eu', 'night-shift', 1797454800, '69 EU'),
  ('ns-70-eu', 'night-shift', 1798059600, '70 EU'),
  ('ns-71-eu', 'night-shift', 1798664400, '71 EU'),
  ('ns-67-na', 'night-shift', 1796256000, '67 NA'),
  ('ns-68-na', 'night-shift', 1796860800, '68 NA'),
  ('ns-69-na', 'night-shift', 1797465600, '69 NA'),
  ('ns-70-na', 'night-shift', 1798070400, '70 NA'),
  ('ns-71-na', 'night-shift', 1798675200, '71 NA'),
  ('ns-5-apac', 'night-shift', 1796374800, '5 APAC'),
  ('ns-6-apac', 'night-shift', 1796979600, '6 APAC'),
  ('ns-7-apac', 'night-shift', 1797584400, '7 APAC'),
  ('ns-8-apac', 'night-shift', 1798189200, '8 APAC')
;
