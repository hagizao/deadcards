ALTER TABLE players ADD COLUMN account_id INTEGER;
CREATE INDEX players_account ON players(account_id);

CREATE TABLE player_matches (
  account_id INTEGER NOT NULL,
  match_id INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('edl', 'pub')),
  event TEXT,
  series TEXT,
  hero_id INTEGER NOT NULL,
  start_time INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  deaths INTEGER NOT NULL,
  assists INTEGER NOT NULL,
  net_worth INTEGER NOT NULL,
  won INTEGER NOT NULL,
  PRIMARY KEY (account_id, match_id)
);
CREATE INDEX player_matches_recent ON player_matches(account_id, start_time DESC);

-- Partidas do EDL já descobertas (game = nº do jogo na série, teams = "A vs B"); done = 1 quando o metadata foi lido.
-- info_json guarda o resumo dos 12 jogadores: vincular um jogador depois não exige baixar o metadata de novo.
CREATE TABLE edl_matches (
  match_id INTEGER PRIMARY KEY,
  event TEXT NOT NULL,
  series TEXT NOT NULL,
  game INTEGER,
  teams TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  info_json TEXT
);

-- Eventos ('evento') e séries ('evento/série') do EDL já varridos, para não rebaixar as páginas a cada cron.
CREATE TABLE edl_scanned (key TEXT PRIMARY KEY);
