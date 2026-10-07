ALTER TABLE game_rooms ADD COLUMN game_type TEXT NOT NULL DEFAULT 'billiards'
  CHECK(game_type IN ('billiards', 'table-tennis'));

CREATE TABLE IF NOT EXISTS table_tennis_results (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES game_rooms(id),
  host_id TEXT NOT NULL REFERENCES "user"(id),
  guest_id TEXT NOT NULL REFERENCES "user"(id),
  winner_id TEXT REFERENCES "user"(id),
  reason TEXT NOT NULL,
  score_json TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS table_tennis_results_host ON table_tennis_results(host_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS table_tennis_results_guest ON table_tennis_results(guest_id, ended_at DESC);
