PRAGMA foreign_keys = ON;

-- Better Auth 1.6.x core + username plugin schema.
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  username TEXT UNIQUE,
  displayUsername TEXT
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expiresAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS session_userId_idx ON session(userId);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  idToken TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'moderator', 'admin')),
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending', 'approved', 'rejected', 'revoked')),
  visibility TEXT NOT NULL DEFAULT 'online' CHECK(visibility IN ('online', 'away', 'dnd', 'invisible')),
  avatar_key TEXT,
  bio TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT 'ocean',
  cue_style TEXT NOT NULL DEFAULT 'heritage',
  table_style TEXT NOT NULL DEFAULT 'american-ivory',
  environment_style TEXT NOT NULL DEFAULT 'spectra',
  language TEXT NOT NULL DEFAULT 'zh-CN',
  sanction_version INTEGER NOT NULL DEFAULT 0,
  muted_until INTEGER,
  banned_until INTEGER,
  approval_note TEXT,
  approved_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  approved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS profiles_approval_idx ON profiles(approval_status, created_at);
CREATE INDEX IF NOT EXISTS profiles_display_name_idx ON profiles(display_name);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  reduced_motion INTEGER NOT NULL DEFAULT 0,
  quality TEXT NOT NULL DEFAULT 'high',
  desktop_shot_dock TEXT NOT NULL DEFAULT 'expanded',
  touch_shot_dock TEXT NOT NULL DEFAULT 'expanded',
  camera_mode TEXT NOT NULL DEFAULT 'top',
  master_volume REAL NOT NULL DEFAULT 0.8,
  social_drawer_open INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS recovery_codes_user_idx ON recovery_codes(user_id, used_at);

CREATE TABLE IF NOT EXISTS bootstrap_state (
  key TEXT PRIMARY KEY NOT NULL,
  consumed_at INTEGER,
  consumed_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reserved_token TEXT,
  reserved_at INTEGER
);
INSERT OR IGNORE INTO bootstrap_state(key) VALUES ('admin-invite');

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY NOT NULL,
  sender_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  CHECK(sender_id <> receiver_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_unique
  ON friend_requests(sender_id, receiver_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS friend_requests_receiver_idx ON friend_requests(receiver_id, status, created_at);

CREATE TABLE IF NOT EXISTS friendships (
  user_low_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  user_high_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_low_id, user_high_id),
  CHECK(user_low_id < user_high_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(blocker_id, blocked_id),
  CHECK(blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('direct', 'room')),
  direct_key TEXT UNIQUE,
  room_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  last_read_message_id TEXT,
  muted_at INTEGER,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members(user_id, joined_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  client_nonce TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  deleted_at INTEGER,
  UNIQUE(sender_id, client_nonce)
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS game_rooms (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('waiting', 'active', 'ended', 'cancelled')),
  rule_type TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '{}',
  host_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  guest_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  host_table_style TEXT NOT NULL,
  host_environment_style TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS game_rooms_status_idx ON game_rooms(status, created_at);

CREATE TABLE IF NOT EXISTS game_room_members (
  room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL CHECK(member_role IN ('host', 'player', 'spectator')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS match_invites (
  id TEXT PRIMARY KEY NOT NULL,
  challenger_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  challengee_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  CHECK(challenger_id <> challengee_id)
);
CREATE INDEX IF NOT EXISTS match_invites_challengee_idx ON match_invites(challengee_id, status, created_at);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY NOT NULL,
  author_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  active_from INTEGER NOT NULL,
  active_until INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  target_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  target_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_to TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS sanctions (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  target_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('mute', 'ban', 'avatar_takedown')),
  reason TEXT NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sanctions_target_idx ON sanctions(target_id, type, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
