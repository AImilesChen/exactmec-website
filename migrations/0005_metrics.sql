CREATE TABLE IF NOT EXISTS metric_counts (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  route TEXT NOT NULL,
  placement TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,event,route,placement,status)
);
