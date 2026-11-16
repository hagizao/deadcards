-- Última sincronização de pubs por conta: o rodízio pega as nunca sincronizadas e depois as mais antigas.
CREATE TABLE account_sync (
  account_id INTEGER PRIMARY KEY,
  synced_at INTEGER NOT NULL
);
