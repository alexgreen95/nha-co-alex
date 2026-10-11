-- Step 5C-B1 LOCAL DRAFT ONLY. Not approved for production execution.
-- Four additive read RPCs; no data changes, helpers, indexes or policy changes.
-- Depth 1024 is a resource safety budget, not a semantic thread maximum.
-- Timeout/cancellation surfaces as RPC error; this draft does not override platform timeouts.
-- Bigint JSON fields are decimal strings. Scalar arrays bounded to 20/6/65.
-- Classification matcher: js-slugify-node24-unicode17-v1 (fixed 666-codepoint mapping).
BEGIN;
CREATE FUNCTION public.nca_story_comment_root_page(
 p_story_id bigint,p_page_number bigint DEFAULT 1,p_target_root_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $rpc$
DECLARE
 data jsonb; health_status text; total bigint; start_at bigint:=0; n bigint;
 selected jsonb:='[]'::jsonb; row_value jsonb; target_pos bigint;
 before_token jsonb; next_token jsonb;
 actual_page bigint; pages bigint; target_status text:='not_requested';
BEGIN
 IF p_story_id IS NULL OR p_story_id<=0 OR p_page_number IS NULL OR p_page_number<1 OR (p_target_root_id IS NOT NULL AND p_target_root_id<=0) THEN
 RAISE EXCEPTION 'Invalid story/page/target' USING ERRCODE='22023'; END IF;
WITH RECURSIVE eligible AS MATERIALIZED (SELECT c.* FROM public.comments c WHERE c.story_id=p_story_id AND c.parent_id IS NULL),
 forest(root_id,id,path,depth,root_context,context_ok,is_cycle) AS (
 SELECT e.id,e.id,ARRAY[e.id],0,(CASE WHEN e.scope='story' THEN jsonb_build_array('story',e.story_id::text) WHEN e.scope='chapter' THEN jsonb_build_array('chapter',e.story_id::text,e.chapter_index) WHEN e.scope='paragraph' OR e.scope IS NULL THEN jsonb_build_array('paragraph',e.story_id::text,e.chapter_index,e.paragraph_index) ELSE NULL END),(e.story_id IS NOT NULL AND (e.scope='story' OR (e.scope='chapter' AND e.chapter_index>=0) OR ((e.scope='paragraph' OR e.scope IS NULL) AND e.chapter_index>=0 AND e.paragraph_index>=0))) IS TRUE,false FROM eligible e
 UNION ALL
 SELECT f.root_id,c.id,f.path||c.id,f.depth+1,f.root_context,
 f.context_ok AND (c.story_id IS NOT NULL AND (c.scope='story' OR (c.scope='chapter' AND c.chapter_index>=0) OR ((c.scope='paragraph' OR c.scope IS NULL) AND c.chapter_index>=0 AND c.paragraph_index>=0))) IS TRUE AND ((CASE WHEN c.scope='story' THEN jsonb_build_array('story',c.story_id::text) WHEN c.scope='chapter' THEN jsonb_build_array('chapter',c.story_id::text,c.chapter_index) WHEN c.scope='paragraph' OR c.scope IS NULL THEN jsonb_build_array('paragraph',c.story_id::text,c.chapter_index,c.paragraph_index) ELSE NULL END) IS NOT DISTINCT FROM f.root_context),c.id=ANY(f.path)
 FROM forest f JOIN public.comments c ON c.parent_id=f.id
 WHERE NOT f.is_cycle AND f.depth<1024
 ), health AS (
 SELECT CASE WHEN coalesce(bool_or(is_cycle OR NOT context_ok),false) THEN 'malformed_thread'
 WHEN EXISTS(SELECT 1 FROM forest f JOIN public.comments c ON c.parent_id=f.id WHERE f.depth=1024 AND NOT f.is_cycle) THEN 'incomplete'
 ELSE 'ok' END AS status FROM forest
 ), descendants AS (
 SELECT root_id,count(*) FILTER(WHERE depth>0 AND NOT is_cycle) AS n FROM forest GROUP BY root_id
 ), likes AS (
 SELECT l.comment_id,count(*) AS n FROM public.comment_likes l JOIN eligible e ON e.id=l.comment_id GROUP BY l.comment_id
 )
 SELECT h.status,coalesce((SELECT jsonb_agg(jsonb_build_object('comment',jsonb_build_object('id',e.id::text,'paragraph_id',e.paragraph_id::text,'user_id',e.user_id,'content',e.content,'created_at',e.created_at,'edited_at',e.edited_at,'scope',e.scope,'story_id',e.story_id::text,'chapter_index',e.chapter_index,'paragraph_index',e.paragraph_index,'parent_id',e.parent_id::text,'reply_to_user_id',e.reply_to_user_id),'descendant_total',d.n::text) ORDER BY e.created_at DESC,e.id DESC) FROM eligible e JOIN descendants d ON d.root_id=e.id),'[]'::jsonb)
 INTO health_status,data FROM health h;
 total:=jsonb_array_length(data); pages:=greatest(1,(total+19)/20); actual_page:=least(p_page_number,pages);
 IF p_target_root_id IS NOT NULL THEN
 SELECT ord-1 INTO target_pos FROM jsonb_array_elements(data) WITH ORDINALITY x(value,ord) WHERE value->'comment'->>'id'=p_target_root_id::text;
 target_status:=CASE WHEN target_pos IS NULL THEN 'not_found' ELSE 'found' END;
 IF target_pos IS NOT NULL THEN actual_page:=target_pos/20+1; END IF;
 END IF;
 IF health_status<>'ok' THEN
 RETURN jsonb_build_object('status',health_status,'reason',CASE WHEN health_status='incomplete' THEN 'resource_budget' ELSE 'context_or_cycle' END,'rows','[]'::jsonb,'root_total',NULL,'page_count',NULL,'before_cursor',NULL,'next_cursor',NULL); END IF;
 start_at:=(actual_page-1)*20;
 SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO selected FROM jsonb_array_elements(data) WITH ORDINALITY x(value,ord) WHERE ord>start_at AND ord<=start_at+20;
 RETURN jsonb_build_object('status','ok','story_id',p_story_id::text,'requested_page',p_page_number::text,'actual_page',actual_page::text,'page_size',20,'root_total',total::text,'page_count',pages::text,'has_previous',actual_page>1,'has_more',actual_page<pages,'target_status',target_status,'rows',selected);
END;
$rpc$;
CREATE FUNCTION public.nca_context_comment_root_page(
 p_context text,p_story_id bigint,p_chapter_index integer,p_paragraph_index integer DEFAULT NULL,
 p_loaded_paragraph_count integer DEFAULT NULL,p_sort text DEFAULT 'newest',p_cursor jsonb DEFAULT NULL,
 p_limit integer DEFAULT 20,p_target_root_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $rpc$
DECLARE
 data jsonb; health_status text; total bigint; start_at bigint:=0; n bigint;
 selected jsonb:='[]'::jsonb; row_value jsonb; target_pos bigint;
 before_token jsonb; next_token jsonb;
 viewer uuid:=auth.uid(); claims jsonb; profile_name text; display_name text; metadata_name text;
 viewer_admin boolean:=false; viewer_fingerprint text; binding jsonb; slug text; input_name text;
 slug_map jsonb:='{"48":"0","49":"1","50":"2","51":"3","52":"4","53":"5","54":"6","55":"7","56":"8","57":"9","65":"a","97":"a","192":"a","193":"a","194":"a","195":"a","196":"a","197":"a","224":"a","225":"a","226":"a","227":"a","228":"a","229":"a","256":"a","257":"a","258":"a","259":"a","260":"a","261":"a","461":"a","462":"a","478":"a","479":"a","480":"a","481":"a","506":"a","507":"a","512":"a","513":"a","514":"a","515":"a","550":"a","551":"a","7680":"a","7681":"a","7840":"a","7841":"a","7842":"a","7843":"a","7844":"a","7845":"a","7846":"a","7847":"a","7848":"a","7849":"a","7850":"a","7851":"a","7852":"a","7853":"a","7854":"a","7855":"a","7856":"a","7857":"a","7858":"a","7859":"a","7860":"a","7861":"a","7862":"a","7863":"a","8491":"a","66":"b","98":"b","7682":"b","7683":"b","7684":"b","7685":"b","7686":"b","7687":"b","67":"c","99":"c","199":"c","231":"c","262":"c","263":"c","264":"c","265":"c","266":"c","267":"c","268":"c","269":"c","7688":"c","7689":"c","68":"d","100":"d","270":"d","271":"d","272":"d","273":"d","7690":"d","7691":"d","7692":"d","7693":"d","7694":"d","7695":"d","7696":"d","7697":"d","7698":"d","7699":"d","69":"e","101":"e","200":"e","201":"e","202":"e","203":"e","232":"e","233":"e","234":"e","235":"e","274":"e","275":"e","276":"e","277":"e","278":"e","279":"e","280":"e","281":"e","282":"e","283":"e","516":"e","517":"e","518":"e","519":"e","552":"e","553":"e","7700":"e","7701":"e","7702":"e","7703":"e","7704":"e","7705":"e","7706":"e","7707":"e","7708":"e","7709":"e","7864":"e","7865":"e","7866":"e","7867":"e","7868":"e","7869":"e","7870":"e","7871":"e","7872":"e","7873":"e","7874":"e","7875":"e","7876":"e","7877":"e","7878":"e","7879":"e","70":"f","102":"f","7710":"f","7711":"f","71":"g","103":"g","284":"g","285":"g","286":"g","287":"g","288":"g","289":"g","290":"g","291":"g","486":"g","487":"g","500":"g","501":"g","7712":"g","7713":"g","72":"h","104":"h","292":"h","293":"h","542":"h","543":"h","7714":"h","7715":"h","7716":"h","7717":"h","7718":"h","7719":"h","7720":"h","7721":"h","7722":"h","7723":"h","7830":"h","73":"i","105":"i","204":"i","205":"i","206":"i","207":"i","236":"i","237":"i","238":"i","239":"i","296":"i","297":"i","298":"i","299":"i","300":"i","301":"i","302":"i","303":"i","304":"i","463":"i","464":"i","520":"i","521":"i","522":"i","523":"i","7724":"i","7725":"i","7726":"i","7727":"i","7880":"i","7881":"i","7882":"i","7883":"i","74":"j","106":"j","308":"j","309":"j","496":"j","75":"k","107":"k","310":"k","311":"k","488":"k","489":"k","7728":"k","7729":"k","7730":"k","7731":"k","7732":"k","7733":"k","8490":"k","76":"l","108":"l","313":"l","314":"l","315":"l","316":"l","317":"l","318":"l","7734":"l","7735":"l","7736":"l","7737":"l","7738":"l","7739":"l","7740":"l","7741":"l","77":"m","109":"m","7742":"m","7743":"m","7744":"m","7745":"m","7746":"m","7747":"m","78":"n","110":"n","209":"n","241":"n","323":"n","324":"n","325":"n","326":"n","327":"n","328":"n","504":"n","505":"n","7748":"n","7749":"n","7750":"n","7751":"n","7752":"n","7753":"n","7754":"n","7755":"n","79":"o","111":"o","210":"o","211":"o","212":"o","213":"o","214":"o","242":"o","243":"o","244":"o","245":"o","246":"o","332":"o","333":"o","334":"o","335":"o","336":"o","337":"o","416":"o","417":"o","465":"o","466":"o","490":"o","491":"o","492":"o","493":"o","524":"o","525":"o","526":"o","527":"o","554":"o","555":"o","556":"o","557":"o","558":"o","559":"o","560":"o","561":"o","7756":"o","7757":"o","7758":"o","7759":"o","7760":"o","7761":"o","7762":"o","7763":"o","7884":"o","7885":"o","7886":"o","7887":"o","7888":"o","7889":"o","7890":"o","7891":"o","7892":"o","7893":"o","7894":"o","7895":"o","7896":"o","7897":"o","7898":"o","7899":"o","7900":"o","7901":"o","7902":"o","7903":"o","7904":"o","7905":"o","7906":"o","7907":"o","80":"p","112":"p","7764":"p","7765":"p","7766":"p","7767":"p","81":"q","113":"q","82":"r","114":"r","340":"r","341":"r","342":"r","343":"r","344":"r","345":"r","528":"r","529":"r","530":"r","531":"r","7768":"r","7769":"r","7770":"r","7771":"r","7772":"r","7773":"r","7774":"r","7775":"r","83":"s","115":"s","346":"s","347":"s","348":"s","349":"s","350":"s","351":"s","352":"s","353":"s","536":"s","537":"s","7776":"s","7777":"s","7778":"s","7779":"s","7780":"s","7781":"s","7782":"s","7783":"s","7784":"s","7785":"s","84":"t","116":"t","354":"t","355":"t","356":"t","357":"t","538":"t","539":"t","7786":"t","7787":"t","7788":"t","7789":"t","7790":"t","7791":"t","7792":"t","7793":"t","7831":"t","85":"u","117":"u","217":"u","218":"u","219":"u","220":"u","249":"u","250":"u","251":"u","252":"u","360":"u","361":"u","362":"u","363":"u","364":"u","365":"u","366":"u","367":"u","368":"u","369":"u","370":"u","371":"u","431":"u","432":"u","467":"u","468":"u","469":"u","470":"u","471":"u","472":"u","473":"u","474":"u","475":"u","476":"u","532":"u","533":"u","534":"u","535":"u","7794":"u","7795":"u","7796":"u","7797":"u","7798":"u","7799":"u","7800":"u","7801":"u","7802":"u","7803":"u","7908":"u","7909":"u","7910":"u","7911":"u","7912":"u","7913":"u","7914":"u","7915":"u","7916":"u","7917":"u","7918":"u","7919":"u","7920":"u","7921":"u","86":"v","118":"v","7804":"v","7805":"v","7806":"v","7807":"v","87":"w","119":"w","372":"w","373":"w","7808":"w","7809":"w","7810":"w","7811":"w","7812":"w","7813":"w","7814":"w","7815":"w","7816":"w","7817":"w","7832":"w","88":"x","120":"x","7818":"x","7819":"x","7820":"x","7821":"x","89":"y","121":"y","221":"y","253":"y","255":"y","374":"y","375":"y","376":"y","562":"y","563":"y","7822":"y","7823":"y","7833":"y","7922":"y","7923":"y","7924":"y","7925":"y","7926":"y","7927":"y","7928":"y","7929":"y","90":"z","122":"z","377":"z","378":"z","379":"z","380":"z","381":"z","382":"z","7824":"z","7825":"z","7826":"z","7827":"z","7828":"z","7829":"z","768":"","769":"","770":"","771":"","772":"","773":"","774":"","775":"","776":"","777":"","778":"","779":"","780":"","781":"","782":"","783":"","784":"","785":"","786":"","787":"","788":"","789":"","790":"","791":"","792":"","793":"","794":"","795":"","796":"","797":"","798":"","799":"","800":"","801":"","802":"","803":"","804":"","805":"","806":"","807":"","808":"","809":"","810":"","811":"","812":"","813":"","814":"","815":"","816":"","817":"","818":"","819":"","820":"","821":"","822":"","823":"","824":"","825":"","826":"","827":"","828":"","829":"","830":"","831":"","832":"","833":"","834":"","835":"","836":"","837":"","838":"","839":"","840":"","841":"","842":"","843":"","844":"","845":"","846":"","847":"","848":"","849":"","850":"","851":"","852":"","853":"","854":"","855":"","856":"","857":"","858":"","859":"","860":"","861":"","862":"","863":"","864":"","865":"","866":"","867":"","868":"","869":"","870":"","871":"","872":"","873":"","874":"","875":"","876":"","877":"","878":"","879":""}'::jsonb; version text:='js-slugify-node24-unicode17-v1';
 cursor_time timestamptz; cursor_id bigint; cursor_score bigint; cursor_bucket integer;
 target_status text:='not_requested'; cursor_out jsonb;
BEGIN
 IF p_context IS NULL OR p_context NOT IN ('chapter','paragraph') OR p_story_id IS NULL OR p_story_id<=0 OR p_chapter_index IS NULL OR p_chapter_index<0
 OR p_sort IS NULL OR p_sort NOT IN ('newest','all','interaction') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20
 OR (p_target_root_id IS NOT NULL AND p_target_root_id<=0) OR (p_cursor IS NOT NULL AND p_target_root_id IS NOT NULL)
 OR (p_context='chapter' AND (p_loaded_paragraph_count IS NULL OR p_loaded_paragraph_count<0 OR p_paragraph_index IS NOT NULL))
 OR (p_context='paragraph' AND (p_paragraph_index IS NULL OR p_paragraph_index<0 OR p_loaded_paragraph_count IS NOT NULL OR p_sort<>'newest')) THEN
 RAISE EXCEPTION 'Invalid context arguments' USING ERRCODE='22023'; END IF;
 IF viewer IS NOT NULL THEN
 claims:=auth.jwt();
 IF claims IS NULL OR jsonb_typeof(claims)<>'object' OR (claims ? 'user_metadata' AND jsonb_typeof(claims->'user_metadata') NOT IN ('object','null')) THEN RAISE EXCEPTION 'Malformed presentation claims' USING ERRCODE='22023'; END IF;
 FOR input_name IN SELECT key FROM jsonb_each(coalesce(nullif(claims->'user_metadata','null'::jsonb),'{}'::jsonb)) WHERE key IN ('full_name','name') AND jsonb_typeof(value) NOT IN ('string','null') LOOP
 RAISE EXCEPTION 'Malformed presentation metadata' USING ERRCODE='22023'; END LOOP;
 IF claims ? 'email' AND jsonb_typeof(claims->'email') NOT IN ('string','null') THEN RAISE EXCEPTION 'Malformed email claim' USING ERRCODE='22023'; END IF;
 SELECT p.display_name INTO profile_name FROM public.profiles p WHERE p.id=viewer;
 metadata_name:=coalesce(nullif(claims->'user_metadata'->>'full_name',''),nullif(claims->'user_metadata'->>'name',''),'');
 display_name:=coalesce(nullif(profile_name,''),nullif(metadata_name,''),nullif(split_part(claims->>'email','@',1),''),'Thành viên');
 FOREACH input_name IN ARRAY ARRAY[display_name,metadata_name] LOOP
 SELECT coalesce(string_agg(coalesce(slug_map->>ascii(ch)::text,'-'),'' ORDER BY ord),'') INTO slug FROM regexp_split_to_table(input_name,'') WITH ORDINALITY chars(ch,ord);
 slug:=trim(BOTH '-' FROM regexp_replace(slug,'-+','-','g'));
 viewer_admin:=viewer_admin OR slug IN ('alex','thao-tran'); END LOOP;
 END IF;
 viewer_fingerprint:=md5(coalesce(viewer::text,'anonymous')||':'||viewer_admin::text||':'||version);
 binding:=jsonb_build_object('v',1,'context',p_context,'story_id',p_story_id::text,'chapter_index',p_chapter_index,'paragraph_index',p_paragraph_index,'loaded_paragraph_count',p_loaded_paragraph_count,'sort',p_sort);
 IF p_cursor IS NOT NULL THEN
 IF jsonb_typeof(p_cursor)<>'object' OR NOT (p_cursor ?& ARRAY['v','context','story_id','chapter_index','paragraph_index','loaded_paragraph_count','sort','id','created_at'])
 OR (p_cursor - ARRAY['id','created_at','score','admin_bucket','classification_version','viewer_fingerprint'])<>binding
 OR jsonb_typeof(p_cursor->'id') IS DISTINCT FROM 'string' OR (p_cursor->>'id')!~'^[1-9][0-9]*$' OR jsonb_typeof(p_cursor->'created_at') IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION 'Invalid context cursor' USING ERRCODE='22023'; END IF;
 BEGIN cursor_id:=(p_cursor->>'id')::bigint; cursor_time:=(p_cursor->>'created_at')::timestamptz;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid cursor types' USING ERRCODE='22023'; END;
 IF NOT isfinite(cursor_time) AND (p_cursor->>'created_at') NOT IN ('infinity','-infinity') THEN RAISE EXCEPTION 'Noncanonical nonfinite cursor time' USING ERRCODE='22023'; END IF;
 IF p_sort='newest' AND (p_cursor ?| ARRAY['score','admin_bucket','classification_version','viewer_fingerprint']) THEN RAISE EXCEPTION 'Unexpected newest cursor fields' USING ERRCODE='22023'; END IF;
 IF p_sort='all' AND p_cursor ? 'score' THEN RAISE EXCEPTION 'Unexpected all cursor score' USING ERRCODE='22023'; END IF;
 IF p_sort='interaction' AND p_cursor ?| ARRAY['admin_bucket','classification_version','viewer_fingerprint'] THEN RAISE EXCEPTION 'Unexpected interaction cursor fields' USING ERRCODE='22023'; END IF;
 IF p_sort='all' THEN
 IF NOT (p_cursor ?& ARRAY['admin_bucket','classification_version','viewer_fingerprint']) OR jsonb_typeof(p_cursor->'admin_bucket') IS DISTINCT FROM 'number' OR p_cursor->>'admin_bucket' NOT IN ('0','1') OR jsonb_typeof(p_cursor->'classification_version') IS DISTINCT FROM 'string' OR jsonb_typeof(p_cursor->'viewer_fingerprint') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid admin cursor' USING ERRCODE='22023'; END IF;
 IF p_cursor->>'classification_version' IS DISTINCT FROM version OR p_cursor->>'viewer_fingerprint' IS DISTINCT FROM viewer_fingerprint THEN RETURN jsonb_build_object('status','stale_cursor','rows','[]'::jsonb,'root_total',NULL,'next_cursor',NULL,'before_cursor',NULL); END IF;
 cursor_bucket:=(p_cursor->>'admin_bucket')::integer;
 ELSIF p_sort='interaction' THEN
 IF jsonb_typeof(p_cursor->'score') IS DISTINCT FROM 'string' OR (p_cursor->>'score')!~'^(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION 'Invalid score cursor' USING ERRCODE='22023'; END IF;
 BEGIN cursor_score:=(p_cursor->>'score')::bigint; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid score range' USING ERRCODE='22023'; END;
 END IF;
 END IF;
WITH RECURSIVE eligible AS MATERIALIZED (SELECT c.* FROM public.comments c WHERE c.story_id=p_story_id AND c.chapter_index=p_chapter_index AND c.parent_id IS NULL AND
 ((p_context='chapter' AND (c.scope='chapter' OR ((c.scope='paragraph' OR c.scope IS NULL) AND c.paragraph_index>=0 AND c.paragraph_index<p_loaded_paragraph_count)))
 OR (p_context='paragraph' AND c.paragraph_index=p_paragraph_index AND (c.scope='paragraph' OR c.scope IS NULL)))),
 forest(root_id,id,path,depth,root_context,context_ok,is_cycle) AS (
 SELECT e.id,e.id,ARRAY[e.id],0,(CASE WHEN e.scope='story' THEN jsonb_build_array('story',e.story_id::text) WHEN e.scope='chapter' THEN jsonb_build_array('chapter',e.story_id::text,e.chapter_index) WHEN e.scope='paragraph' OR e.scope IS NULL THEN jsonb_build_array('paragraph',e.story_id::text,e.chapter_index,e.paragraph_index) ELSE NULL END),(e.story_id IS NOT NULL AND (e.scope='story' OR (e.scope='chapter' AND e.chapter_index>=0) OR ((e.scope='paragraph' OR e.scope IS NULL) AND e.chapter_index>=0 AND e.paragraph_index>=0))) IS TRUE,false FROM eligible e
 UNION ALL
 SELECT f.root_id,c.id,f.path||c.id,f.depth+1,f.root_context,
 f.context_ok AND (c.story_id IS NOT NULL AND (c.scope='story' OR (c.scope='chapter' AND c.chapter_index>=0) OR ((c.scope='paragraph' OR c.scope IS NULL) AND c.chapter_index>=0 AND c.paragraph_index>=0))) IS TRUE AND ((CASE WHEN c.scope='story' THEN jsonb_build_array('story',c.story_id::text) WHEN c.scope='chapter' THEN jsonb_build_array('chapter',c.story_id::text,c.chapter_index) WHEN c.scope='paragraph' OR c.scope IS NULL THEN jsonb_build_array('paragraph',c.story_id::text,c.chapter_index,c.paragraph_index) ELSE NULL END) IS NOT DISTINCT FROM f.root_context),c.id=ANY(f.path)
 FROM forest f JOIN public.comments c ON c.parent_id=f.id
 WHERE NOT f.is_cycle AND f.depth<1024
 ), health AS (
 SELECT CASE WHEN coalesce(bool_or(is_cycle OR NOT context_ok),false) THEN 'malformed_thread'
 WHEN EXISTS(SELECT 1 FROM forest f JOIN public.comments c ON c.parent_id=f.id WHERE f.depth=1024 AND NOT f.is_cycle) THEN 'incomplete'
 ELSE 'ok' END AS status FROM forest
 ), descendants AS (
 SELECT root_id,count(*) FILTER(WHERE depth>0 AND NOT is_cycle) AS n FROM forest GROUP BY root_id
 ), likes AS (
 SELECT l.comment_id,count(*) AS n FROM public.comment_likes l JOIN eligible e ON e.id=l.comment_id GROUP BY l.comment_id
 ), ranked AS (
 SELECT e.*,d.n AS replies,coalesce(l.n,0) AS real_likes,d.n+coalesce(l.n,0) AS score,
 CASE WHEN (viewer_admin AND e.user_id=viewer) OR a.slug IN ('alex','thao-tran') THEN 1 ELSE 0 END AS bucket
 FROM eligible e JOIN descendants d ON d.root_id=e.id LEFT JOIN likes l ON l.comment_id=e.id
 LEFT JOIN public.profiles p ON p.id=e.user_id
 CROSS JOIN LATERAL (SELECT trim(BOTH '-' FROM regexp_replace(coalesce(string_agg(coalesce(slug_map->>ascii(ch)::text,'-'),'' ORDER BY ord),''),'-+','-','g')) AS slug FROM regexp_split_to_table(coalesce(nullif(p.display_name,''),'thanh-vien'),'') WITH ORDINALITY chars(ch,ord)) a
 )
 SELECT h.status,coalesce((SELECT jsonb_agg(jsonb_build_object('comment',jsonb_build_object('id',r.id::text,'paragraph_id',r.paragraph_id::text,'user_id',r.user_id,'content',r.content,'created_at',r.created_at,'edited_at',r.edited_at,'scope',r.scope,'story_id',r.story_id::text,'chapter_index',r.chapter_index,'paragraph_index',r.paragraph_index,'parent_id',r.parent_id::text,'reply_to_user_id',r.reply_to_user_id),'descendant_total',r.replies::text,'root_like_count',r.real_likes::text,'score',r.score::text,'admin_bucket',r.bucket)
 ORDER BY CASE WHEN p_sort='all' THEN r.bucket END DESC,
 CASE WHEN p_sort='interaction' THEN r.score END DESC,
 CASE WHEN p_sort='all' THEN r.created_at END ASC,CASE WHEN p_sort='all' THEN r.id END ASC,
 CASE WHEN p_sort<>'all' THEN r.created_at END DESC,CASE WHEN p_sort<>'all' THEN r.id END DESC) FROM ranked r),'[]'::jsonb)
 INTO health_status,data FROM health h;
 IF health_status<>'ok' THEN RETURN jsonb_build_object('status',health_status,'reason',CASE WHEN health_status='incomplete' THEN 'resource_budget' ELSE 'context_or_cycle' END,'rows','[]'::jsonb,'root_total',NULL,'next_cursor',NULL,'before_cursor',NULL); END IF;
 total:=jsonb_array_length(data);
 IF p_target_root_id IS NOT NULL THEN
 SELECT ord-1 INTO target_pos FROM jsonb_array_elements(data) WITH ORDINALITY x(value,ord) WHERE value->'comment'->>'id'=p_target_root_id::text;
 target_status:=CASE WHEN target_pos IS NULL THEN 'not_found' ELSE 'found' END;
 start_at:=coalesce(target_pos,0);
 ELSIF p_cursor IS NOT NULL THEN
 start_at:=total;
 FOR row_value,n IN SELECT value,ord-1 FROM jsonb_array_elements(data) WITH ORDINALITY x(value,ord) LOOP
 IF (p_sort='newest' AND ((row_value->'comment'->>'created_at')::timestamptz,(row_value->'comment'->>'id')::bigint)<(cursor_time,cursor_id))
 OR (p_sort='interaction' AND ((row_value->>'score')::bigint,(row_value->'comment'->>'created_at')::timestamptz,(row_value->'comment'->>'id')::bigint)<(cursor_score,cursor_time,cursor_id))
 OR (p_sort='all' AND ((row_value->>'admin_bucket')::integer<cursor_bucket OR ((row_value->>'admin_bucket')::integer=cursor_bucket AND ((row_value->'comment'->>'created_at')::timestamptz,(row_value->'comment'->>'id')::bigint)>(cursor_time,cursor_id)))) THEN start_at:=n; EXIT; END IF;
 END LOOP;
 END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO selected FROM jsonb_array_elements(data) WITH ORDINALITY x(value,ord) WHERE ord>start_at AND ord<=start_at+p_limit;
 IF jsonb_array_length(selected)>0 THEN
 FOR n IN 0..1 LOOP
 row_value:=selected->CASE WHEN n=0 THEN 0 ELSE jsonb_array_length(selected)-1 END;
 cursor_out:=binding||jsonb_build_object('id',row_value->'comment'->>'id','created_at',row_value->'comment'->>'created_at');
 IF p_sort='all' THEN cursor_out:=cursor_out||jsonb_build_object('admin_bucket',row_value->'admin_bucket','classification_version',version,'viewer_fingerprint',viewer_fingerprint);
 ELSIF p_sort='interaction' THEN cursor_out:=cursor_out||jsonb_build_object('score',row_value->>'score'); END IF;
 IF n=0 THEN before_token:=cursor_out; ELSE next_token:=cursor_out; END IF;
 END LOOP;
 END IF;
 RETURN jsonb_build_object('status','ok','context',binding,'sort',p_sort,'page_size',p_limit,'root_total',total::text,'rows',selected,'has_before',start_at>0,'has_more',start_at+jsonb_array_length(selected)<total,'before_cursor',before_token,'next_cursor',next_token,'target_status',target_status,'classification_version',version,'viewer_classification',jsonb_build_object('own_admin',viewer_admin,'fingerprint',viewer_fingerprint));
END;
$rpc$;
CREATE FUNCTION public.nca_comment_thread_page(p_root_id bigint,p_cursor jsonb DEFAULT NULL,p_limit integer DEFAULT 6,p_target_comment_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $rpc$
DECLARE
 data jsonb; health_status text; total bigint; start_at bigint:=0; n bigint;
 selected jsonb:='[]'::jsonb; row_value jsonb; target_pos bigint;
 before_token jsonb; next_token jsonb;
 root_row public.comments%ROWTYPE; cursor_id bigint; cursor_time timestamptz; binding jsonb; token jsonb;
BEGIN
 IF p_root_id IS NULL OR p_root_id<=0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 6 OR (p_target_comment_id IS NOT NULL AND p_target_comment_id<=0) OR (p_cursor IS NOT NULL AND p_target_comment_id IS NOT NULL) THEN RAISE EXCEPTION 'Invalid thread arguments' USING ERRCODE='22023'; END IF;
 -- Argument validation is independent of root existence/visibility.
 binding:=jsonb_build_object('v',1,'root_id',p_root_id::text);
 IF p_cursor IS NOT NULL THEN
 IF jsonb_typeof(p_cursor)<>'object' OR NOT(p_cursor ?& ARRAY['v','root_id','id','created_at']) OR (p_cursor-ARRAY['id','created_at'])<>binding OR jsonb_typeof(p_cursor->'id') IS DISTINCT FROM 'string' OR (p_cursor->>'id')!~'^[1-9][0-9]*$' OR jsonb_typeof(p_cursor->'created_at') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid thread cursor' USING ERRCODE='22023'; END IF;
 BEGIN cursor_id:=(p_cursor->>'id')::bigint;cursor_time:=(p_cursor->>'created_at')::timestamptz;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid cursor types' USING ERRCODE='22023'; END;
 IF NOT isfinite(cursor_time) AND (p_cursor->>'created_at') NOT IN ('infinity','-infinity') THEN RAISE EXCEPTION 'Noncanonical nonfinite cursor' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO root_row FROM public.comments WHERE id=p_root_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found','rows','[]'::jsonb,'descendant_total',NULL); END IF;
 IF root_row.parent_id IS NOT NULL THEN RETURN jsonb_build_object('status','invalid_root','rows','[]'::jsonb,'descendant_total',NULL); END IF;
WITH RECURSIVE eligible AS MATERIALIZED (SELECT c.* FROM public.comments c WHERE c.id=p_root_id),
 forest(root_id,id,path,depth,root_context,context_ok,is_cycle) AS (
 SELECT e.id,e.id,ARRAY[e.id],0,(CASE WHEN e.scope='story' THEN jsonb_build_array('story',e.story_id::text) WHEN e.scope='chapter' THEN jsonb_build_array('chapter',e.story_id::text,e.chapter_index) WHEN e.scope='paragraph' OR e.scope IS NULL THEN jsonb_build_array('paragraph',e.story_id::text,e.chapter_index,e.paragraph_index) ELSE NULL END),(e.story_id IS NOT NULL AND (e.scope='story' OR (e.scope='chapter' AND e.chapter_index>=0) OR ((e.scope='paragraph' OR e.scope IS NULL) AND e.chapter_index>=0 AND e.paragraph_index>=0))) IS TRUE,false FROM eligible e
 UNION ALL
 SELECT f.root_id,c.id,f.path||c.id,f.depth+1,f.root_context,
 f.context_ok AND (c.story_id IS NOT NULL AND (c.scope='story' OR (c.scope='chapter' AND c.chapter_index>=0) OR ((c.scope='paragraph' OR c.scope IS NULL) AND c.chapter_index>=0 AND c.paragraph_index>=0))) IS TRUE AND ((CASE WHEN c.scope='story' THEN jsonb_build_array('story',c.story_id::text) WHEN c.scope='chapter' THEN jsonb_build_array('chapter',c.story_id::text,c.chapter_index) WHEN c.scope='paragraph' OR c.scope IS NULL THEN jsonb_build_array('paragraph',c.story_id::text,c.chapter_index,c.paragraph_index) ELSE NULL END) IS NOT DISTINCT FROM f.root_context),c.id=ANY(f.path)
 FROM forest f JOIN public.comments c ON c.parent_id=f.id
 WHERE NOT f.is_cycle AND f.depth<1024
 ), health AS (
 SELECT CASE WHEN coalesce(bool_or(is_cycle OR NOT context_ok),false) THEN 'malformed_thread'
 WHEN EXISTS(SELECT 1 FROM forest f JOIN public.comments c ON c.parent_id=f.id WHERE f.depth=1024 AND NOT f.is_cycle) THEN 'incomplete'
 ELSE 'ok' END AS status FROM forest
 ), descendants AS (
 SELECT root_id,count(*) FILTER(WHERE depth>0 AND NOT is_cycle) AS n FROM forest GROUP BY root_id
 ), likes AS (
 SELECT l.comment_id,count(*) AS n FROM public.comment_likes l JOIN eligible e ON e.id=l.comment_id GROUP BY l.comment_id
 )
 SELECT h.status,coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id::text,'paragraph_id',c.paragraph_id::text,'user_id',c.user_id,'content',c.content,'created_at',c.created_at,'edited_at',c.edited_at,'scope',c.scope,'story_id',c.story_id::text,'chapter_index',c.chapter_index,'paragraph_index',c.paragraph_index,'parent_id',c.parent_id::text,'reply_to_user_id',c.reply_to_user_id) ORDER BY c.created_at ASC,c.id ASC) FROM forest f JOIN public.comments c ON c.id=f.id WHERE f.depth>0 AND NOT f.is_cycle),'[]'::jsonb)
 INTO health_status,data FROM health h;
 IF health_status<>'ok' THEN RETURN jsonb_build_object('status',health_status,'reason',CASE WHEN health_status='incomplete' THEN 'resource_budget' ELSE 'context_or_cycle' END,'rows','[]'::jsonb,'descendant_total',NULL,'before_cursor',NULL,'next_cursor',NULL); END IF;
 total:=jsonb_array_length(data);
 IF p_target_comment_id IS NOT NULL THEN
 SELECT ord-1 INTO target_pos FROM jsonb_array_elements(data) WITH ORDINALITY x(value,ord) WHERE value->>'id'=p_target_comment_id::text;
 -- A locator miss after complete valid traversal may retain its exact total.
 -- malformed_thread/incomplete above still have NULL totals and empty rows/cursors.
 IF target_pos IS NULL THEN RETURN jsonb_build_object('status','target_not_found','rows','[]'::jsonb,'descendant_total',total::text,'before_cursor',NULL,'next_cursor',NULL); END IF;
 start_at:=target_pos;
 ELSIF p_cursor IS NOT NULL THEN
 SELECT coalesce(min(ord)-1,total) INTO start_at FROM jsonb_array_elements(data) WITH ORDINALITY x(value,ord) WHERE ((value->>'created_at')::timestamptz,(value->>'id')::bigint)>(cursor_time,cursor_id);
 END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO selected FROM jsonb_array_elements(data) WITH ORDINALITY x(value,ord) WHERE ord>start_at AND ord<=start_at+p_limit;
 IF jsonb_array_length(selected)>0 THEN
 row_value:=selected->0;before_token:=binding||jsonb_build_object('id',row_value->>'id','created_at',row_value->>'created_at');
 row_value:=selected->(jsonb_array_length(selected)-1);next_token:=binding||jsonb_build_object('id',row_value->>'id','created_at',row_value->>'created_at'); END IF;
 RETURN jsonb_build_object('status','ok','root_id',p_root_id::text,'rows',selected,'descendant_total',total::text,'page_size',p_limit,'has_before',start_at>0,'has_more',start_at+jsonb_array_length(selected)<total,'before_cursor',before_token,'next_cursor',next_token);
END;
$rpc$;
CREATE FUNCTION public.nca_comment_target_path(p_comment_id bigint,p_continuation jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $rpc$
DECLARE
 target public.comments%ROWTYPE; current_row public.comments%ROWTYPE; boundary public.comments%ROWTYPE;
 effective jsonb; current_id bigint; seen bigint[]; result_rows jsonb:='[]'::jsonb;
 token jsonb; state text; steps integer; last_id bigint;
 token_context jsonb; context_kind text; context_length integer; context_story_id bigint; context_index numeric;
BEGIN
 IF p_comment_id IS NULL OR p_comment_id<=0 THEN RAISE EXCEPTION 'Invalid target ID' USING ERRCODE='22023'; END IF;
 -- Validate syntax/types/binding before any data-dependent status return.
 IF p_continuation IS NOT NULL THEN
 IF jsonb_typeof(p_continuation)<>'object' OR NOT(p_continuation ?& ARRAY['v','target_id','last_id','next_id','effective_context']) OR p_continuation->'v' IS DISTINCT FROM '1'::jsonb
 OR p_continuation->>'target_id' IS DISTINCT FROM p_comment_id::text OR jsonb_typeof(p_continuation->'target_id') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_continuation->'last_id') IS DISTINCT FROM 'string' OR (p_continuation->>'last_id')!~'^[1-9][0-9]*$'
 OR jsonb_typeof(p_continuation->'next_id') IS DISTINCT FROM 'string' OR (p_continuation->>'next_id')!~'^[1-9][0-9]*$' THEN
 RAISE EXCEPTION 'Invalid path continuation' USING ERRCODE='22023'; END IF;
 BEGIN last_id:=(p_continuation->>'last_id')::bigint;current_id:=(p_continuation->>'next_id')::bigint;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid continuation ID range' USING ERRCODE='22023'; END;
 token_context:=p_continuation->'effective_context';
 IF jsonb_typeof(token_context) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid continuation context type' USING ERRCODE='22023'; END IF;
 context_kind:=token_context->>0;context_length:=jsonb_array_length(token_context);
 IF jsonb_typeof(token_context->0) IS DISTINCT FROM 'string' OR context_kind IS NULL OR context_kind NOT IN ('story','chapter','paragraph')
 OR context_length<>(CASE context_kind WHEN 'story' THEN 2 WHEN 'chapter' THEN 3 ELSE 4 END)
 OR jsonb_typeof(token_context->1) IS DISTINCT FROM 'string' OR (token_context->>1)!~'^[1-9][0-9]*$' THEN
 RAISE EXCEPTION 'Invalid continuation context shape' USING ERRCODE='22023'; END IF;
 BEGIN context_story_id:=(token_context->>1)::bigint;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid continuation story ID range' USING ERRCODE='22023'; END;
 FOR steps IN 2..context_length-1 LOOP
 IF jsonb_typeof(token_context->steps) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid continuation index type' USING ERRCODE='22023'; END IF;
 context_index:=(token_context->>steps)::numeric;
 IF context_index<0 OR context_index>2147483647 OR context_index<>trunc(context_index) THEN RAISE EXCEPTION 'Invalid continuation index range' USING ERRCODE='22023'; END IF;
 END LOOP;
 END IF;
 SELECT * INTO target FROM public.comments WHERE id=p_comment_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found','rows','[]'::jsonb,'root',NULL); END IF;
 effective:=(CASE WHEN target.scope='story' THEN jsonb_build_array('story',target.story_id::text) WHEN target.scope='chapter' THEN jsonb_build_array('chapter',target.story_id::text,target.chapter_index) WHEN target.scope='paragraph' OR target.scope IS NULL THEN jsonb_build_array('paragraph',target.story_id::text,target.chapter_index,target.paragraph_index) ELSE NULL END);
 IF NOT (target.story_id IS NOT NULL AND (target.scope='story' OR (target.scope='chapter' AND target.chapter_index>=0) OR ((target.scope='paragraph' OR target.scope IS NULL) AND target.chapter_index>=0 AND target.paragraph_index>=0))) IS TRUE THEN RETURN jsonb_build_object('status','context_mismatch','rows','[]'::jsonb,'root',NULL); END IF;
 seen:=ARRAY[p_comment_id];
 IF p_continuation IS NULL THEN
 current_row:=target;current_id:=target.parent_id;
 result_rows:=jsonb_build_array(jsonb_build_object('id',target.id::text,'paragraph_id',target.paragraph_id::text,'user_id',target.user_id,'content',target.content,'created_at',target.created_at,'edited_at',target.edited_at,'scope',target.scope,'story_id',target.story_id::text,'chapter_index',target.chapter_index,'paragraph_index',target.paragraph_index,'parent_id',target.parent_id::text,'reply_to_user_id',target.reply_to_user_id));
 ELSE
 SELECT * INTO boundary FROM public.comments WHERE id=last_id;
 IF NOT FOUND OR boundary.parent_id IS DISTINCT FROM current_id OR p_continuation->'effective_context' IS DISTINCT FROM effective OR (CASE WHEN boundary.scope='story' THEN jsonb_build_array('story',boundary.story_id::text) WHEN boundary.scope='chapter' THEN jsonb_build_array('chapter',boundary.story_id::text,boundary.chapter_index) WHEN boundary.scope='paragraph' OR boundary.scope IS NULL THEN jsonb_build_array('paragraph',boundary.story_id::text,boundary.chapter_index,boundary.paragraph_index) ELSE NULL END) IS DISTINCT FROM effective THEN
 RETURN jsonb_build_object('status','stale_path','rows','[]'::jsonb,'root',NULL); END IF;
 current_row:=boundary;seen:=array_append(seen,last_id);
 END IF;
 FOR steps IN 1..64 LOOP
 IF current_id IS NULL THEN EXIT; END IF;
 IF current_id=ANY(seen) THEN RETURN jsonb_build_object('status','cycle','rows',result_rows,'root',NULL,'continuation',NULL); END IF;
 SELECT * INTO current_row FROM public.comments WHERE id=current_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','ancestor_unavailable','rows',result_rows,'root',NULL,'continuation',NULL); END IF;
 IF NOT (current_row.story_id IS NOT NULL AND (current_row.scope='story' OR (current_row.scope='chapter' AND current_row.chapter_index>=0) OR ((current_row.scope='paragraph' OR current_row.scope IS NULL) AND current_row.chapter_index>=0 AND current_row.paragraph_index>=0))) IS TRUE OR (CASE WHEN current_row.scope='story' THEN jsonb_build_array('story',current_row.story_id::text) WHEN current_row.scope='chapter' THEN jsonb_build_array('chapter',current_row.story_id::text,current_row.chapter_index) WHEN current_row.scope='paragraph' OR current_row.scope IS NULL THEN jsonb_build_array('paragraph',current_row.story_id::text,current_row.chapter_index,current_row.paragraph_index) ELSE NULL END) IS DISTINCT FROM effective THEN RETURN jsonb_build_object('status','context_mismatch','rows',result_rows,'root',NULL,'continuation',NULL); END IF;
 seen:=array_append(seen,current_id); result_rows:=result_rows||jsonb_build_array(jsonb_build_object('id',current_row.id::text,'paragraph_id',current_row.paragraph_id::text,'user_id',current_row.user_id,'content',current_row.content,'created_at',current_row.created_at,'edited_at',current_row.edited_at,'scope',current_row.scope,'story_id',current_row.story_id::text,'chapter_index',current_row.chapter_index,'paragraph_index',current_row.paragraph_index,'parent_id',current_row.parent_id::text,'reply_to_user_id',current_row.reply_to_user_id));
 current_id:=current_row.parent_id;
 END LOOP;
 IF current_id IS NULL THEN RETURN jsonb_build_object('status','resolved','target_id',p_comment_id::text,'rows',result_rows,'root',jsonb_build_object('id',current_row.id::text,'story_id',current_row.story_id::text,'scope',current_row.scope,'chapter_index',current_row.chapter_index,'paragraph_index',current_row.paragraph_index),'effective_context',effective,'continuation',NULL); END IF;
 token:=jsonb_build_object('v',1,'target_id',p_comment_id::text,'last_id',current_row.id::text,'next_id',current_id::text,'effective_context',effective);
 RETURN jsonb_build_object('status','more','target_id',p_comment_id::text,'rows',result_rows,'root',NULL,'effective_context',effective,'continuation',token);
END;
$rpc$;
REVOKE ALL ON FUNCTION public.nca_story_comment_root_page(bigint,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nca_story_comment_root_page(bigint,bigint,bigint) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.nca_context_comment_root_page(text,bigint,integer,integer,integer,text,jsonb,integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nca_context_comment_root_page(text,bigint,integer,integer,integer,text,jsonb,integer,bigint) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.nca_comment_thread_page(bigint,jsonb,integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nca_comment_thread_page(bigint,jsonb,integer,bigint) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.nca_comment_target_path(bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nca_comment_target_path(bigint,jsonb) TO anon,authenticated;
COMMIT;
