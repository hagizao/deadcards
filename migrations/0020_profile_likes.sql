-- Curtir o artista no perfil: uma por conta; o total do perfil soma estas com as curtidas das cartas com a arte dele.
CREATE TABLE profile_likes (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, artist_id)
);
CREATE INDEX profile_likes_artist ON profile_likes (artist_id);
