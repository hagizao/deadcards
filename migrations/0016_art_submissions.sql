-- Banco de artes: artes que as pessoas enviam (e testaram numa carta especial) para o admin usar depois.
-- As imagens ficam no R2 em submissions/ e só abrem para quem enviou e para os admins.
CREATE TABLE art_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  image_key TEXT NOT NULL,
  fg_key TEXT,
  -- ajuste que a pessoa testou: zoom/x/y da arte e da camada da frente, moldura e carta da prévia
  layout_json TEXT NOT NULL DEFAULT '{}',
  credit_name TEXT NOT NULL,
  credit_url TEXT,
  -- pending (em análise), used (usada numa carta), rejected (recusada)
  status TEXT NOT NULL DEFAULT 'pending',
  used_player_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX art_submissions_user ON art_submissions (user_id, status);
CREATE INDEX art_submissions_status ON art_submissions (status, created_at);
