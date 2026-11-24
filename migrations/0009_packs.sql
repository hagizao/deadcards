-- Packs: tipos (Editor), packs no inventário de cada usuário e o registro de cada carta tirada.
CREATE TABLE pack_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  art_key TEXT,
  cards INTEGER NOT NULL DEFAULT 1,
  odds_json TEXT NOT NULL,
  teams_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- primeiro tipo, para o pack semanal; nome e chances se ajustam no Editor
INSERT INTO pack_types (id, name, odds_json) VALUES ('pack-semanal', 'Pack da semana', '{"alt":80,"signature":15,"special":5}');

CREATE TABLE user_packs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  pack_type_id TEXT NOT NULL REFERENCES pack_types(id),
  -- código que deu o pack; um pack por código por pessoa
  code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  opened_at INTEGER,
  UNIQUE (user_id, code)
);
CREATE INDEX user_packs_user ON user_packs(user_id, opened_at);

-- slot permite mais de uma carta por pack no futuro; a chave impede abrir o mesmo pack duas vezes
CREATE TABLE pack_openings (
  user_pack_id TEXT NOT NULL REFERENCES user_packs(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL DEFAULT 0,
  user_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  opened_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_pack_id, slot)
);
CREATE INDEX pack_openings_time ON pack_openings(opened_at);

-- Código passa a dar uma carta OU um pack: player_id vira opcional (SQLite exige recriar a tabela).
CREATE TABLE redeem_codes_new (
  code TEXT PRIMARY KEY,
  player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  pack_type_id TEXT REFERENCES pack_types(id) ON DELETE CASCADE,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER,
  expires_at INTEGER,
  CHECK ((player_id IS NULL) <> (pack_type_id IS NULL))
);
INSERT INTO redeem_codes_new (code, player_id, max_uses, uses, starts_at, expires_at)
  SELECT code, player_id, max_uses, uses, starts_at, expires_at FROM redeem_codes;
DROP TABLE redeem_codes;
ALTER TABLE redeem_codes_new RENAME TO redeem_codes;
