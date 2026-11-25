-- Cartas escolhidas a dedo para o tipo de pack (JSON com ids). NULL = o pool vem dos times.
ALTER TABLE pack_types ADD COLUMN players_json TEXT;
