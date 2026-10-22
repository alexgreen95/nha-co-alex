-- PostgreSQL 17, catalog evidence ONLY. This artifact authorizes no execution.
-- Never evaluates discovered source, expressions, policies, defaults or triggers.
-- Target absence is evidence, not a failed historical-schema assertion.
-- Discovery spans non-system schemas: name OR source token OR recorded relation/
-- rowtype dependency OR trigger attachment. Computed names, external code and
-- unrecorded/transitive SQL/PLpgSQL references cannot be proven absent.
-- Evidence is raw (no deparsers/type-output dispatch), capped and deterministic
-- within one statement snapshot. Caps/omissions are explicit, never silent PASS.
-- Raw stored source can itself contain embedded credentials; suspect source/
-- configs are withheld, not printed. Manual source review remains mandatory.
BEGIN READ ONLY;
SET LOCAL search_path = '';
SET LOCAL standard_conforming_strings = 'on';
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '20s';
SET LOCAL transaction_timeout = '30s';

WITH RECURSIVE
limits AS (
 SELECT 128 AS routines,512 AS columns,256 AS constraints,256 AS indexes,
  512 AS triggers,128 AS policies,256 AS roles,1024 AS memberships,
  4096 AS dependencies,2048 AS shared_dependencies,1024 AS types,
  4096 AS acl_entries,256 AS default_acls,128 AS rewrites,
  256 AS descriptors,65536 AS source_bytes,16384 AS config_bytes,4194304 AS output_bytes
),
requested(schema_name,relation_name,purpose) AS (
 VALUES ('public','content_publication_clock','foundation'),
 ('public','content_publication_state','foundation'),
 ('public','content_publications','foundation'),
 ('public','push_content_events','foundation'),
 ('public','push_deliveries','foundation'),
 ('public','push_preferences','foundation'),
 ('public','push_subscriptions','foundation'),
 ('public','stories','presentation_publication_support'),
 ('public','chapters','presentation_publication_support')
),
tokens(token) AS (
 VALUES ('push_content_events'),('content_event_id'),('content_publication'),
 ('new_story'),('new_chapter'),('push_deliveries'),
 ('new_story_enabled'),('new_chapter_enabled')
),
catalog_ids AS MATERIALIZED (
 SELECT c.oid,c.relname FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='pg_catalog' AND c.relname IN
 ('pg_class','pg_proc','pg_type','pg_constraint','pg_attrdef','pg_trigger',
  'pg_policy','pg_rewrite','pg_namespace','pg_default_acl')
),
relations_all AS MATERIALIZED (
 SELECT c.*,n.nspname,q.purpose FROM requested q
 JOIN pg_catalog.pg_namespace n ON n.nspname=q.schema_name
 JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=q.relation_name
),
-- Preferences: only the content switches/timestamps plus audience join identity.
-- The already-closed preference RPC contract is not recollected.
columns_all AS MATERIALIZED (
 SELECT a.*,d.oid AS attrdef_oid,d.adbin::pg_catalog.text AS adbin
 FROM pg_catalog.pg_attribute a JOIN relations_all r ON r.oid=a.attrelid
 LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attnum>0 AND (r.relname<>'push_preferences' OR
  a.attname IN ('user_id','new_story_enabled','new_story_enabled_since',
   'new_chapter_enabled','new_chapter_enabled_since'))
),
constraints_all AS MATERIALIZED (
 SELECT k.* FROM pg_catalog.pg_constraint k WHERE k.conrelid IN (SELECT oid FROM relations_all)
),
indexes_all AS MATERIALIZED (
 SELECT i.*,c.relname,c.relnamespace,c.relowner,c.relkind,c.relam,c.reloptions
 FROM pg_catalog.pg_index i JOIN relations_all r ON r.oid=i.indrelid
 JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
),
policies_all AS MATERIALIZED (
 SELECT p.* FROM pg_catalog.pg_policy p WHERE p.polrelid IN (SELECT oid FROM relations_all)
),
rewrites_all AS MATERIALIZED (
 SELECT r.* FROM pg_catalog.pg_rewrite r WHERE r.ev_class IN (SELECT oid FROM relations_all)
),
relation_edges AS MATERIALIZED (
 SELECT d.* FROM pg_catalog.pg_depend d
 WHERE d.classid=(SELECT oid FROM catalog_ids WHERE relname='pg_proc') AND
 ((d.refclassid=(SELECT oid FROM catalog_ids WHERE relname='pg_class') AND d.refobjid IN (SELECT oid FROM relations_all))
 OR (d.refclassid=(SELECT oid FROM catalog_ids WHERE relname='pg_type') AND d.refobjid IN (SELECT reltype FROM relations_all)))
),
attached_triggers AS MATERIALIZED (
 SELECT t.* FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM relations_all)
),
candidate_all AS MATERIALIZED (
 SELECT p.*,n.nspname,l.lanname,
  (pg_catalog.lower(p.proname) ~ '(content|publication|freshness|publish)' AND
   pg_catalog.lower(p.proname) ~ '(push|publication|freshness|publish)') AS name_match,
  EXISTS(SELECT 1 FROM tokens t WHERE pg_catalog.strpos(pg_catalog.lower(p.prosrc),t.token)>0) AS source_token_match,
  EXISTS(SELECT 1 FROM relation_edges d WHERE d.objid=p.oid) AS dependency_match,
  EXISTS(SELECT 1 FROM attached_triggers t WHERE t.tgfoid=p.oid) AS trigger_match
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE EXISTS(SELECT 1 FROM attached_triggers t WHERE t.tgfoid=p.oid)
 OR EXISTS(SELECT 1 FROM relation_edges d WHERE d.objid=p.oid)
 OR (n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_)' AND
  ((pg_catalog.lower(p.proname) ~ '(content|publication|freshness|publish)' AND
    pg_catalog.lower(p.proname) ~ '(push|publication|freshness|publish)')
   OR EXISTS(SELECT 1 FROM tokens t WHERE pg_catalog.strpos(pg_catalog.lower(p.prosrc),t.token)>0)))
),
candidates AS MATERIALIZED (
 SELECT * FROM candidate_all ORDER BY oid LIMIT (SELECT routines FROM limits)
),
-- Also report attachments elsewhere of the same discovered functions, with only
-- their relation header; no rows or unrelated table schema are collected.
triggers_all AS MATERIALIZED (
 SELECT t.* FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM relations_all)
 OR t.tgfoid IN (SELECT oid FROM candidate_all)
),
schemas_all AS MATERIALIZED (
 SELECT n.* FROM pg_catalog.pg_namespace n WHERE n.oid IN
 (SELECT relnamespace FROM relations_all UNION SELECT pronamespace FROM candidate_all
  UNION SELECT c.relnamespace FROM pg_catalog.pg_class c JOIN triggers_all t ON t.tgrelid=c.oid)
),
database_meta AS MATERIALIZED (
 SELECT d.oid,d.datname,d.datdba,d.datacl FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database()
),
default_acls_all AS MATERIALIZED (
 SELECT d.* FROM pg_catalog.pg_default_acl d WHERE d.defaclrole IN
 (SELECT relowner FROM relations_all UNION SELECT proowner FROM candidate_all)
 AND (d.defaclnamespace=0 OR d.defaclnamespace IN (SELECT oid FROM schemas_all))
),
acl_all AS MATERIALIZED (
 SELECT 'relation'::pg_catalog.text AS scope,r.oid AS object_oid,0 AS attnum,x.*
 FROM relations_all r CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(r.relacl,
  pg_catalog.acldefault(CASE WHEN r.relkind='S' THEN 's'::pg_catalog."char" ELSE 'r'::pg_catalog."char" END,r.relowner))) x
 UNION ALL SELECT 'column',a.attrelid,a.attnum,x.* FROM columns_all a
 CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
 UNION ALL SELECT 'routine',p.oid,0,x.* FROM candidates p
 CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) x
 UNION ALL SELECT 'schema',n.oid,0,x.* FROM schemas_all n
 CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) x
 UNION ALL SELECT 'database',d.oid,0,x.* FROM database_meta d
 CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(d.datacl,pg_catalog.acldefault('d',d.datdba))) x
 UNION ALL SELECT 'default_acl',d.oid,0,x.* FROM default_acls_all d
 CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
),
role_roots(oid) AS (
 SELECT oid FROM pg_catalog.pg_roles WHERE rolname ~ '^nca_push_' OR rolname IN ('postgres','anon','authenticated','service_role','authenticator')
 UNION SELECT relowner FROM relations_all UNION SELECT proowner FROM candidate_all
 UNION SELECT nspowner FROM schemas_all UNION SELECT datdba FROM database_meta
 UNION SELECT defaclrole FROM default_acls_all
 UNION SELECT grantor FROM acl_all UNION SELECT grantee FROM acl_all
 UNION SELECT pg_catalog.unnest(polroles) FROM policies_all
),
role_edges AS MATERIALIZED (
 SELECT m.member AS source,m.roleid AS destination FROM pg_catalog.pg_auth_members m
 UNION SELECT m.roleid,m.member FROM pg_catalog.pg_auth_members m
),
role_reach(oid) AS (
 SELECT oid FROM role_roots WHERE oid<>0
 UNION SELECT e.destination FROM role_reach r JOIN role_edges e ON e.source=r.oid
),
roles_all AS MATERIALIZED (
 SELECT r.oid,r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,
  r.rolcanlogin,r.rolreplication,r.rolbypassrls FROM pg_catalog.pg_roles r JOIN role_reach x ON x.oid=r.oid
),
memberships_all AS MATERIALIZED (
 SELECT m.roleid,m.member,m.grantor,m.admin_option,m.inherit_option,m.set_option
 FROM pg_catalog.pg_auth_members m WHERE m.member IN (SELECT oid FROM role_reach)
),
type_roots(oid) AS (
 SELECT atttypid FROM columns_all WHERE NOT attisdropped
 UNION SELECT reltype FROM relations_all WHERE reltype<>0
 UNION SELECT prorettype FROM candidates
 UNION SELECT pg_catalog.unnest(proargtypes::pg_catalog.oid[]) FROM candidates
 UNION SELECT pg_catalog.unnest(proallargtypes) FROM candidates
),
type_reach(oid) AS (
 SELECT oid FROM type_roots
 UNION SELECT x.oid FROM type_reach r JOIN pg_catalog.pg_type t ON t.oid=r.oid
 CROSS JOIN LATERAL pg_catalog.unnest(ARRAY[t.typbasetype,t.typelem]) x(oid) WHERE x.oid<>0
),
types_all AS MATERIALIZED (
 SELECT t.oid,t.typname,t.typnamespace,n.nspname,t.typowner,t.typtype,t.typbasetype,
  t.typtypmod,t.typelem,t.typrelid,t.typnotnull,t.typcollation,t.typdefaultbin::pg_catalog.text AS typdefaultbin,
  t.typinput::pg_catalog.oid AS input_oid,t.typoutput::pg_catalog.oid AS output_oid,
  t.typmodin::pg_catalog.oid AS typmodin_oid,t.typmodout::pg_catalog.oid AS typmodout_oid
 FROM type_reach x JOIN pg_catalog.pg_type t ON t.oid=x.oid JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
),
opclasses_all AS MATERIALIZED (
 SELECT o.oid,o.opcname,o.opcnamespace,n.nspname,o.opcmethod,o.opcowner,o.opcfamily,o.opcintype,o.opckeytype,o.opcdefault
 FROM pg_catalog.pg_opclass o JOIN pg_catalog.pg_namespace n ON n.oid=o.opcnamespace
 WHERE o.oid IN (SELECT pg_catalog.unnest(indclass::pg_catalog.oid[]) FROM indexes_all)
),
collations_all AS MATERIALIZED (
 SELECT c.oid,c.collname,c.collnamespace,n.nspname,c.collowner,c.collprovider,c.collisdeterministic,
  c.collencoding,c.collcollate,c.collctype,c.colllocale,c.collicurules,c.collversion
 FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace
 WHERE c.oid IN (SELECT attcollation FROM columns_all UNION SELECT pg_catalog.unnest(indcollation::pg_catalog.oid[]) FROM indexes_all)
),
object_ids(classid,objid) AS (
 SELECT (SELECT oid FROM catalog_ids WHERE relname='pg_class'),oid FROM relations_all
 UNION SELECT (SELECT oid FROM catalog_ids WHERE relname='pg_class'),indexrelid FROM indexes_all
 UNION SELECT (SELECT oid FROM catalog_ids WHERE relname='pg_proc'),oid FROM candidate_all
 UNION SELECT (SELECT oid FROM catalog_ids WHERE relname='pg_type'),oid FROM type_reach
 UNION SELECT (SELECT oid FROM catalog_ids WHERE relname='pg_constraint'),oid FROM constraints_all
 UNION SELECT (SELECT oid FROM catalog_ids WHERE relname='pg_attrdef'),attrdef_oid FROM columns_all WHERE attrdef_oid IS NOT NULL
 UNION SELECT (SELECT oid FROM catalog_ids WHERE relname='pg_trigger'),oid FROM triggers_all
 UNION SELECT (SELECT oid FROM catalog_ids WHERE relname='pg_policy'),oid FROM policies_all
 UNION SELECT (SELECT oid FROM catalog_ids WHERE relname='pg_rewrite'),oid FROM rewrites_all
 UNION SELECT (SELECT oid FROM catalog_ids WHERE relname='pg_default_acl'),oid FROM default_acls_all
),
dependencies_all AS MATERIALIZED (
 SELECT d.* FROM pg_catalog.pg_depend d WHERE EXISTS
 (SELECT 1 FROM object_ids x WHERE x.classid=d.classid AND x.objid=d.objid)
 OR EXISTS(SELECT 1 FROM object_ids x WHERE x.classid=d.refclassid AND x.objid=d.refobjid
  AND x.classid<>(SELECT oid FROM catalog_ids WHERE relname='pg_type'))
),
shared_dependencies_all AS MATERIALIZED (
 SELECT d.* FROM pg_catalog.pg_shdepend d JOIN database_meta db ON db.oid=d.dbid
 WHERE EXISTS(SELECT 1 FROM object_ids x WHERE x.classid=d.classid AND x.objid=d.objid)
),
-- No source is evaluated. Withhold suspect literals/configs as whole fields;
-- do not replace, truncate or purport to reconstruct a reviewed definition.
source_status AS MATERIALIZED (
 SELECT p.oid,
  p.lanname IN ('sql','plpgsql') AS text_language,
  pg_catalog.octet_length(p.prosrc)>(SELECT source_bytes FROM limits) AS source_oversized,
  pg_catalog.octet_length(COALESCE(p.proconfig::pg_catalog.text,''))>(SELECT config_bytes FROM limits) AS config_oversized,
  (p.prosrc ~* '(postgres(ql)?://[^[:space:]]*:[^[:space:]]*@|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_|service_role[[:space:]]*[:=][[:space:]]*[''\"]|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.)'
   OR COALESCE(p.proconfig::pg_catalog.text,'') ~* '(password|secret|token|private_key)[[:space:]]*=') AS sensitive_suspected
 FROM candidates p
),
relations_out AS (
 SELECT q.schema_name,q.relation_name,q.purpose,pg_catalog.jsonb_build_object(
  'schema',q.schema_name,'relname',q.relation_name,'purpose',q.purpose,'exists',r.oid IS NOT NULL,
  'oid',r.oid,'relkind',r.relkind,'relnamespace',r.relnamespace,'reltype',r.reltype,
  'relowner',r.relowner,'owner',o.rolname,'relrowsecurity',r.relrowsecurity,'relforcerowsecurity',r.relforcerowsecurity,
  'relispartition',r.relispartition,'relpartbound',r.relpartbound::pg_catalog.text,'relam',r.relam,
  'relacl',r.relacl::pg_catalog.text,'relacl_is_null',r.relacl IS NULL) AS j
 FROM requested q LEFT JOIN relations_all r ON r.nspname=q.schema_name AND r.relname=q.relation_name
 LEFT JOIN pg_catalog.pg_roles o ON o.oid=r.relowner
),
columns_out AS (
 SELECT a.attrelid,a.attnum,pg_catalog.jsonb_build_object('attrelid',a.attrelid,'attnum',a.attnum,
  'attname',a.attname,'attisdropped',a.attisdropped,'atttypid',a.atttypid,'type_schema',t.nspname,'typname',t.typname,
  'atttypmod',a.atttypmod,'attnotnull',a.attnotnull,'attidentity',a.attidentity,'attgenerated',a.attgenerated,
  'atthasdef',a.atthasdef,'attrdef_oid',a.attrdef_oid,'adbin',a.adbin,'attcollation',a.attcollation,
  'attacl',a.attacl::pg_catalog.text) AS j
 FROM columns_all a LEFT JOIN types_all t ON t.oid=a.atttypid
 ORDER BY a.attrelid,a.attnum LIMIT (SELECT columns FROM limits)
),
constraints_out AS (
 SELECT k.oid,pg_catalog.jsonb_build_object('oid',k.oid,'conname',k.conname,'connamespace',k.connamespace,
  'contype',k.contype,'conrelid',k.conrelid,'contypid',k.contypid,'conkey',k.conkey,'confrelid',k.confrelid,'confkey',k.confkey,
  'condeferrable',k.condeferrable,'condeferred',k.condeferred,'convalidated',k.convalidated,'connoinherit',k.connoinherit,
  'conindid',k.conindid,'conparentid',k.conparentid,'confupdtype',k.confupdtype,'confdeltype',k.confdeltype,
  'confmatchtype',k.confmatchtype,'conpfeqop',k.conpfeqop,'conppeqop',k.conppeqop,'conffeqop',k.conffeqop,
  'conexclop',k.conexclop,'conbin',k.conbin::pg_catalog.text) AS j
 FROM constraints_all k ORDER BY k.oid LIMIT (SELECT constraints FROM limits)
),
indexes_out AS (
 SELECT i.indexrelid,pg_catalog.jsonb_build_object('indexrelid',i.indexrelid,'indrelid',i.indrelid,
  'relname',i.relname,'relnamespace',i.relnamespace,'relowner',i.relowner,'relkind',i.relkind,'relam',i.relam,'reloptions',i.reloptions,
  'indnatts',i.indnatts,'indnkeyatts',i.indnkeyatts,'indisunique',i.indisunique,'indisprimary',i.indisprimary,
  'indnullsnotdistinct',i.indnullsnotdistinct,'indisexclusion',i.indisexclusion,'indimmediate',i.indimmediate,
  'indisvalid',i.indisvalid,'indisready',i.indisready,'indislive',i.indislive,
  'indkey',i.indkey::pg_catalog.int2[],'indclass',i.indclass::pg_catalog.oid[],
  'indcollation',i.indcollation::pg_catalog.oid[],'indoption',i.indoption::pg_catalog.int2[],
  'indexprs',i.indexprs::pg_catalog.text,'indpred',i.indpred::pg_catalog.text) AS j
 FROM indexes_all i ORDER BY i.indexrelid LIMIT (SELECT indexes FROM limits)
),
triggers_out AS (
 SELECT t.oid,pg_catalog.jsonb_build_object('oid',t.oid,'tgrelid',t.tgrelid,'relation_schema',n.nspname,'relation_name',c.relname,
  'relation_kind',c.relkind,'relation_owner',c.relowner,'tgname',t.tgname,'tgfoid',t.tgfoid,
  'function_schema',pn.nspname,'function_name',p.proname,'function_argtypes',p.proargtypes::pg_catalog.oid[],
  'tgtype',t.tgtype,'tgenabled',t.tgenabled,'tgisinternal',t.tgisinternal,'tgconstraint',t.tgconstraint,
  'tgconstrrelid',t.tgconstrrelid,'tgconstrindid',t.tgconstrindid,'tgdeferrable',t.tgdeferrable,'tginitdeferred',t.tginitdeferred,
  'tgnargs',t.tgnargs,'tgargs_hex',pg_catalog.encode(t.tgargs,'hex'),'tgattr',t.tgattr::pg_catalog.int2[],
  'tgqual',t.tgqual::pg_catalog.text,'tgoldtable',t.tgoldtable,'tgnewtable',t.tgnewtable) AS j
 FROM triggers_all t LEFT JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
 LEFT JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
 ORDER BY t.oid LIMIT (SELECT triggers FROM limits)
),
routines_out AS (
 SELECT p.oid,pg_catalog.jsonb_build_object('oid',p.oid,'schema',p.nspname,'proname',p.proname,'pronamespace',p.pronamespace,
  'proowner',p.proowner,'owner',o.rolname,'prolang',p.prolang,'language',p.lanname,'prokind',p.prokind,
  'prosecdef',p.prosecdef,'provolatile',p.provolatile,'proisstrict',p.proisstrict,'proleakproof',p.proleakproof,'proparallel',p.proparallel,
  'pronargs',p.pronargs,'pronargdefaults',p.pronargdefaults,'proargnames',p.proargnames,
  'proargtypes',p.proargtypes::pg_catalog.oid[],'proallargtypes',p.proallargtypes,'proargmodes',p.proargmodes,
  'prorettype',p.prorettype,'proretset',p.proretset,'prosupport_oid',p.prosupport::pg_catalog.oid,
  'proconfig',CASE WHEN NOT s.config_oversized AND NOT s.sensitive_suspected THEN p.proconfig END,
  'proacl',p.proacl::pg_catalog.text,'proacl_is_null',p.proacl IS NULL,
  'prosrc',CASE WHEN s.text_language AND NOT s.source_oversized AND NOT s.sensitive_suspected THEN p.prosrc END,
  'prosqlbody',CASE WHEN NOT s.sensitive_suspected AND NOT s.source_oversized THEN p.prosqlbody::pg_catalog.text END,
  'proargdefaults',CASE WHEN NOT s.sensitive_suspected THEN p.proargdefaults::pg_catalog.text END,
  'discovery',pg_catalog.jsonb_build_object('name',p.name_match,'source_token',p.source_token_match,
   'dependency',p.dependency_match,'trigger_attachment',p.trigger_match),
  'source_status',pg_catalog.to_jsonb(s),'source_semantics_verified',false) AS j
 FROM candidates p JOIN source_status s ON s.oid=p.oid LEFT JOIN pg_catalog.pg_roles o ON o.oid=p.proowner
),
policies_out AS (
 SELECT p.oid,pg_catalog.jsonb_build_object('oid',p.oid,'polname',p.polname,'polrelid',p.polrelid,
  'polcmd',p.polcmd,'polpermissive',p.polpermissive,'polroles',p.polroles,
  'polqual',p.polqual::pg_catalog.text,'polwithcheck',p.polwithcheck::pg_catalog.text) AS j
 FROM policies_all p ORDER BY p.oid LIMIT (SELECT policies FROM limits)
),
sections AS (
 SELECT pg_catalog.jsonb_build_object(
  'relations',(SELECT pg_catalog.jsonb_agg(j ORDER BY schema_name,relation_name) FROM relations_out),
  'columns',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY attrelid,attnum) FROM columns_out),'[]'::pg_catalog.jsonb),
  'constraints',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY oid) FROM constraints_out),'[]'::pg_catalog.jsonb),
  'indexes',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY indexrelid) FROM indexes_out),'[]'::pg_catalog.jsonb),
  'policies',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY oid) FROM policies_out),'[]'::pg_catalog.jsonb),
  'functions',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY oid) FROM routines_out),'[]'::pg_catalog.jsonb),
  'triggers',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY oid) FROM triggers_out),'[]'::pg_catalog.jsonb),
  'types',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.oid) FROM
   (SELECT * FROM types_all ORDER BY oid LIMIT (SELECT types FROM limits)) x),'[]'::pg_catalog.jsonb),
  'opclasses',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.oid) FROM
   (SELECT * FROM opclasses_all ORDER BY oid LIMIT (SELECT descriptors FROM limits)) x),'[]'::pg_catalog.jsonb),
  'collations',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.oid) FROM
   (SELECT * FROM collations_all ORDER BY oid LIMIT (SELECT descriptors FROM limits)) x),'[]'::pg_catalog.jsonb),
  'schemas',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',n.oid,'nspname',n.nspname,
   'nspowner',n.nspowner,'nspacl',n.nspacl::pg_catalog.text) ORDER BY n.oid) FROM schemas_all n),
  'database',(SELECT pg_catalog.jsonb_build_object('oid',d.oid,'datname',d.datname,'datdba',d.datdba,'datacl',d.datacl::pg_catalog.text) FROM database_meta d),
  'roles',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.oid) FROM
   (SELECT * FROM roles_all ORDER BY oid LIMIT (SELECT roles FROM limits)) x),'[]'::pg_catalog.jsonb),
  'memberships',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.roleid,x.member,x.grantor) FROM
   (SELECT * FROM memberships_all ORDER BY roleid,member,grantor LIMIT (SELECT memberships FROM limits)) x),'[]'::pg_catalog.jsonb),
  'acl_entries',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.scope,x.object_oid,x.attnum,x.grantee,x.grantor,x.privilege_type) FROM
   (SELECT a.*,g.rolname AS grantor_name,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee_name
    FROM acl_all a LEFT JOIN pg_catalog.pg_roles g ON g.oid=a.grantor LEFT JOIN pg_catalog.pg_roles r ON r.oid=a.grantee
    ORDER BY a.scope,a.object_oid,a.attnum,a.grantee,a.grantor,a.privilege_type LIMIT (SELECT acl_entries FROM limits)) x),'[]'::pg_catalog.jsonb),
  'default_acls',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',x.oid,'defaclrole',x.defaclrole,
   'defaclnamespace',x.defaclnamespace,'defaclobjtype',x.defaclobjtype,'defaclacl',x.defaclacl::pg_catalog.text) ORDER BY x.oid) FROM
   (SELECT * FROM default_acls_all ORDER BY oid LIMIT (SELECT default_acls FROM limits)) x),'[]'::pg_catalog.jsonb),
  'rewrites',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',x.oid,'rulename',x.rulename,
   'ev_class',x.ev_class,'ev_type',x.ev_type,'ev_enabled',x.ev_enabled,'is_instead',x.is_instead,
   'ev_qual',x.ev_qual::pg_catalog.text,'ev_action',x.ev_action::pg_catalog.text) ORDER BY x.oid) FROM
   (SELECT * FROM rewrites_all ORDER BY oid LIMIT (SELECT rewrites FROM limits)) x),'[]'::pg_catalog.jsonb),
  'inheritance',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('inhrelid',i.inhrelid,
   'inhparent',i.inhparent,'inhseqno',i.inhseqno,'inhdetachpending',i.inhdetachpending) ORDER BY i.inhrelid,i.inhseqno)
   FROM pg_catalog.pg_inherits i WHERE i.inhrelid IN (SELECT oid FROM relations_all) OR i.inhparent IN (SELECT oid FROM relations_all)),'[]'::pg_catalog.jsonb),
  'dependencies',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.classid,x.objid,x.objsubid,x.refclassid,x.refobjid,x.refobjsubid,x.deptype) FROM
   (SELECT * FROM dependencies_all ORDER BY classid,objid,objsubid,refclassid,refobjid,refobjsubid,deptype LIMIT (SELECT dependencies FROM limits)) x),'[]'::pg_catalog.jsonb),
  'shared_dependencies',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.dbid,x.classid,x.objid,x.objsubid,x.refclassid,x.refobjid,x.deptype) FROM
   (SELECT * FROM shared_dependencies_all ORDER BY dbid,classid,objid,objsubid,refclassid,refobjid,deptype LIMIT (SELECT shared_dependencies FROM limits)) x),'[]'::pg_catalog.jsonb)
 ) AS j
),
counts AS (
 SELECT (SELECT pg_catalog.count(*) FROM relations_all WHERE purpose='foundation') AS target_relations_found,7 AS target_relations_expected,
  (SELECT pg_catalog.count(*) FROM relations_all WHERE purpose<>'foundation') AS supporting_relations_found,
  (SELECT pg_catalog.count(*) FROM candidate_all) AS functions,(SELECT pg_catalog.count(*) FROM triggers_all) AS triggers,
  (SELECT pg_catalog.count(*) FROM columns_all) AS columns,(SELECT pg_catalog.count(*) FROM constraints_all) AS constraints,
  (SELECT pg_catalog.count(*) FROM indexes_all) AS indexes,(SELECT pg_catalog.count(*) FROM policies_all) AS policies,
  (SELECT pg_catalog.count(*) FROM roles_all) AS roles,(SELECT pg_catalog.count(*) FROM memberships_all) AS memberships,
  (SELECT pg_catalog.count(*) FROM types_all) AS types,(SELECT pg_catalog.count(*) FROM acl_all) AS acl_entries,
  (SELECT pg_catalog.count(*) FROM dependencies_all) AS dependencies,(SELECT pg_catalog.count(*) FROM shared_dependencies_all) AS shared_dependencies,
  (SELECT pg_catalog.count(*) FROM default_acls_all) AS default_acls,(SELECT pg_catalog.count(*) FROM rewrites_all) AS rewrites,
  (SELECT pg_catalog.count(*) FROM opclasses_all) AS opclasses,(SELECT pg_catalog.count(*) FROM collations_all) AS collations
),
catalog_reasons AS (
 SELECT 'POSTGRESQL_17_REQUIRED' AS reason WHERE pg_catalog.current_setting('server_version_num')::pg_catalog.int4 NOT BETWEEN 170000 AND 179999
 UNION ALL SELECT 'CATALOG_IDENTITIES_UNRESOLVED' WHERE (SELECT pg_catalog.count(*) FROM catalog_ids)<>10
 UNION ALL SELECT 'CAP_EXCEEDED:'||c.key FROM counts n,limits l,
 LATERAL pg_catalog.jsonb_each_text(pg_catalog.to_jsonb(n)) c
 JOIN LATERAL pg_catalog.jsonb_each_text(pg_catalog.to_jsonb(l)) k ON k.key=c.key
 WHERE c.value::pg_catalog.int8>k.value::pg_catalog.int8
 UNION ALL SELECT 'DESCRIPTOR_CAP_EXCEEDED' FROM counts n,limits l WHERE n.opclasses>l.descriptors OR n.collations>l.descriptors
 UNION ALL SELECT 'ROUTINE_CAP_EXCEEDED' FROM counts n,limits l WHERE n.functions>l.routines
 UNION ALL SELECT 'SOURCE_WITHHELD:'||s.oid::pg_catalog.text FROM source_status s WHERE s.source_oversized OR s.config_oversized OR s.sensitive_suspected
 UNION ALL SELECT 'TEXT_SOURCE_INCOMPLETE:'||p.oid::pg_catalog.text FROM candidates p
 WHERE p.lanname IN ('sql','plpgsql') AND (p.prosrc IS NULL OR pg_catalog.btrim(p.prosrc)='' OR p.prosqlbody IS NOT NULL)
 UNION ALL SELECT 'ROUTINE_LANGUAGE_UNRESOLVED' WHERE EXISTS(SELECT 1 FROM candidates WHERE lanname IS NULL)
 UNION ALL SELECT 'ROLE_IDENTITY_UNRESOLVED' WHERE EXISTS(SELECT 1 FROM role_reach x LEFT JOIN roles_all r ON r.oid=x.oid WHERE r.oid IS NULL)
 UNION ALL SELECT 'TYPE_IDENTITY_UNRESOLVED' WHERE EXISTS(SELECT 1 FROM type_reach x LEFT JOIN types_all t ON t.oid=x.oid WHERE t.oid IS NULL)
 UNION ALL SELECT 'OUTPUT_CAP_EXCEEDED' FROM sections s,limits l WHERE pg_catalog.octet_length(s.j::pg_catalog.text)>l.output_bytes
),
reasons AS (
 SELECT reason FROM catalog_reasons
 UNION ALL SELECT 'ROUTINE_DISCOVERY_NOT_PROVABLY_COMPLETE'
)
SELECT 'CONTENT_PUSH_RAW_CONTRACT_COLLECTOR_COMPLETE' AS marker,
 pg_catalog.jsonb_build_object(
  'summary',pg_catalog.jsonb_build_object('snapshot_timestamp',pg_catalog.statement_timestamp(),
   'server_version',pg_catalog.current_setting('server_version'),'current_user',CURRENT_USER,'session_user',SESSION_USER,
   'catalog_evidence_complete',NOT EXISTS(SELECT 1 FROM catalog_reasons),'evidence_complete',NOT EXISTS(SELECT 1 FROM reasons),
   'incomplete_reasons',(SELECT pg_catalog.jsonb_agg(reason ORDER BY reason) FROM reasons),
   'counts',(SELECT pg_catalog.to_jsonb(n) FROM counts n),'limits',(SELECT pg_catalog.to_jsonb(l) FROM limits l)),
  'discovery_coverage',pg_catalog.jsonb_build_object('schemas','NON_SYSTEM_SCHEMAS_PLUS_EXACT_TRIGGER_AND_DEPENDENCY_MATCHES',
   'paths',ARRAY['name','source_token','dependency','trigger_attachment'],'source_tokens',(SELECT pg_catalog.jsonb_agg(token ORDER BY token) FROM tokens),
   'routine_discovery_complete',false,'unrecorded_or_dynamic_or_transitive_references_proven_absent',false,
   'application_catalog_only',true,'raw_nodes_only',true,'deparsers_used',false,'semantics_verified',false,
   'target_absence_is_recorded_not_failure',true,'preference_columns','CONTENT_SWITCHES_AND_ENABLED_SINCE_PLUS_USER_ID_ONLY',
   'execute_acl_meaning','EXPLICIT_OR_BUILTIN_DEFAULT_ACL_WITH_MEMBERSHIP_EVIDENCE_NOT_RUNTIME_ROLE_SIMULATION',
   'default_acl_meaning','CREATION_TIME_DEFAULTS_NOT_RETROACTIVE_AUTHORITY',
   'external_language_source_not_collected',true,'source_redaction_is_not_complete_secret_detection',true),
  'publication_semantics',pg_catalog.jsonb_build_object('classification','RAW_EVIDENCE_REQUIRES_MANUAL_INTERPRETATION',
   'unresolved',ARRAY['first_story_publication_timestamp','chapter_publication_timestamp','draft_edit_unpublish_republish_behavior',
    'publication_event_idempotency','publication_references_and_timestamps','publication_writers','content_event_capture',
    'content_event_lease_fanout','content_claim_prepare_finish','content_event_expiry']),
  'evidence',CASE WHEN pg_catalog.octet_length(s.j::pg_catalog.text)<=l.output_bytes THEN s.j END,
  'application_rows_read',0,'runtime_rpc_calls',0,'mutations',0,
  'transaction_read_only',pg_catalog.current_setting('transaction_read_only')='on',
  'installation_authorized',false,'production_execution_authorized',false,'manual_review_required',true
 ) AS diagnostic
FROM sections s CROSS JOIN limits l;

ROLLBACK;
