-- Add the owner column as nullable while legacy rows are backfilled.
ALTER TABLE "Event" ADD COLUMN "userId" TEXT;

-- Existing events predate user ownership. Assign them to the oldest account.
UPDATE "Event"
SET "userId" = (
    SELECT "id"
    FROM "User"
    ORDER BY "createdAt" ASC
    LIMIT 1
)
WHERE "userId" IS NULL;

-- Fail rather than silently dropping legacy events when there is no user to own them.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Event" WHERE "userId" IS NULL) THEN
        RAISE EXCEPTION 'Cannot assign existing events: create a user before applying this migration';
    END IF;
END $$;

ALTER TABLE "Event" ALTER COLUMN "userId" SET NOT NULL;

CREATE INDEX "Event_userId_idx" ON "Event"("userId");

ALTER TABLE "Event"
ADD CONSTRAINT "Event_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
