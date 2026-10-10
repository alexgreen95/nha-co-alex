-- Step 1 only. Run manually in Supabase SQL Editor before deploying frontend.
-- Preserves all view events, INSERT behavior and existing RLS/policies.
BEGIN;

CREATE INDEX IF NOT EXISTS nca_story_views_story_id_idx
  ON public.story_views (story_id);

CREATE OR REPLACE FUNCTION public.nca_story_view_counts(p_story_ids bigint[])
RETURNS TABLE(story_id bigint, view_count bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_story_ids IS NULL OR cardinality(p_story_ids) = 0 THEN RETURN; END IF;
  IF cardinality(p_story_ids) > 100 THEN
    RAISE EXCEPTION 'Request at most 100 story IDs' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT s.id, count(v.id)
    FROM public.stories s
    LEFT JOIN public.story_views v ON v.story_id = s.id
    WHERE s.id = ANY(p_story_ids)
    GROUP BY s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.nca_story_view_counts(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nca_story_view_counts(bigint[]) TO anon, authenticated;

COMMIT;
