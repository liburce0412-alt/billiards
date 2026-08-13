-- Accounts created by earlier builds inherited the old low aiming camera.
-- Move that legacy default to the selected SPECTRA composition. People who
-- explicitly chose the free camera keep it; all modes remain switchable in-game.
UPDATE user_preferences SET camera_mode = 'top' WHERE camera_mode = 'aim';
UPDATE user_preferences SET social_drawer_open = 1;
