-- DRAFT FOR REVIEW ONLY: Step 5B additive read contracts. Do not auto-apply.
-- No table/index/policy/trigger/event changes. Scalars avoid PostgREST row caps.
-- Array cardinality is checked BEFORE deduplication; NULL arrays/elements reject.
BEGIN;

CREATE FUNCTION public.nca_story_comment_counts(p_story_ids bigint[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_story_ids IS NULL OR EXISTS(SELECT 1 FROM unnest(p_story_ids) i WHERE i IS NULL)
    OR coalesce(array_ndims(p_story_ids),1) <> 1 OR cardinality(p_story_ids)>100 THEN
    RAISE EXCEPTION 'Expected a non-NULL one-dimensional array of at most 100 non-NULL story IDs' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('story_id',x.id,'comment_count',x.n) ORDER BY x.id),'[]'::jsonb)
  INTO result FROM (
    SELECT s.id,count(c.id) AS n FROM public.stories s
    LEFT JOIN public.comments c ON c.story_id=s.id
    WHERE s.id=ANY(p_story_ids) GROUP BY s.id
  ) x;
  RETURN result;
END;
$$;

CREATE FUNCTION public.nca_chapter_comment_counts(p_story_id bigint,p_chapter_index integer,p_paragraph_indices integer[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE general_count bigint; paragraphs jsonb;
BEGIN
  IF p_story_id IS NULL OR p_chapter_index IS NULL OR p_chapter_index<0
    OR p_paragraph_indices IS NULL OR EXISTS(SELECT 1 FROM unnest(p_paragraph_indices) i WHERE i IS NULL)
    OR coalesce(array_ndims(p_paragraph_indices),1) <> 1 OR cardinality(p_paragraph_indices)>1000
    OR EXISTS(SELECT 1 FROM unnest(p_paragraph_indices) i WHERE i<0) THEN
    RAISE EXCEPTION 'Expected a story ID, nonnegative chapter index and at most 1000 non-NULL nonnegative paragraph indices' USING ERRCODE='22023';
  END IF;
  -- Invalid/invisible stories do not synthesize valid context records.
  IF NOT EXISTS(SELECT 1 FROM public.stories s WHERE s.id=p_story_id) THEN RETURN NULL; END IF;
  SELECT count(*) INTO general_count FROM public.comments c
  WHERE c.story_id=p_story_id AND c.chapter_index=p_chapter_index AND c.scope='chapter';
  SELECT coalesce(jsonb_agg(jsonb_build_object('paragraph_index',x.i,'comment_count',x.n) ORDER BY x.i),'[]'::jsonb)
  INTO paragraphs FROM (
    SELECT requested.i,count(c.id) AS n
    FROM (SELECT DISTINCT unnest(p_paragraph_indices) AS i) requested
    LEFT JOIN public.comments c ON c.story_id=p_story_id AND c.chapter_index=p_chapter_index
      AND c.paragraph_index=requested.i
      -- Preserve cloudCommentKey's legacy NULL-scope paragraph fallback.
      AND (c.scope='paragraph' OR c.scope IS NULL)
    GROUP BY requested.i
  ) x;
  RETURN jsonb_build_object('story_id',p_story_id,'chapter_index',p_chapter_index,
    'chapter_comment_count',general_count,'paragraph_counts',paragraphs);
END;
$$;

CREATE FUNCTION public.nca_profile_comment_count(p_user_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result bigint;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Expected a non-NULL profile user ID' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO result FROM public.comments c WHERE c.user_id=p_user_id;
  RETURN result;
END;
$$;

CREATE FUNCTION public.nca_comment_like_counts(p_comment_ids bigint[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_comment_ids IS NULL OR EXISTS(SELECT 1 FROM unnest(p_comment_ids) i WHERE i IS NULL)
    OR coalesce(array_ndims(p_comment_ids),1) <> 1 OR cardinality(p_comment_ids)>1000 THEN
    RAISE EXCEPTION 'Expected a non-NULL one-dimensional array of at most 1000 non-NULL comment IDs' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('comment_id',x.id,'like_count',x.n) ORDER BY x.id),'[]'::jsonb)
  INTO result FROM (
    SELECT c.id,count(l.id) AS n FROM public.comments c
    LEFT JOIN public.comment_likes l ON l.comment_id=c.id
    WHERE c.id=ANY(p_comment_ids) GROUP BY c.id
  ) x;
  RETURN result;
END;
$$;

CREATE FUNCTION public.nca_my_comment_likes(p_comment_ids bigint[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb; owner uuid;
BEGIN
  IF p_comment_ids IS NULL OR EXISTS(SELECT 1 FROM unnest(p_comment_ids) i WHERE i IS NULL)
    OR coalesce(array_ndims(p_comment_ids),1) <> 1 OR cardinality(p_comment_ids)>1000 THEN
    RAISE EXCEPTION 'Expected a non-NULL one-dimensional array of at most 1000 non-NULL comment IDs' USING ERRCODE='22023';
  END IF;
  owner := auth.uid();
  IF owner IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(x.comment_id ORDER BY x.comment_id),'[]'::jsonb) INTO result
  FROM (
    SELECT DISTINCT l.comment_id FROM public.comment_likes l
    JOIN public.comments c ON c.id=l.comment_id
    WHERE l.user_id=owner AND l.comment_id=ANY(p_comment_ids)
  ) x;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.nca_story_comment_counts(bigint[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.nca_chapter_comment_counts(bigint,integer,integer[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.nca_profile_comment_count(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.nca_comment_like_counts(bigint[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.nca_my_comment_likes(bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nca_story_comment_counts(bigint[]) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nca_chapter_comment_counts(bigint,integer,integer[]) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nca_profile_comment_count(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nca_comment_like_counts(bigint[]) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nca_my_comment_likes(bigint[]) TO authenticated;
COMMIT;
