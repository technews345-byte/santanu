-- Riders may check in again on the same day after checking out.
-- The time between a check-out and the next check-in is stored as an 'off' gap (not counted as work or as a break).
ALTER TABLE attendance ADD COLUMN sessions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attendance_breaks ADD COLUMN kind TEXT NOT NULL DEFAULT 'break' CHECK (kind IN ('break', 'off'));
ALTER TABLE attendance_breaks ADD COLUMN selfie TEXT NOT NULL DEFAULT '';
ALTER TABLE attendance_breaks ADD COLUMN lat REAL;
ALTER TABLE attendance_breaks ADD COLUMN lng REAL;
