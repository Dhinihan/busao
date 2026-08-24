CREATE TABLE IF NOT EXISTS horarios (
  cl INTEGER NOT NULL,
  tipo_dia TEXT NOT NULL CHECK (tipo_dia IN ('util', 'sab', 'dom')),
  origem TEXT NOT NULL,
  partidas TEXT NOT NULL,
  feed_em TEXT NOT NULL,
  PRIMARY KEY (cl, tipo_dia)
);
