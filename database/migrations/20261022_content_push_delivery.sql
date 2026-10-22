-- NEW content lane; no consumed installer is edited or rerun.
-- LOCAL candidate. Installation requires a controlled window excluding privileged
-- concurrent role/routine DDL. Structural guards are canonical REQUIRED shapes,
-- not a claimed recovered production fingerprint. Equivalent-but-different CHECK
-- trees fail closed and need source review; never bypass a failed guard.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SET LOCAL transaction_timeout='60s';
SET LOCAL idle_in_transaction_session_timeout='20s';
DO $guard$
DECLARE required pg_catalog.jsonb := '{"keys":[["stories","p",["id"],null,null,null],["chapters","p",["id"],null,null,null],["chapters","f",["story_id"],"public","stories",["id"]],["push_subscriptions","p",["id"],null,null,null],["push_subscriptions","f",["user_id"],"auth","users",["id"]],["push_preferences","p",["user_id"],null,null,null],["push_preferences","f",["user_id"],"auth","users",["id"]],["content_publication_clock","p",["id"],null,null,null],["content_publication_state","p",["id"],null,null,null],["content_publication_state","f",["story_id"],"public","stories",["id"]],["content_publication_state","f",["chapter_id"],"public","chapters",["id"]],["content_publications","p",["id"],null,null,null],["content_publications","f",["story_id"],"public","stories",["id"]],["content_publications","f",["chapter_id"],"public","chapters",["id"]],["push_content_events","p",["id"],null,null,null],["push_content_events","f",["publication_id","publication_origin"],"public","content_publications",["id","origin"]],["push_deliveries","p",["id"],null,null,null],["push_deliveries","f",["personal_notification_id"],"public","push_personal_events",["notification_id"]],["push_deliveries","f",["content_event_id"],"public","push_content_events",["id"]],["push_deliveries","f",["subscription_id"],"public","push_subscriptions",["id"]]],"checks":[["content_publication_clock","check","7a2a90d032730f8501dc51710b08186b"],["content_publication_clock","check","05cdf3570fa62aa5ff73c973f3012eb1"],["content_publication_state","check","01714794c479492bd6a53634e9b83326"],["content_publication_state","check","ec7174c0d887657d8e418aa565341806"],["content_publication_state","check","b83d340a3bf29f88431c5abf7092234c"],["content_publication_state","check","8471b835b4c3961273b5353b8faf13aa"],["push_content_events","check","b634c31b56e460e7d876fa6eae0ef65b"],["push_content_events","check","a393f3d3d6fe9832a7199b5f0a2b6047"],["push_content_events","check","195d6059c168f42e9dda3bea2399403a"],["push_content_events","check","20eac0e264a8ce68f6f19e713d60f5c0"],["push_content_events","generated_origin","77a7fc2a2f1ae5368942cb9e57c132cc"],["content_publications","check","01714794c479492bd6a53634e9b83326"],["content_publications","check","9c603e8249311c5b9a1557f53b8e6819"],["content_publications","check","8471b835b4c3961273b5353b8faf13aa"],["content_publications","check","4d244c0394485df884ebf8c4c2a84867"],["push_subscriptions","check","32c217deddf81a02b5b63168c0294292"],["push_subscriptions","check","0a3d4e8c5ea589a6cf13c95f64a43427"],["push_subscriptions","check","101922c7f9fe8729bb6a39b58788c074"],["push_subscriptions","check","e61d1933976aa71f604212226e6314f2"],["push_subscriptions","check","f9a8b051e382d7cc8466b93245baaa69"],["push_subscriptions","check","e7446ef3380f5567afc0c03d62bfa385"],["push_subscriptions","check","78f0173e820ce415c763759a3a3b69cd"],["push_subscriptions","check","a4e6fa47f8e2a3aa532534f36089b9de"],["push_subscriptions","check","22727c6dbf7b64987e55b626035f32e9"],["push_subscriptions","check","b99a14d07e2581bc5d94341360155a56"],["push_deliveries","check","8a1ae528f0b8c3ec51d7a0cf1912bbdf"],["push_deliveries","check","db858ce72cc9bf55c4d3d70f54d1b138"],["push_deliveries","check","5650086a624e7b546edbc462f82602f7"],["push_deliveries","check","afd4d22e3f0d702afbb06a8ef2454916"],["push_deliveries","check","94b7226d67ea11796cf5a2c9eb163ba4"],["push_deliveries","check","50413c536f82c68feb9e8cac752d1877"],["push_deliveries","check","d69d0da9a48dbaac9acfb2c0d62eb056"],["push_deliveries","check","157afb522872f4a20b74c80543f74653"],["push_preferences","check","9eb5e5f3646758249a81e65d92c9aaa1"],["push_preferences","check","19908229a458f34817950aa89b5b9d9b"],["push_preferences","check","6a447d43ba2b15dc3659a34342986844"],["push_preferences","check","d0dfde05cef009db0bf559637f77f3b5"],["push_preferences","check","9afece9bffae87f05886c81cef27700a"],["push_preferences","check","9560b9ab85069f2592f7a2e8db3f7dd6"],["push_preferences","check","e7211dddbbb8b322a985c8c9d5b5bec3"],["push_preferences","check","c78bf73b84a0cb0e17e1c45d403c0156"],["push_preferences","check","bfcbcd18113c90a819dd7067ce34e903"],["push_preferences","check","2fe580d86d0a208af86581024afd0ba4"],["push_preferences","check","294cca3b1f1ba605c08bc0761327767b"],["push_preferences","check","7d312628af98bbd807ae536fe95284e1"],["push_preferences","check","9867e2a437a1bd976ced8693f99a1511"],["push_preferences","check","61df2a5a6be1124c31951ccf4539747a"]],"columns":[["stories","id","20",-1,true,"",""],["stories","title","25",-1,true,"",""],["stories","published","16",-1,true,"",""],["stories","created_at","1184",-1,true,"",""],["stories","updated_at","1184",-1,true,"",""],["chapters","id","20",-1,true,"",""],["chapters","story_id","20",-1,true,"",""],["chapters","chapter_number","23",-1,true,"",""],["chapters","title","25",-1,true,"",""],["chapters","published","16",-1,true,"",""],["chapters","created_at","1184",-1,true,"",""],["chapters","updated_at","1184",-1,true,"",""],["content_publication_clock","id","21",-1,true,"",""],["content_publication_clock","frontier","20",-1,true,"",""],["content_publication_state","id","2950",-1,true,"",""],["content_publication_state","kind","25",-1,true,"",""],["content_publication_state","story_id","20",-1,true,"",""],["content_publication_state","chapter_id","20",-1,false,"",""],["content_publication_state","draft_revision","20",-1,true,"",""],["content_publication_state","publication_revision","20",-1,true,"",""],["content_publication_state","first_publication_recorded","16",-1,true,"",""],["content_publication_state","draft_payload","3802",-1,false,"",""],["content_publication_state","updated_at","1184",-1,true,"",""],["push_preferences","user_id","2950",-1,true,"",""],["push_preferences","comment_enabled","16",-1,true,"",""],["push_preferences","comment_enabled_since","1184",-1,false,"",""],["push_preferences","reply_enabled","16",-1,true,"",""],["push_preferences","reply_enabled_since","1184",-1,false,"",""],["push_preferences","mention_enabled","16",-1,true,"",""],["push_preferences","mention_enabled_since","1184",-1,false,"",""],["push_preferences","comment_like_enabled","16",-1,true,"",""],["push_preferences","comment_like_enabled_since","1184",-1,false,"",""],["push_preferences","new_story_enabled","16",-1,true,"",""],["push_preferences","new_story_enabled_since","1184",-1,false,"",""],["push_preferences","new_chapter_enabled","16",-1,true,"",""],["push_preferences","new_chapter_enabled_since","1184",-1,false,"",""],["push_preferences","revision","20",-1,true,"",""],["push_preferences","updated_at","1184",-1,true,"",""],["push_subscriptions","id","2950",-1,true,"",""],["push_subscriptions","user_id","2950",-1,false,"",""],["push_subscriptions","endpoint","25",-1,false,"",""],["push_subscriptions","p256dh","25",-1,false,"",""],["push_subscriptions","auth","25",-1,false,"",""],["push_subscriptions","device_secret_hash","17",-1,true,"",""],["push_subscriptions","binding_id","2950",-1,true,"",""],["push_subscriptions","binding_version","20",-1,true,"",""],["push_subscriptions","state","25",-1,true,"",""],["push_subscriptions","activated_at","1184",-1,false,"",""],["push_subscriptions","created_at","1184",-1,true,"",""],["push_subscriptions","updated_at","1184",-1,true,"",""],["push_subscriptions","disabled_at","1184",-1,false,"",""],["content_publications","id","20",-1,true,"a",""],["content_publications","kind","25",-1,true,"",""],["content_publications","story_id","20",-1,true,"",""],["content_publications","chapter_id","20",-1,false,"",""],["content_publications","publication_revision","20",-1,true,"",""],["content_publications","origin","25",-1,true,"",""],["content_publications","catalog_sequence","20",-1,false,"",""],["content_publications","occurred_at","1184",-1,false,"",""],["content_publications","request_id","2950",-1,false,"",""],["content_publications","request_hash","17",-1,false,"",""],["push_content_events","id","20",-1,true,"a",""],["push_content_events","publication_id","20",-1,true,"",""],["push_content_events","publication_origin","25",-1,false,"","s"],["push_content_events","created_at","1184",-1,true,"",""],["push_content_events","expires_at","1184",-1,true,"",""],["push_content_events","fanout_after","2950",-1,false,"",""],["push_content_events","fanout_complete","16",-1,true,"",""],["push_content_events","fanout_lease_token","2950",-1,false,"",""],["push_content_events","fanout_lease_until","1184",-1,false,"",""],["push_deliveries","id","2950",-1,true,"",""],["push_deliveries","personal_notification_id","20",-1,false,"",""],["push_deliveries","content_event_id","20",-1,false,"",""],["push_deliveries","subscription_id","2950",-1,true,"",""],["push_deliveries","captured_binding_id","2950",-1,true,"",""],["push_deliveries","captured_binding_version","20",-1,true,"",""],["push_deliveries","status","25",-1,true,"",""],["push_deliveries","attempts","23",-1,true,"",""],["push_deliveries","next_attempt_at","1184",-1,true,"",""],["push_deliveries","lease_until","1184",-1,false,"",""],["push_deliveries","lease_token","2950",-1,false,"",""],["push_deliveries","last_error_code","25",-1,false,"",""],["push_deliveries","created_at","1184",-1,true,"",""],["push_deliveries","updated_at","1184",-1,true,"",""]],"indexes":[["stories",["id"],true,true,[["pg_catalog","int8_ops"]],["0"],[0],null],["chapters",["id"],true,true,[["pg_catalog","int8_ops"]],["0"],[0],null],["chapters",["story_id","chapter_number"],true,false,[["pg_catalog","int8_ops"],["pg_catalog","int4_ops"]],["0","0"],[0,0],null],["push_subscriptions",["id"],true,true,[["pg_catalog","uuid_ops"]],["0"],[0],null],["push_subscriptions",["endpoint"],true,false,[["pg_catalog","text_ops"]],["100"],[0],null],["push_subscriptions",["user_id","id"],false,false,[["pg_catalog","uuid_ops"],["pg_catalog","uuid_ops"]],["0","0"],[0,0],null],["push_preferences",["user_id"],true,true,[["pg_catalog","uuid_ops"]],["0"],[0],null],["content_publication_clock",["id"],true,true,[["pg_catalog","int2_ops"]],["0"],[0],null],["content_publication_state",["id"],true,true,[["pg_catalog","uuid_ops"]],["0"],[0],null],["content_publication_state",["story_id"],true,false,[["pg_catalog","int8_ops"]],["0"],[0],"6e4bf80e540d62401e0a5b4dfbcdb3f4"],["content_publication_state",["chapter_id"],true,false,[["pg_catalog","int8_ops"]],["0"],[0],"80e5775a52409d580022f0bc6b6090a6"],["content_publications",["id"],true,true,[["pg_catalog","int8_ops"]],["0"],[0],null],["content_publications",["catalog_sequence"],true,false,[["pg_catalog","int8_ops"]],["0"],[0],null],["content_publications",["request_id"],true,false,[["pg_catalog","uuid_ops"]],["0"],[0],null],["content_publications",["id","origin"],true,false,[["pg_catalog","int8_ops"],["pg_catalog","text_ops"]],["0","100"],[0,0],null],["content_publications",["story_id","publication_revision"],true,false,[["pg_catalog","int8_ops"],["pg_catalog","int8_ops"]],["0","0"],[0,0],"6e4bf80e540d62401e0a5b4dfbcdb3f4"],["content_publications",["chapter_id","publication_revision"],true,false,[["pg_catalog","int8_ops"],["pg_catalog","int8_ops"]],["0","0"],[0,0],"80e5775a52409d580022f0bc6b6090a6"],["push_content_events",["id"],true,true,[["pg_catalog","int8_ops"]],["0"],[0],null],["push_content_events",["publication_id"],true,false,[["pg_catalog","int8_ops"]],["0"],[0],null],["push_content_events",["fanout_complete","fanout_lease_until","id"],false,false,[["pg_catalog","bool_ops"],["pg_catalog","timestamptz_ops"],["pg_catalog","int8_ops"]],["0","0","0"],[0,0,0],null],["push_deliveries",["id"],true,true,[["pg_catalog","uuid_ops"]],["0"],[0],null],["push_deliveries",["personal_notification_id","subscription_id"],true,false,[["pg_catalog","int8_ops"],["pg_catalog","uuid_ops"]],["0","0"],[0,0],"fdbea307e435b76f328d173c2c88b8de"],["push_deliveries",["content_event_id","subscription_id"],true,false,[["pg_catalog","int8_ops"],["pg_catalog","uuid_ops"]],["0","0"],[0,0],"8a09ecdb3547e64dd3afeaf39f42d1c9"],["push_deliveries",["status","next_attempt_at","id"],false,false,[["pg_catalog","text_ops"],["pg_catalog","timestamptz_ops"],["pg_catalog","uuid_ops"]],["100","0","0"],[0,0,0],null],["push_deliveries",["lease_until","id"],false,false,[["pg_catalog","timestamptz_ops"],["pg_catalog","uuid_ops"]],["0","0"],[0,0],"160c126c7d8adf5a154465fc9a092c6e"]]}';
 actual pg_catalog.jsonb; item pg_catalog.jsonb; guard_row record; installer pg_catalog.oid;
BEGIN
 SELECT oid INTO installer FROM pg_catalog.pg_roles WHERE rolname='postgres' AND (rolsuper OR rolbypassrls);
 IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres' OR installer IS NULL
 OR pg_catalog.current_setting('server_version_num')<>'170011' THEN RAISE EXCEPTION 'NCA_CONTENT_CONTEXT'; END IF;
 LOCK TABLE public.stories,public.chapters,public.content_publication_clock,
  public.content_publication_state,public.content_publications,public.push_content_events,
  public.push_preferences,public.push_subscriptions,public.push_deliveries IN SHARE ROW EXCLUSIVE MODE;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('stories','chapters','content_publication_clock','content_publication_state',
 'content_publications','push_content_events','push_preferences','push_subscriptions','push_deliveries')
 AND c.relkind='r' AND c.relowner=installer AND c.relrowsecurity
 AND c.relforcerowsecurity=(c.relname NOT IN ('stories','chapters')) AND NOT c.relispartition)<>9
 THEN RAISE EXCEPTION 'NCA_CONTENT_RELATIONS'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i JOIN pg_catalog.pg_class c ON c.oid IN(i.inhrelid,i.inhparent)
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN
  ('stories','chapters','content_publication_clock','content_publication_state','content_publications','push_content_events',
   'push_preferences','push_subscriptions','push_deliveries'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname IN
  ('stories','chapters','content_publication_clock','content_publication_state','content_publications','push_content_events',
   'push_preferences','push_subscriptions','push_deliveries'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid=w.ev_class
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN
  ('stories','chapters','content_publication_clock','content_publication_state','content_publications','push_content_events',
   'push_preferences','push_subscriptions','push_deliveries'))
 THEN RAISE EXCEPTION 'NCA_CONTENT_UNSUPPORTED_TOPOLOGY'; END IF;
 -- Raw catalog trees only. Attribute references normalize to column names so
 -- extra presentation columns/physical attnums cannot manufacture a match.
 -- STRUCTURAL_FACTS_BEGIN
 WITH RECURSIVE rels AS (
  SELECT c.oid,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('stories','chapters','content_publication_clock','content_publication_state',
   'content_publications','push_content_events','push_preferences','push_subscriptions','push_deliveries')
 ), attrs AS (
  SELECT a.attrelid,pg_catalog.array_agg(a.attnum ORDER BY a.attnum) AS nums,
   pg_catalog.array_agg(a.attname::pg_catalog.text ORDER BY a.attnum) AS names
  FROM pg_catalog.pg_attribute a JOIN rels r ON r.oid=a.attrelid WHERE a.attnum>0 AND NOT a.attisdropped GROUP BY a.attrelid
 ), raw_nodes AS (
  SELECT k.oid,k.conrelid AS relid,'check'::pg_catalog.text AS scope,k.conbin::pg_catalog.text AS node
  FROM pg_catalog.pg_constraint k JOIN rels r ON r.oid=k.conrelid
  WHERE k.contype='c' AND k.convalidated AND NOT k.condeferrable AND NOT k.condeferred
  UNION ALL SELECT i.indexrelid,i.indrelid,'predicate',i.indpred::pg_catalog.text
  FROM pg_catalog.pg_index i JOIN rels r ON r.oid=i.indrelid WHERE i.indpred IS NOT NULL
  UNION ALL SELECT d.oid,d.adrelid,'generated_origin',d.adbin::pg_catalog.text
  FROM pg_catalog.pg_attrdef d JOIN rels r ON r.oid=d.adrelid JOIN pg_catalog.pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
  WHERE r.relname='push_content_events' AND a.attname='publication_origin' AND a.attgenerated='s'
 ), nodes(oid,relid,scope,step,node) AS (
  SELECT oid,relid,scope,1,pg_catalog.regexp_replace(node,':location -?[0-9]+',':location -1','g') FROM raw_nodes
  UNION ALL SELECT x.oid,x.relid,x.scope,x.step+1,
   pg_catalog.replace(pg_catalog.replace(x.node,':varattno '||a.nums[x.step]||' ',':varattno '||a.names[x.step]||' '),
    ':varattnosyn '||a.nums[x.step]||' ',':varattnosyn '||a.names[x.step]||' ')
  FROM nodes x JOIN attrs a ON a.attrelid=x.relid WHERE x.step<=pg_catalog.cardinality(a.nums)
 ), norm AS (
  SELECT x.* FROM nodes x JOIN attrs a ON a.attrelid=x.relid WHERE x.step>pg_catalog.cardinality(a.nums)
 ), columns AS (
  SELECT pg_catalog.jsonb_build_array(r.relname,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated) AS j
  FROM rels r JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid WHERE a.attnum>0 AND NOT a.attisdropped
 ), checks AS (
  SELECT pg_catalog.jsonb_build_array(r.relname,x.scope,pg_catalog.md5(x.node)) AS j FROM norm x JOIN rels r ON r.oid=x.relid
  WHERE x.scope IN ('check','generated_origin')
 ), keys AS (
  SELECT pg_catalog.jsonb_build_array(r.relname,k.contype,
   (SELECT pg_catalog.jsonb_agg(a.attname ORDER BY v.ord) FROM pg_catalog.unnest(k.conkey) WITH ORDINALITY v(num,ord)
    JOIN pg_catalog.pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=v.num),
   n.nspname,c.relname,
   (SELECT pg_catalog.jsonb_agg(a.attname ORDER BY v.ord) FROM pg_catalog.unnest(k.confkey) WITH ORDINALITY v(num,ord)
    JOIN pg_catalog.pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=v.num)) AS j
  FROM rels r JOIN pg_catalog.pg_constraint k ON k.conrelid=r.oid
  LEFT JOIN pg_catalog.pg_class c ON c.oid=k.confrelid LEFT JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE k.contype IN ('p','f') AND k.convalidated AND NOT k.condeferrable AND NOT k.condeferred
 ), indexes AS (
  SELECT pg_catalog.jsonb_build_array(r.relname,
   (SELECT pg_catalog.jsonb_agg(a.attname ORDER BY v.ord) FROM pg_catalog.unnest(i.indkey::pg_catalog.int2[]) WITH ORDINALITY v(num,ord)
    JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=v.num),i.indisunique,i.indisprimary,
   (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.nspname,o.opcname) ORDER BY v.ord)
    FROM pg_catalog.unnest(i.indclass::pg_catalog.oid[]) WITH ORDINALITY v(num,ord)
    JOIN pg_catalog.pg_opclass o ON o.oid=v.num JOIN pg_catalog.pg_namespace n ON n.oid=o.opcnamespace),
   i.indcollation::pg_catalog.oid[],i.indoption::pg_catalog.int2[],pg_catalog.md5(x.node)) AS j
  FROM rels r JOIN pg_catalog.pg_index i ON i.indrelid=r.oid JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
  LEFT JOIN norm x ON x.oid=i.indexrelid AND x.scope='predicate'
  WHERE c.relam=403 AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate
   AND i.indexprs IS NULL AND NOT i.indnullsnotdistinct AND i.indnatts=i.indnkeyatts
 )
 SELECT pg_catalog.jsonb_build_object('columns',(SELECT pg_catalog.jsonb_agg(j) FROM columns),
  'checks',(SELECT pg_catalog.jsonb_agg(j) FROM checks),'keys',(SELECT pg_catalog.jsonb_agg(j) FROM keys),
  'indexes',(SELECT pg_catalog.jsonb_agg(j) FROM indexes)) INTO actual;
 -- STRUCTURAL_FACTS_END
 FOR guard_row IN SELECT * FROM pg_catalog.jsonb_each(required) LOOP
  FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(guard_row.value) LOOP
   -- Array containment is unordered recursively; it is NOT a positional record
   -- comparison (for example a reversed FK can contain the same elements).
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(actual->guard_row.key) AS observed(value) WHERE observed.value=item)
   THEN RAISE EXCEPTION 'NCA_CONTENT_FOUNDATION_%',guard_row.key; END IF;
  END LOOP;
 END LOOP;
 FOR guard_row IN SELECT * FROM pg_catalog.pg_roles WHERE rolname IN ('nca_push_sender','nca_push_fanout') LOOP
  IF guard_row.rolsuper OR guard_row.rolbypassrls OR guard_row.rolcreaterole OR guard_row.rolcreatedb OR guard_row.rolreplication OR guard_row.rolinherit
  OR guard_row.rolcanlogin<>(guard_row.rolname='nca_push_sender')
  OR NOT pg_catalog.has_schema_privilege(guard_row.oid,'public','USAGE') OR pg_catalog.has_schema_privilege(guard_row.oid,'public','CREATE')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=guard_row.oid)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.roleid=guard_row.oid AND m.member<>installer)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('stories','chapters','content_publication_clock','content_publication_state',
    'content_publications','push_content_events','push_preferences','push_subscriptions','push_deliveries')
   AND (pg_catalog.has_table_privilege(guard_row.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_any_column_privilege(guard_row.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
  THEN RAISE EXCEPTION 'NCA_CONTENT_ROLE_AUTHORITY'; END IF;
 END LOOP;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('nca_push_sender','nca_push_fanout','nca_push_api','anon','authenticated','service_role'))<>6
 THEN RAISE EXCEPTION 'NCA_CONTENT_ROLES_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('nca_capture_content_first_publication','nca_claim_content_push_events',
   'nca_fanout_content_push_event_page','nca_claim_content_push_deliveries','nca_prepare_content_push_delivery','nca_finish_content_push_delivery'))
 THEN RAISE EXCEPTION 'NCA_CONTENT_COLLISION'; END IF;
 FOR guard_row IN SELECT p.* FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('nca_claim_personal_push_deliveries','nca_prepare_personal_push_delivery','nca_finish_personal_push_delivery') LOOP
  IF guard_row.proowner<>installer OR NOT guard_row.prosecdef OR guard_row.prorettype<>3802 OR guard_row.proretset OR guard_row.provolatile<>'v'
  OR guard_row.proconfig IS DISTINCT FROM ARRAY['search_path=""','lock_timeout=2s','statement_timeout=5s']
  OR pg_catalog.to_jsonb(guard_row.proargtypes::pg_catalog.oid[]::pg_catalog.int4[]) IS DISTINCT FROM
   ('{"nca_claim_personal_push_deliveries":[23],"nca_prepare_personal_push_delivery":[2950,2950],"nca_finish_personal_push_delivery":[2950,2950,25]}'::pg_catalog.jsonb->guard_row.proname)
  OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(guard_row.proacl,pg_catalog.acldefault('f',guard_row.proowner))) a
   WHERE a.grantee NOT IN(installer,(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='nca_push_sender')) OR a.is_grantable)
  OR NOT pg_catalog.has_function_privilege('nca_push_sender',guard_row.oid,'EXECUTE') THEN RAISE EXCEPTION 'NCA_CONTENT_PERSONAL_BOUNDARY'; END IF;
 END LOOP;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('nca_claim_personal_push_deliveries','nca_prepare_personal_push_delivery','nca_finish_personal_push_delivery'))<>3
 THEN RAISE EXCEPTION 'NCA_CONTENT_PERSONAL_BOUNDARY'; END IF;
END;
$guard$;

CREATE FUNCTION public.nca_capture_content_first_publication() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'
AS $fn$
DECLARE kind_at pg_catalog.text; story_at pg_catalog.int8; chapter_at pg_catalog.int8;
 state_at public.content_publication_state%ROWTYPE; frontier_at pg_catalog.int8;
 publication_at pg_catalog.int8; time_at pg_catalog.timestamptz; request_at pg_catalog.uuid;
 unknown_history pg_catalog.bool;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_NARGS<>0 OR TG_OP NOT IN ('INSERT','UPDATE')
 OR TG_TABLE_NAME NOT IN ('stories','chapters') THEN RAISE EXCEPTION 'NCA_CONTENT_TRIGGER_CONTEXT'; END IF;
 IF TG_TABLE_NAME='stories' THEN kind_at:='new_story'; story_at:=NEW.id; chapter_at:=NULL;
 ELSE
  kind_at:='new_chapter'; story_at:=NEW.story_id; chapter_at:=NEW.id;
  -- A concurrent parent DELETE may already wait for this chapter row. Never
  -- block back on that parent when the publication FK is inserted below.
  PERFORM 1 FROM public.stories WHERE id=story_at FOR KEY SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'NCA_CONTENT_PARENT_MISSING'; END IF;
 END IF;
 -- A pre-existing row without state has unknown history: suppress, never guess.
 unknown_history:=TG_OP='UPDATE';
 IF kind_at='new_story' THEN
  INSERT INTO public.content_publication_state(id,kind,story_id,chapter_id,draft_revision,publication_revision,first_publication_recorded,updated_at)
  VALUES(pg_catalog.gen_random_uuid(),kind_at,story_at,NULL,0,0,unknown_history,pg_catalog.clock_timestamp())
  ON CONFLICT(story_id) WHERE kind='new_story' DO NOTHING;
  SELECT * INTO state_at FROM public.content_publication_state WHERE kind=kind_at AND story_id=story_at FOR UPDATE;
 ELSE
  INSERT INTO public.content_publication_state(id,kind,story_id,chapter_id,draft_revision,publication_revision,first_publication_recorded,updated_at)
  VALUES(pg_catalog.gen_random_uuid(),kind_at,story_at,chapter_at,0,0,unknown_history,pg_catalog.clock_timestamp())
  ON CONFLICT(chapter_id) WHERE kind='new_chapter' DO NOTHING;
  SELECT * INTO state_at FROM public.content_publication_state WHERE kind=kind_at AND chapter_id=chapter_at FOR UPDATE;
 END IF;
 IF state_at.id IS NULL OR state_at.story_id IS DISTINCT FROM story_at THEN RAISE EXCEPTION 'NCA_CONTENT_STATE_MISMATCH'; END IF;
 IF state_at.first_publication_recorded THEN RETURN NEW; END IF;
 IF (TG_OP='UPDATE' AND OLD.published IS TRUE) OR EXISTS(SELECT 1 FROM public.content_publications p
  WHERE p.kind=kind_at AND ((kind_at='new_story' AND p.story_id=story_at) OR (kind_at='new_chapter' AND p.chapter_id=chapter_at))) THEN
  UPDATE public.content_publication_state SET first_publication_recorded=true,updated_at=pg_catalog.clock_timestamp() WHERE id=state_at.id;
  RETURN NEW;
 END IF;
 IF NEW.published IS NOT TRUE OR (TG_OP='UPDATE' AND OLD.published IS NOT DISTINCT FROM NEW.published) THEN RETURN NEW; END IF;
 -- State -> clock. Preference enabling also serializes on this clock BEFORE
 -- choosing enabled_since; capture never takes a preference/subscription lock.
 SELECT frontier INTO frontier_at FROM public.content_publication_clock WHERE id=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='NCA_PUBLICATION_CLOCK_MISSING'; END IF;
 IF frontier_at<0 OR frontier_at>=9223372036854775807 OR state_at.publication_revision>=9223372036854775807
 THEN RAISE EXCEPTION USING ERRCODE='22003',MESSAGE='NCA_CONTENT_CLOCK_EXHAUSTED'; END IF;
 frontier_at:=frontier_at+1; time_at:=pg_catalog.clock_timestamp(); request_at:=pg_catalog.gen_random_uuid();
 UPDATE public.content_publication_clock SET frontier=frontier_at WHERE id=1;
 UPDATE public.content_publication_state SET first_publication_recorded=true,publication_revision=publication_revision+1,updated_at=time_at WHERE id=state_at.id;
 INSERT INTO public.content_publications(kind,story_id,chapter_id,publication_revision,origin,catalog_sequence,occurred_at,request_id,request_hash)
 VALUES(kind_at,story_at,chapter_at,state_at.publication_revision+1,'genuine',frontier_at,time_at,request_at,
  pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(kind_at,story_at,chapter_at,frontier_at,time_at,request_at)::pg_catalog.text,'UTF8')))
 RETURNING id INTO publication_at;
 INSERT INTO public.push_content_events(publication_id,created_at,expires_at,fanout_complete)
 VALUES(publication_at,time_at,time_at+INTERVAL '24 hours',false);
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER nca_content_story_first_publication AFTER INSERT OR UPDATE ON public.stories
 FOR EACH ROW EXECUTE FUNCTION public.nca_capture_content_first_publication();
CREATE TRIGGER nca_content_chapter_first_publication AFTER INSERT OR UPDATE ON public.chapters
 FOR EACH ROW EXECUTE FUNCTION public.nca_capture_content_first_publication();

CREATE FUNCTION public.nca_claim_content_push_events(p_limit integer) RETURNS pg_catalog.jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'
AS $fn$
DECLARE result pg_catalog.jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NCA_CONTENT_LIMIT'; END IF;
 WITH candidates AS MATERIALIZED (
  SELECT e.id FROM public.push_content_events e WHERE NOT e.fanout_complete AND e.expires_at>pg_catalog.clock_timestamp()
   AND (e.fanout_lease_until IS NULL OR e.fanout_lease_until<=pg_catalog.clock_timestamp())
  ORDER BY e.id LIMIT p_limit FOR UPDATE OF e SKIP LOCKED
 ), claimed AS (
  UPDATE public.push_content_events e SET fanout_lease_token=pg_catalog.gen_random_uuid(),fanout_lease_until=pg_catalog.clock_timestamp()+INTERVAL '120 seconds'
  FROM candidates c WHERE e.id=c.id RETURNING e.id,e.fanout_lease_token,e.fanout_lease_until
 ) SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('event_id',id::pg_catalog.text,
  'lease_token',fanout_lease_token,'lease_until',fanout_lease_until) ORDER BY id),'[]'::pg_catalog.jsonb) INTO result FROM claimed;
 RETURN pg_catalog.jsonb_build_object('status','ok','events',result);
END;
$fn$;

CREATE FUNCTION public.nca_fanout_content_push_event_page(p_event_id bigint,p_lease_token uuid,p_limit integer) RETURNS pg_catalog.jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'
AS $fn$
DECLARE e public.push_content_events%ROWTYPE; p public.content_publications%ROWTYPE;
 pref public.push_preferences%ROWTYPE; s public.push_subscriptions%ROWTYPE; locator record;
 enabled pg_catalog.bool; since_at pg_catalog.timestamptz; now_at pg_catalog.timestamptz;
 cursor_id pg_catalog.uuid; scanned pg_catalog.int4:=0; inserted pg_catalog.int4:=0; affected pg_catalog.int4;
 more pg_catalog.bool:=false; reason pg_catalog.text:='ok';
BEGIN
 IF p_event_id IS NULL OR p_event_id<1 OR p_lease_token IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>100
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NCA_CONTENT_ARGUMENT'; END IF;
 SELECT * INTO e FROM public.push_content_events WHERE id=p_event_id;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone','inserted',0); END IF;
 -- Publication -> event -> preference -> subscription -> delivery (FK order).
 SELECT * INTO p FROM public.content_publications WHERE id=e.publication_id FOR SHARE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone','inserted',0); END IF;
 SELECT * INTO e FROM public.push_content_events WHERE id=p_event_id FOR UPDATE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone','inserted',0); END IF;
 IF e.fanout_lease_token IS DISTINCT FROM p_lease_token OR e.fanout_complete OR e.fanout_lease_until IS NULL OR e.fanout_lease_until<=pg_catalog.clock_timestamp()
 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_CONTENT_FANOUT_LEASE_CONFLICT'; END IF;
 cursor_id:=e.fanout_after;
 IF p.id IS DISTINCT FROM e.publication_id OR p.origin<>'genuine' OR p.kind NOT IN ('new_story','new_chapter') OR p.occurred_at IS NULL THEN reason:='source_mismatch';
 ELSIF e.expires_at<=pg_catalog.clock_timestamp() THEN reason:='expired'; END IF;
 IF reason='ok' THEN
  -- Walk all installation IDs, including inactive/unbound rows, for a bounded
  -- global UUID keyset. This initial locator read grants no delivery authority.
  FOR locator IN SELECT id,user_id FROM public.push_subscriptions WHERE e.fanout_after IS NULL OR id>e.fanout_after ORDER BY id LIMIT (p_limit+1) LOOP
   IF scanned=p_limit THEN more:=true; EXIT; END IF;
   scanned:=scanned+1; cursor_id:=locator.id;
   SELECT * INTO pref FROM public.push_preferences WHERE user_id=locator.user_id FOR SHARE;
   -- Account DELETE may already hold subscription while waiting for preference.
   -- Never wait back on that row: busy aborts/rolls back this page, no retry.
   SELECT * INTO s FROM public.push_subscriptions WHERE id=locator.id FOR SHARE NOWAIT;
   enabled:=CASE p.kind WHEN 'new_story' THEN pref.new_story_enabled WHEN 'new_chapter' THEN pref.new_chapter_enabled ELSE false END;
   since_at:=CASE p.kind WHEN 'new_story' THEN pref.new_story_enabled_since WHEN 'new_chapter' THEN pref.new_chapter_enabled_since END;
   now_at:=pg_catalog.clock_timestamp();
   IF e.fanout_lease_until<=now_at OR e.expires_at<=now_at THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_CONTENT_FANOUT_EXPIRED'; END IF;
   IF s.id IS NOT NULL AND s.user_id IS NOT NULL AND s.user_id IS NOT DISTINCT FROM locator.user_id AND s.user_id IS NOT DISTINCT FROM pref.user_id
   AND enabled IS TRUE AND since_at IS NOT NULL AND since_at<=p.occurred_at AND s.state='active'
   AND s.activated_at IS NOT NULL AND s.activated_at<=p.occurred_at AND s.endpoint IS NOT NULL AND s.p256dh IS NOT NULL AND s.auth IS NOT NULL THEN
    INSERT INTO public.push_deliveries(id,personal_notification_id,content_event_id,subscription_id,captured_binding_id,captured_binding_version,
     status,attempts,next_attempt_at,lease_until,lease_token,last_error_code,created_at,updated_at)
    VALUES(pg_catalog.gen_random_uuid(),NULL,e.id,s.id,s.binding_id,s.binding_version,'pending',0,now_at,NULL,NULL,NULL,now_at,now_at)
    ON CONFLICT(content_event_id,subscription_id) WHERE content_event_id IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS affected=ROW_COUNT; inserted:=inserted+affected;
   END IF;
  END LOOP;
 END IF;
 IF e.fanout_lease_until<=pg_catalog.clock_timestamp() OR (reason='ok' AND e.expires_at<=pg_catalog.clock_timestamp())
 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_CONTENT_FANOUT_EXPIRED'; END IF;
 UPDATE public.push_content_events SET fanout_after=cursor_id,fanout_complete=NOT more,
  fanout_lease_token=CASE WHEN more THEN p_lease_token ELSE NULL END,fanout_lease_until=CASE WHEN more THEN e.fanout_lease_until ELSE NULL END WHERE id=e.id;
 RETURN pg_catalog.jsonb_build_object('status',reason,'scanned',scanned,'inserted',inserted,'has_more',more,'after',cursor_id,'complete',NOT more);
END;
$fn$;

-- CONTENT_SENDER_ROUTINES
CREATE FUNCTION public.nca_finish_content_push_delivery(p_delivery_id uuid,p_lease_token uuid,p_outcome text) RETURNS pg_catalog.jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'
AS $fn$
DECLARE
 d public.push_deliveries%ROWTYPE;
 s public.push_subscriptions%ROWTYPE;
 now_at pg_catalog.timestamptz;
 next_status pg_catalog.text;
 error_code pg_catalog.text;
BEGIN
 IF p_delivery_id IS NULL OR p_lease_token IS NULL OR p_outcome IS NULL
 OR p_outcome NOT IN ('sent','transient','network','invalid_subscription','malformed_subscription') THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NCA_SENDER_ARGUMENT'; END IF;
 SELECT * INTO d FROM public.push_deliveries WHERE id=p_delivery_id;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 IF d.personal_notification_id IS NOT NULL OR d.content_event_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_SENDER_NOT_CONTENT'; END IF;
 -- Consistent subscription-before-delivery locking. Never invalidate a replacement.
 SELECT * INTO s FROM public.push_subscriptions WHERE id=d.subscription_id FOR UPDATE;
 SELECT * INTO d FROM public.push_deliveries WHERE id=p_delivery_id FOR UPDATE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 -- Terminal repeats are effect-idempotent only: no token replay receipt is stored.
 -- This no-op does NOT attest that the caller's prior network attempt succeeded.
 IF d.status IN ('sent','cancelled','failed') THEN
  RETURN pg_catalog.jsonb_build_object('status','already_terminal'); END IF;
 now_at:=pg_catalog.clock_timestamp();
 IF d.status<>'leased' OR d.lease_token IS DISTINCT FROM p_lease_token
 OR d.lease_until IS NULL OR d.lease_until<=now_at THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_SENDER_LEASE_CONFLICT'; END IF;
 next_status:=CASE WHEN p_outcome='sent' THEN 'sent'
  WHEN p_outcome IN ('invalid_subscription','malformed_subscription') OR d.attempts>=6 THEN 'failed' ELSE 'pending' END;
 error_code:=CASE p_outcome WHEN 'sent' THEN NULL WHEN 'transient' THEN 'PUSH_TRANSIENT'
  WHEN 'network' THEN 'PUSH_NETWORK_UNKNOWN' WHEN 'invalid_subscription' THEN 'PUSH_SUBSCRIPTION_GONE'
  WHEN 'malformed_subscription' THEN 'PUSH_MALFORMED' END;
 IF p_outcome='invalid_subscription' AND s.state='active'
 AND s.binding_id=d.captured_binding_id AND s.binding_version=d.captured_binding_version THEN
  UPDATE public.push_subscriptions SET state='disabled',user_id=NULL,endpoint=NULL,p256dh=NULL,auth=NULL,
   activated_at=NULL,disabled_at=now_at,updated_at=now_at,binding_id=pg_catalog.gen_random_uuid(),
   binding_version=CASE WHEN binding_version<9223372036854775807 THEN binding_version+1 ELSE binding_version END
   WHERE id=s.id;
 END IF;
 -- Check again after potentially blocking update/constraints, before final state.
 IF d.lease_until<=pg_catalog.clock_timestamp() THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_SENDER_LEASE_EXPIRED'; END IF;
 UPDATE public.push_deliveries SET status=next_status,lease_token=NULL,lease_until=NULL,
  next_attempt_at=CASE WHEN next_status='pending' THEN now_at+pg_catalog.make_interval(secs=>60*pg_catalog.power(2,d.attempts-1)::pg_catalog.int4) ELSE next_attempt_at END,
  last_error_code=error_code,updated_at=now_at WHERE id=d.id;
 RETURN pg_catalog.jsonb_build_object('status',next_status);
END;
$fn$;
CREATE FUNCTION public.nca_claim_content_push_deliveries(p_limit integer) RETURNS pg_catalog.jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'
AS $fn$
DECLARE result pg_catalog.jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>10 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NCA_SENDER_LIMIT'; END IF;
 WITH candidates AS MATERIALIZED (
  SELECT d.id FROM public.push_deliveries d
  WHERE d.personal_notification_id IS NULL AND d.content_event_id IS NOT NULL
   AND ((d.status='pending' AND d.next_attempt_at<=pg_catalog.clock_timestamp())
    OR (d.status='leased' AND d.lease_until<=pg_catalog.clock_timestamp()))
  ORDER BY d.next_attempt_at,d.id LIMIT p_limit FOR UPDATE OF d SKIP LOCKED
 ), claimed AS (
  UPDATE public.push_deliveries d SET
   status=CASE WHEN d.attempts>=6 THEN 'failed' ELSE 'leased' END,
   attempts=CASE WHEN d.attempts>=6 THEN d.attempts ELSE d.attempts+1 END,
   lease_token=CASE WHEN d.attempts>=6 THEN NULL ELSE pg_catalog.gen_random_uuid() END,
   lease_until=CASE WHEN d.attempts>=6 THEN NULL ELSE pg_catalog.clock_timestamp()+INTERVAL '90 seconds' END,
   updated_at=pg_catalog.clock_timestamp(),
   last_error_code=CASE WHEN d.attempts>=6 THEN 'ATTEMPTS_EXHAUSTED' ELSE d.last_error_code END
  FROM candidates c WHERE d.id=c.id RETURNING d.id,d.status,d.lease_token
 ) SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'delivery_id',id,'lease_token',lease_token) ORDER BY id) FILTER(WHERE status='leased'),'[]'::pg_catalog.jsonb) INTO result FROM claimed;
 RETURN pg_catalog.jsonb_build_object('status','ok','deliveries',result);
END;
$fn$;
CREATE FUNCTION public.nca_prepare_content_push_delivery(p_delivery_id uuid,p_lease_token uuid) RETURNS pg_catalog.jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'
AS $fn$
DECLARE d public.push_deliveries%ROWTYPE; e public.push_content_events%ROWTYPE; p public.content_publications%ROWTYPE;
 pref public.push_preferences%ROWTYPE; s public.push_subscriptions%ROWTYPE; account_at pg_catalog.uuid;
 enabled pg_catalog.bool; since_at pg_catalog.timestamptz; reason pg_catalog.text;
 story_title pg_catalog.text; chapter_title pg_catalog.text; chapter_story pg_catalog.int8;
 story_published pg_catalog.bool; chapter_published pg_catalog.bool;
BEGIN
 IF p_delivery_id IS NULL OR p_lease_token IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NCA_CONTENT_ARGUMENT'; END IF;
 SELECT * INTO d FROM public.push_deliveries WHERE id=p_delivery_id;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 IF d.personal_notification_id IS NOT NULL OR d.content_event_id IS NULL
 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_SENDER_NOT_CONTENT'; END IF;
 SELECT * INTO e FROM public.push_content_events WHERE id=d.content_event_id;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 SELECT * INTO p FROM public.content_publications WHERE id=e.publication_id FOR SHARE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 SELECT * INTO e FROM public.push_content_events WHERE id=d.content_event_id FOR SHARE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 SELECT user_id INTO account_at FROM public.push_subscriptions WHERE id=d.subscription_id;
 SELECT * INTO pref FROM public.push_preferences WHERE user_id=account_at FOR SHARE;
 -- Break the account-delete subscription -> preference cascade inversion.
 SELECT * INTO s FROM public.push_subscriptions WHERE id=d.subscription_id FOR SHARE NOWAIT;
 SELECT * INTO d FROM public.push_deliveries WHERE id=p_delivery_id FOR UPDATE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 IF d.status<>'leased' OR d.lease_token IS DISTINCT FROM p_lease_token OR d.lease_until IS NULL
 OR d.lease_until<=pg_catalog.clock_timestamp()+INTERVAL '15 seconds'
 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_CONTENT_LEASE_CONFLICT'; END IF;
 enabled:=CASE p.kind WHEN 'new_story' THEN pref.new_story_enabled WHEN 'new_chapter' THEN pref.new_chapter_enabled ELSE false END;
 since_at:=CASE p.kind WHEN 'new_story' THEN pref.new_story_enabled_since WHEN 'new_chapter' THEN pref.new_chapter_enabled_since END;
 IF p.id IS DISTINCT FROM e.publication_id OR e.id IS DISTINCT FROM d.content_event_id OR p.origin<>'genuine'
 OR p.kind NOT IN ('new_story','new_chapter') OR p.occurred_at IS NULL OR NOT pg_catalog.isfinite(p.occurred_at)
 OR p.occurred_at>pg_catalog.clock_timestamp() THEN reason:='SOURCE_MISMATCH';
 ELSIF e.expires_at<=pg_catalog.clock_timestamp() OR e.expires_at>p.occurred_at+INTERVAL '24 hours' THEN reason:='EVENT_EXPIRED';
 ELSIF enabled IS DISTINCT FROM true OR since_at IS NULL OR since_at>p.occurred_at THEN reason:='PREFERENCE_DISABLED';
 ELSIF s.id IS NULL OR s.state<>'active' OR s.user_id IS NULL OR s.user_id IS DISTINCT FROM account_at OR s.user_id IS DISTINCT FROM pref.user_id
 OR s.binding_id IS DISTINCT FROM d.captured_binding_id OR s.binding_version IS DISTINCT FROM d.captured_binding_version
 OR s.activated_at IS NULL OR s.activated_at>p.occurred_at OR s.endpoint IS NULL OR s.p256dh IS NULL OR s.auth IS NULL THEN reason:='SUBSCRIPTION_CHANGED'; END IF;
 IF reason IS NULL THEN
  SELECT title,published INTO story_title,story_published FROM public.stories WHERE id=p.story_id;
  IF story_published IS DISTINCT FROM true THEN reason:='SOURCE_NOT_PUBLISHED'; END IF;
  IF p.kind='new_chapter' THEN
   SELECT title,story_id,published INTO chapter_title,chapter_story,chapter_published FROM public.chapters WHERE id=p.chapter_id;
   IF chapter_story IS DISTINCT FROM p.story_id THEN reason:='SOURCE_MISMATCH'; END IF;
   IF chapter_published IS DISTINCT FROM true THEN reason:='SOURCE_NOT_PUBLISHED'; END IF;
  END IF;
 END IF;
 IF reason IS NOT NULL THEN
  UPDATE public.push_deliveries SET status='cancelled',lease_token=NULL,lease_until=NULL,last_error_code=reason,updated_at=pg_catalog.clock_timestamp() WHERE id=d.id;
  RETURN pg_catalog.jsonb_build_object('status','cancelled');
 END IF;
 RETURN pg_catalog.jsonb_build_object('status','ready',
  'lease_remaining_ms',pg_catalog.floor(EXTRACT(EPOCH FROM(d.lease_until-pg_catalog.clock_timestamp()))*1000),
  'event_remaining_seconds',pg_catalog.floor(EXTRACT(EPOCH FROM(e.expires_at-pg_catalog.clock_timestamp()))),
  'subscription',pg_catalog.jsonb_build_object('endpoint',s.endpoint,'keys',pg_catalog.jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)),
  'content',pg_catalog.jsonb_build_object('event_id',e.id::pg_catalog.text,'publication_id',p.id::pg_catalog.text,'category',p.kind,
   'story_id',p.story_id::pg_catalog.text,'chapter_id',p.chapter_id::pg_catalog.text,'story_title',story_title,'chapter_title',chapter_title));
END;
$fn$;

REVOKE ALL ON FUNCTION public.nca_capture_content_first_publication() FROM PUBLIC,anon,authenticated,service_role,nca_push_api,nca_push_fanout,nca_push_sender;
REVOKE ALL ON FUNCTION public.nca_claim_content_push_events(integer) FROM PUBLIC,anon,authenticated,service_role,nca_push_api,nca_push_fanout,nca_push_sender;
GRANT EXECUTE ON FUNCTION public.nca_claim_content_push_events(integer) TO nca_push_fanout;
REVOKE ALL ON FUNCTION public.nca_fanout_content_push_event_page(bigint,uuid,integer) FROM PUBLIC,anon,authenticated,service_role,nca_push_api,nca_push_fanout,nca_push_sender;
GRANT EXECUTE ON FUNCTION public.nca_fanout_content_push_event_page(bigint,uuid,integer) TO nca_push_fanout;
REVOKE ALL ON FUNCTION public.nca_claim_content_push_deliveries(integer) FROM PUBLIC,anon,authenticated,service_role,nca_push_api,nca_push_fanout,nca_push_sender;
GRANT EXECUTE ON FUNCTION public.nca_claim_content_push_deliveries(integer) TO nca_push_sender;
REVOKE ALL ON FUNCTION public.nca_prepare_content_push_delivery(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,nca_push_api,nca_push_fanout,nca_push_sender;
GRANT EXECUTE ON FUNCTION public.nca_prepare_content_push_delivery(uuid,uuid) TO nca_push_sender;
REVOKE ALL ON FUNCTION public.nca_finish_content_push_delivery(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role,nca_push_api,nca_push_fanout,nca_push_sender;
GRANT EXECUTE ON FUNCTION public.nca_finish_content_push_delivery(uuid,uuid,text) TO nca_push_sender;
DO $verify$
DECLARE r record; expected pg_catalog.jsonb:='{"nca_capture_content_first_publication":"b24cbf8545839afc8bc0971c5abb5eed","nca_claim_content_push_events":"2d4fee3d093f5e7c2c7582de093727d6","nca_fanout_content_push_event_page":"d82a5508e9e26cbca4fae41322308949","nca_finish_content_push_delivery":"32394859ac08e9603d6391b131f754e9","nca_claim_content_push_deliveries":"fe016517a326762c3129096ed720bcc0","nca_prepare_content_push_delivery":"2ed79c71a627f15aa340d86b16339b7b"}'; owner_oid pg_catalog.oid; allowed_oid pg_catalog.oid;
BEGIN
 SELECT oid INTO owner_oid FROM pg_catalog.pg_roles WHERE rolname='postgres';
 FOR r IN SELECT p.* FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('nca_capture_content_first_publication','nca_claim_content_push_events',
 'nca_fanout_content_push_event_page','nca_claim_content_push_deliveries','nca_prepare_content_push_delivery','nca_finish_content_push_delivery') LOOP
  SELECT oid INTO allowed_oid FROM pg_catalog.pg_roles WHERE rolname=CASE
   WHEN r.proname='nca_capture_content_first_publication' THEN 'postgres'
   WHEN r.proname IN ('nca_claim_content_push_events','nca_fanout_content_push_event_page') THEN 'nca_push_fanout' ELSE 'nca_push_sender' END;
  IF r.proowner<>owner_oid OR NOT r.prosecdef OR r.provolatile<>'v' OR r.proisstrict OR r.proleakproof OR r.proretset
  OR r.prokind<>'f' OR r.proconfig IS DISTINCT FROM ARRAY['search_path=""','lock_timeout=2s','statement_timeout=5s']
  OR pg_catalog.md5(r.prosrc) IS DISTINCT FROM expected->>r.proname
  OR NOT pg_catalog.has_function_privilege(allowed_oid,r.oid,'EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(r.proacl,pg_catalog.acldefault('f',r.proowner))) a
   WHERE a.grantee NOT IN(owner_oid,allowed_oid) OR a.is_grantable)
  THEN RAISE EXCEPTION 'NCA_CONTENT_FINAL_ROUTINES'; END IF;
 END LOOP;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname='nca_capture_content_first_publication' AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=21)<>2
 THEN RAISE EXCEPTION 'NCA_CONTENT_FINAL_TRIGGERS'; END IF;
END;
$verify$;
SELECT 'CONTENT_PUSH_DELIVERY_INSTALLED' AS result;
COMMIT;
