-- Enforce the append-only guarantee for `order_status_history` at the database
-- boundary, so no application code path -- Prisma, a raw query, or a console
-- session -- can rewrite or erase the delivery audit trail.
--
-- INSERT stays allowed. UPDATE and DELETE always raise.

CREATE OR REPLACE FUNCTION order_status_history_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'order_status_history is append-only: % is not permitted on this table', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_status_history_no_update ON "order_status_history";
CREATE TRIGGER trg_order_status_history_no_update
  BEFORE UPDATE ON "order_status_history"
  FOR EACH ROW EXECUTE FUNCTION order_status_history_append_only();

DROP TRIGGER IF EXISTS trg_order_status_history_no_delete ON "order_status_history";
CREATE TRIGGER trg_order_status_history_no_delete
  BEFORE DELETE ON "order_status_history"
  FOR EACH ROW EXECUTE FUNCTION order_status_history_append_only();

-- `TRUNCATE` bypasses row-level triggers, so it needs a statement-level one.
DROP TRIGGER IF EXISTS trg_order_status_history_no_truncate ON "order_status_history";
CREATE TRIGGER trg_order_status_history_no_truncate
  BEFORE TRUNCATE ON "order_status_history"
  FOR EACH STATEMENT EXECUTE FUNCTION order_status_history_append_only();
