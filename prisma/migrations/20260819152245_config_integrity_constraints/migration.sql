-- Configuration integrity, enforced by the database rather than by convention.
--
-- Both rules below are already checked by Zod on the way in. They are repeated
-- here because a rate table that disagrees with itself fails silently: the row
-- looks fine in a listing, and the only symptom is an order that cannot be
-- priced. Anything that writes to these tables -- a migration, a console
-- session, a future service that forgets the schema -- is held to the same rule.

-- 1. A rate card's scope is a function of its zone pair. INTRA means one zone,
--    INTER means two. A row that disagrees can never match a lookup, because
--    the lookup derives the scope from the order's pickup and drop zones the
--    same way.
ALTER TABLE "rate_cards"
  DROP CONSTRAINT IF EXISTS "rate_cards_scope_matches_zone_pair";

ALTER TABLE "rate_cards"
  ADD CONSTRAINT "rate_cards_scope_matches_zone_pair"
  CHECK (
    ("scope" = 'INTRA' AND "fromZoneId" = "toZoneId")
    OR
    ("scope" = 'INTER' AND "fromZoneId" <> "toZoneId")
  );

-- 2. A COD surcharge must carry the value its mode uses, and only that value.
--    A PERCENTAGE row holding an `amount` but no `percentage` would compute a
--    surcharge of zero and look deliberate.
ALTER TABLE "cod_surcharge_configs"
  DROP CONSTRAINT IF EXISTS "cod_surcharge_mode_matches_value";

ALTER TABLE "cod_surcharge_configs"
  ADD CONSTRAINT "cod_surcharge_mode_matches_value"
  CHECK (
    ("mode" = 'FIXED' AND "amount" IS NOT NULL AND "percentage" IS NULL)
    OR
    ("mode" = 'PERCENTAGE' AND "percentage" IS NOT NULL AND "amount" IS NULL)
  );

-- 3. Rates are never negative, and a base-weight slab of zero would make the
--    per-kg term start from nowhere.
ALTER TABLE "rate_cards"
  DROP CONSTRAINT IF EXISTS "rate_cards_non_negative_rates";

ALTER TABLE "rate_cards"
  ADD CONSTRAINT "rate_cards_non_negative_rates"
  CHECK ("baseRate" >= 0 AND "perKgRate" >= 0 AND "baseWeightKg" > 0);
