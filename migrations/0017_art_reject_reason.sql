-- Banco de artes: o motivo da recusa, que quem enviou vê em "Minhas artes".
ALTER TABLE art_submissions ADD COLUMN reject_reason TEXT;
