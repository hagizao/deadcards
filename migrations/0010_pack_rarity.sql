-- Chances por raridade de cada tipo de pack (JSON). NULL = toda carta do tipo com a mesma chance.
ALTER TABLE pack_types ADD COLUMN rarity_json TEXT;
