-- Location was scored as a soft preference, which let a candidate two hours away
-- outrank a local one. Distance is a real constraint in staffing, but how much it
-- constrains depends on facts we were not storing: what commute this person accepts,
-- whether they drive, whether they would move, and whether the job needs them onsite
-- at all. These columns let the engine judge distance against the candidate's own
-- limit instead of one hard-coded rule.

ALTER TABLE candidates ADD COLUMN max_commute_km REAL;
ALTER TABLE candidates ADD COLUMN has_car INTEGER NOT NULL DEFAULT 0;
ALTER TABLE candidates ADD COLUMN willing_to_relocate INTEGER NOT NULL DEFAULT 0;

-- onsite | hybrid | remote. Remote makes distance irrelevant; hybrid softens it.
ALTER TABLE jobs ADD COLUMN work_mode TEXT NOT NULL DEFAULT 'onsite';
