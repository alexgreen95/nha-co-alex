-- FINAL FOR REVIEW ONLY. Not executed; frontend support is not deployed.
-- Historical baselines are additive to real events, never fake event rows.
BEGIN;

-- Require the existing Step 1 RPC so CREATE OR REPLACE preserves its ACL.
DO $guard$
BEGIN
  IF pg_catalog.to_regprocedure('public.nca_story_view_counts(bigint[])') IS NULL THEN
    RAISE EXCEPTION 'Existing Step 1 RPC nca_story_view_counts(bigint[]) is missing';
  END IF;
END;
$guard$;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS baseline_views bigint NOT NULL DEFAULT 0
    CONSTRAINT stories_baseline_views_nonnegative CHECK (baseline_views >= 0),
  ADD COLUMN IF NOT EXISTS baseline_likes bigint NOT NULL DEFAULT 0
    CONSTRAINT stories_baseline_likes_nonnegative CHECK (baseline_likes >= 0);

-- The ALTER TABLE lock is held until COMMIT: mapping cannot change between
-- validation and assignment. Exact title/author mismatches abort the transaction.
DO $baselines$
DECLARE
  expected jsonb;
  mismatches text;
BEGIN
  SELECT jsonb_agg(to_jsonb(e)) INTO expected
  FROM (VALUES
    (7::bigint, 'Đây không phải tiên giới mà ta muốn', 'Giang Nam Hồn Cô Nương', 10000::bigint, 1050::bigint),
    (5::bigint, 'Bạn gái quái vật', 'Hữu Tình Khách', 649000::bigint, 75700::bigint),
    (2::bigint, 'Làm xác sống trong trò chơi sinh tồn', 'Tiêu Diêm Quất', 83400::bigint, 11300::bigint),
    (8::bigint, 'Hướng đông lưu', 'Giang Nhất Thủy', 485000::bigint, 33900::bigint),
    (6::bigint, 'Công chúa muốn làm Kỵ sĩ Rồng', 'Tô Tửu', 97500::bigint, 12800::bigint),
    (10::bigint, 'Hồ sơ tâm lí tội phạm - Quyển 1: Tội không thể tha', 'Địa Sơn Khiêm', 71300::bigint, 5290::bigint),
    (3::bigint, 'Bí mật', 'Nhược Hoa Từ Thụ', 564000::bigint, 47500::bigint),
    (11::bigint, 'Vợ tôi đáng yêu nhất quả đất', 'Lục U U', 1270000::bigint, 94000::bigint),
    (9::bigint, 'Tỏ tình xong, tôi lộ thân phận', 'Kiến Kình Lạc', 1610000::bigint, 121000::bigint),
    (4::bigint, 'Ly hôn hiểu biết một chút', 'Thủy Sắc Thiên Thanh', 4550000::bigint, 273000::bigint)
  ) AS e(id, title, author, baseline_views, baseline_likes);

  SELECT string_agg(e.id::text, ', ' ORDER BY e.id) INTO mismatches
  FROM jsonb_to_recordset(expected) AS e(
    id bigint, title text, author text, baseline_views bigint, baseline_likes bigint
  )
  LEFT JOIN public.stories s ON s.id = e.id
  WHERE s.id IS NULL
     OR s.title IS DISTINCT FROM e.title
     OR s.author IS DISTINCT FROM e.author;

  IF mismatches IS NOT NULL THEN
    RAISE EXCEPTION 'Baseline mapping mismatch/missing story IDs: %. No baseline import committed.', mismatches;
  END IF;

  UPDATE public.stories s
  SET baseline_views = e.baseline_views,
      baseline_likes = e.baseline_likes
  FROM jsonb_to_recordset(expected) AS e(
    id bigint, title text, author text, baseline_views bigint, baseline_likes bigint
  )
  WHERE s.id = e.id
    AND (s.baseline_views IS DISTINCT FROM e.baseline_views
      OR s.baseline_likes IS DISTINCT FROM e.baseline_likes);
END;
$baselines$;

-- Same signature, return type, security, stability, search_path and <=100 limit.
-- CREATE OR REPLACE preserves the existing function's ownership and grants.
CREATE OR REPLACE FUNCTION public.nca_story_view_counts(p_story_ids bigint[])
RETURNS TABLE(story_id bigint, view_count bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_story_ids IS NULL OR cardinality(p_story_ids) = 0 THEN
    RETURN;
  END IF;

  IF cardinality(p_story_ids) > 100 THEN
    RAISE EXCEPTION 'Request at most 100 story IDs'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT s.id, s.baseline_views + count(v.id)
    FROM public.stories s
    LEFT JOIN public.story_views v ON v.story_id = s.id
    WHERE s.id = ANY(p_story_ids)
    GROUP BY s.id, s.baseline_views;
END;
$function$;

COMMIT;
