-- Artistas: contas marcadas pelo admin, com área própria no perfil (selo, cartas com a arte delas e curtidas).
CREATE TABLE artists (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- De quem é a arte de cada carta: uma conta por carta. Vincular também dá a carta para o artista.
CREATE TABLE card_artists (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX card_artists_user ON card_artists (user_id);
