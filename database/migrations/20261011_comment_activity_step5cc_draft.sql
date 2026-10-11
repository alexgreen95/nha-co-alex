-- Step 5C-C LOCAL DRAFT. Additive bounded public-visible activity, no data mutations.
BEGIN;
CREATE FUNCTION public.nca_comment_activity_page(p_user_id uuid DEFAULT NULL,p_cursor jsonb DEFAULT NULL,p_limit integer DEFAULT 6)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE binding jsonb:=jsonb_build_object('v',1,'user_id',p_user_id); cursor_id bigint; cursor_time timestamptz; selected jsonb; more boolean; last_row jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>50 THEN RAISE EXCEPTION 'Invalid activity limit' USING ERRCODE='22023'; END IF;
 IF p_cursor IS NOT NULL THEN
  IF jsonb_typeof(p_cursor) IS DISTINCT FROM 'object' OR NOT(p_cursor ?& ARRAY['v','user_id','id','created_at']) OR (p_cursor-ARRAY['id','created_at']) IS DISTINCT FROM binding
   OR jsonb_typeof(p_cursor->'id') IS DISTINCT FROM 'string' OR (p_cursor->>'id')!~'^[1-9][0-9]*$' OR jsonb_typeof(p_cursor->'created_at') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION 'Invalid activity cursor' USING ERRCODE='22023'; END IF;
  BEGIN cursor_id:=(p_cursor->>'id')::bigint;cursor_time:=(p_cursor->>'created_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid activity cursor types' USING ERRCODE='22023'; END;
  IF NOT isfinite(cursor_time) AND (p_cursor->>'created_at') NOT IN ('infinity','-infinity') THEN RAISE EXCEPTION 'Noncanonical nonfinite activity time' USING ERRCODE='22023'; END IF;
 END IF;
 WITH page AS MATERIALIZED (
  SELECT c.* FROM public.comments c WHERE (p_user_id IS NULL OR c.user_id=p_user_id)
   AND (p_cursor IS NULL OR (c.created_at,c.id)<(cursor_time,cursor_id))
  ORDER BY c.created_at DESC,c.id DESC LIMIT p_limit+1
 ), visible AS (SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT p_limit)
 SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id::text,'paragraph_id',c.paragraph_id::text,'user_id',c.user_id,'content',c.content,'created_at',c.created_at,'edited_at',c.edited_at,'scope',c.scope,'story_id',c.story_id::text,'chapter_index',c.chapter_index,'paragraph_index',c.paragraph_index,'parent_id',c.parent_id::text,'reply_to_user_id',c.reply_to_user_id) ORDER BY c.created_at DESC,c.id DESC) FROM visible c),'[]'::jsonb),(SELECT count(*)>p_limit FROM page) INTO selected,more;
 last_row:=selected->(jsonb_array_length(selected)-1);
 RETURN jsonb_build_object('status','ok','rows',selected,'page_size',p_limit,'has_more',more,'next_cursor',CASE WHEN last_row IS NULL THEN NULL ELSE binding||jsonb_build_object('id',last_row->>'id','created_at',last_row->>'created_at') END);
END;
$$;
REVOKE ALL ON FUNCTION public.nca_comment_activity_page(uuid,jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nca_comment_activity_page(uuid,jsonb,integer) TO anon,authenticated;
COMMIT;
