-- Dia em que um time brasileiro joga: o calendário da Home pinta a borda de verde e amarelo.
ALTER TABLE tournament_dates ADD COLUMN brazil INTEGER NOT NULL DEFAULT 0;
