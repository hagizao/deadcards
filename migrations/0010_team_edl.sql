-- Slug do time no edl.gg; NULL = time não ligado ao EDL.
ALTER TABLE teams ADD COLUMN edl_slug TEXT;

-- team1_slug/team2_slug são os times da série e winner_slug o vencedor do jogo.
ALTER TABLE edl_matches ADD COLUMN team1_slug TEXT;
ALTER TABLE edl_matches ADD COLUMN team2_slug TEXT;
ALTER TABLE edl_matches ADD COLUMN winner_slug TEXT;

-- Quem jogou cada partida do EDL e com qual herói: cruzando (partida, herói) com o info_json descobre-se o account_id do jogador.
CREATE TABLE edl_match_players (
  match_id INTEGER NOT NULL,
  player_slug TEXT NOT NULL,
  alias TEXT NOT NULL,
  team_slug TEXT NOT NULL,
  hero_id INTEGER NOT NULL,
  PRIMARY KEY (match_id, player_slug)
);
CREATE INDEX edl_match_players_team ON edl_match_players(team_slug);

-- Nome, tag e logo dos times vistos nas séries (para mostrar o adversário).
CREATE TABLE edl_teams (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT,
  logo_url TEXT
);
