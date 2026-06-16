-- Scope get_contact_stage_counts() to the caller's organization.
-- The original function had no organization_id filter and was SECURITY DEFINER,
-- so it counted contacts across ALL organizations (a cross-tenant leak and an
-- inflated badge count). Filter by the caller's org via auth.uid().

CREATE OR REPLACE FUNCTION public.get_contact_stage_counts()
RETURNS TABLE(stage text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT stage, COUNT(*)::bigint AS count
  FROM contacts
  WHERE deleted_at IS NULL
    AND organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  GROUP BY stage;
$$;
