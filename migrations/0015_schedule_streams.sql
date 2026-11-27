-- Transmissão oficial e watchparty passam a valer por dia: dá para pôr ou tirar a watchparty de um dia só.
-- Os links do campeonato viram o padrão de cada dia novo.
ALTER TABLE tournament_dates ADD COLUMN stream_url TEXT;
ALTER TABLE tournament_dates ADD COLUMN watch_url TEXT;

UPDATE tournament_dates
SET stream_url = (SELECT stream_url FROM tournaments WHERE tournaments.id = tournament_dates.tournament_id),
    watch_url = (SELECT watch_url FROM tournaments WHERE tournaments.id = tournament_dates.tournament_id);
