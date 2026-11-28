-- Curtidas nas cartas especiais: uma por conta e carta; o total é público e dá moral para quem fez a arte.
CREATE TABLE card_likes (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, player_id)
);
CREATE INDEX card_likes_player ON card_likes (player_id);
