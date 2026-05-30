ALTER TABLE "StaffUser" ADD COLUMN IF NOT EXISTS "isSuperuser" BOOLEAN NOT NULL DEFAULT false;

UPDATE "StaffUser" SET "isSuperuser" = true WHERE "role" = 'SUPERUSER';

UPDATE "StaffUser"
SET "role" = 'CHAIRMAN', "isSuperuser" = true
WHERE email = 'nmatunog@gmail.com';

UPDATE "StaffUser"
SET "role" = 'SUPERUSER', "isSuperuser" = true
WHERE email = 'b2ccoop@gmail.com';
