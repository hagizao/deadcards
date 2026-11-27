-- O campeonato troca o link do site por dois: a transmissão oficial e a watchparty do Hagizao.
ALTER TABLE tournaments ADD COLUMN stream_url TEXT;
ALTER TABLE tournaments ADD COLUMN watch_url TEXT;
ALTER TABLE tournaments DROP COLUMN url;

UPDATE tournaments
SET stream_url = 'https://www.youtube.com/@DeadlockNightShift/live',
    watch_url = 'https://www.youtube.com/@hagizao/live'
WHERE id = 'night-shift';
