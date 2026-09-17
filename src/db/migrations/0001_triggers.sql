-- Custom SQL migration: cross-table invariants that Postgres cannot express as check constraints.
-- PLANNING.md 5b: "Postgres does not allow subqueries in check constraints, so this is a trigger, not a check."

-- 1. quantity is null if and only if the denomination is unquantifiable.
CREATE OR REPLACE FUNCTION public.enforce_quantity_matches_denomination()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  q boolean;
BEGIN
  SELECT d.quantifiable INTO q FROM public.denominations d WHERE d.id = NEW.denom_id;
  IF q IS NULL THEN
    RAISE EXCEPTION 'unknown denomination %', NEW.denom_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF q AND NEW.quantity IS NULL THEN
    RAISE EXCEPTION 'quantity is required for a quantifiable denomination (%)', NEW.denom_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NOT q) AND NEW.quantity IS NOT NULL THEN
    RAISE EXCEPTION 'quantity must be null for an unquantifiable denomination (%)', NEW.denom_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER obligation_proposals_quantity_iff_quantifiable
BEFORE INSERT OR UPDATE OF quantity, denom_id ON public.obligation_proposals
FOR EACH ROW EXECUTE FUNCTION public.enforce_quantity_matches_denomination();
--> statement-breakpoint
CREATE TRIGGER obligations_quantity_iff_quantifiable
BEFORE INSERT OR UPDATE OF quantity, denom_id ON public.obligations
FOR EACH ROW EXECUTE FUNCTION public.enforce_quantity_matches_denomination();
--> statement-breakpoint

-- 2. A denomination's quantifiable flag is immutable once created, so the invariant above cannot be
--    broken retroactively by flipping the flag under existing rows.
CREATE OR REPLACE FUNCTION public.reject_quantifiable_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.quantifiable IS DISTINCT FROM OLD.quantifiable THEN
    RAISE EXCEPTION 'denominations.quantifiable is immutable (%)', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER denominations_quantifiable_immutable
BEFORE UPDATE OF quantifiable ON public.denominations
FOR EACH ROW EXECUTE FUNCTION public.reject_quantifiable_change();
--> statement-breakpoint

-- 3. delegations: refuse any row whose wallet_address is that user's governance wallet. Belt and braces:
--    the application never requests delegation for a governance wallet, and the database refuses to store one.
CREATE OR REPLACE FUNCTION public.reject_governance_wallet_delegation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = NEW.user_id AND lower(u.governance_wallet) = lower(NEW.wallet_address)
  ) THEN
    RAISE EXCEPTION 'delegation refused: % is a governance wallet', NEW.wallet_address
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER delegations_reject_governance_wallet
BEFORE INSERT OR UPDATE OF wallet_address, user_id ON public.delegations
FOR EACH ROW EXECUTE FUNCTION public.reject_governance_wallet_delegation();
