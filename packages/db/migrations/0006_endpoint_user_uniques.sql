CREATE UNIQUE INDEX IF NOT EXISTS "endpoints_user_name_unique"
  ON "endpoints" ("user_id", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "endpoints_user_destination_unique"
  ON "endpoints" ("user_id", "destination");
