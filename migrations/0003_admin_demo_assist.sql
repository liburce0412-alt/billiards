ALTER TABLE profiles
ADD COLUMN admin_demo_assist INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_preferences
ADD COLUMN admin_demo_offline_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_preferences
ADD COLUMN admin_demo_online_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_preferences
ADD COLUMN admin_demo_level INTEGER NOT NULL DEFAULT 11;

-- The demonstration capability belongs only to the one account created with
-- the consumed bootstrap invite. Promoting another profile to role=admin must
-- not grant this capability.
UPDATE profiles
SET admin_demo_assist = 1
WHERE user_id = (
  SELECT consumed_by
  FROM bootstrap_state
  WHERE key = 'admin-invite' AND consumed_at IS NOT NULL
);
