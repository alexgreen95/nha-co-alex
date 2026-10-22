-- PostgreSQL 17 RAW catalog collector; NOT executable-definition collection.
-- Manual production execution is NOT authorized by this artifact.
-- Discovery: public routines whose names contain both push and prefer, OR whose
-- raw prosrc contains the push_preferences identifier token, OR whose recorded
-- dependency points to the relation/row type. Text matches include false positives.
-- Constructed dynamic names, transitive helpers and other schemas are outside
-- this rule; their absence is NOT proven. No discovered code is evaluated.
-- Completeness means complete RAW evidence under this rule, NEVER verified
-- semantics, a reconstructed function definition, or transport authorization.
-- Defaults, policies, expressions and parsed SQL bodies remain inert node text.
-- No routine/expression/index deparsers or formatted object-identity casts.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL search_path = '';
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '20s';
SET LOCAL transaction_timeout = '30s';

WITH RECURSIVE
limits AS (
 SELECT 64 AS routines,128 AS columns,128 AS constraints,128 AS indexes,
  64 AS policies,256 AS roles,1024 AS memberships,2048 AS dependencies,
  1024 AS shared_dependencies,256 AS default_acls,1024 AS types,
  4096 AS acl_entries,2097152 AS output_bytes
),
catalog_ids AS MATERIALIZED (
 SELECT c.oid,c.relname FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='pg_catalog' AND c.relname IN ('pg_class','pg_proc','pg_type','pg_default_acl')
),
schema_meta AS MATERIALIZED (
 SELECT n.oid,n.nspname,n.nspowner,n.nspacl FROM pg_catalog.pg_namespace n WHERE n.nspname='public'
),
target AS MATERIALIZED (
 SELECT c.* FROM pg_catalog.pg_class c JOIN schema_meta n ON n.oid=c.relnamespace
 WHERE c.relname='push_preferences'
),
columns_all AS MATERIALIZED (
 SELECT a.*,d.oid AS default_oid,d.adrelid,d.adnum,d.adbin::pg_catalog.text AS default_node
 FROM pg_catalog.pg_attribute a JOIN target t ON t.oid=a.attrelid
 LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attnum>0
),
constraints_all AS MATERIALIZED (
 SELECT c.* FROM pg_catalog.pg_constraint c JOIN target t ON t.oid=c.conrelid
),
indexes_all AS MATERIALIZED (
 SELECT i.*,c.relname,c.relnamespace,c.relowner,c.relkind,c.relam
 FROM pg_catalog.pg_index i JOIN target t ON t.oid=i.indrelid
 JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
),
policies_all AS MATERIALIZED (
 SELECT p.* FROM pg_catalog.pg_policy p JOIN target t ON t.oid=p.polrelid
),
relation_edges AS MATERIALIZED (
 SELECT d.* FROM pg_catalog.pg_depend d CROSS JOIN target t
 WHERE d.classid=(SELECT oid FROM catalog_ids WHERE relname='pg_proc')
  AND ((d.refclassid=(SELECT oid FROM catalog_ids WHERE relname='pg_class') AND d.refobjid=t.oid)
   OR (d.refclassid=(SELECT oid FROM catalog_ids WHERE relname='pg_type') AND d.refobjid=t.reltype))
),
candidate_all AS MATERIALIZED (
 SELECT p.*,n.nspname,l.lanname,
  (pg_catalog.lower(p.proname) LIKE '%push%' AND pg_catalog.lower(p.proname) LIKE '%prefer%') AS name_match,
  (pg_catalog.lower(p.prosrc) ~ '(^|[^a-z0-9_$])push_preferences([^a-z0-9_$]|$)') AS body_token_match,
  EXISTS(SELECT 1 FROM relation_edges d WHERE d.objid=p.oid) AS catalog_dependency_match
 FROM pg_catalog.pg_proc p JOIN schema_meta n ON n.oid=p.pronamespace
 LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE (pg_catalog.lower(p.proname) LIKE '%push%' AND pg_catalog.lower(p.proname) LIKE '%prefer%')
  OR pg_catalog.lower(p.prosrc) ~ '(^|[^a-z0-9_$])push_preferences([^a-z0-9_$]|$)'
  OR EXISTS(SELECT 1 FROM relation_edges d WHERE d.objid=p.oid)
),
candidates AS MATERIALIZED (
 SELECT * FROM candidate_all ORDER BY oid LIMIT (SELECT routines FROM limits)
),
-- Built-in NULL-ACL defaults describe existing object privileges; pg_default_acl
-- rows describe creation-time defaults only, not retroactive grants/revokes.
default_acls_all AS MATERIALIZED (
 SELECT a.* FROM pg_catalog.pg_default_acl a
 WHERE a.defaclnamespace=0 OR a.defaclnamespace IN (SELECT oid FROM schema_meta)
),
relevant_default_acls AS MATERIALIZED (
 SELECT a.* FROM default_acls_all a WHERE a.defaclrole IN (
  SELECT proowner FROM candidate_all UNION SELECT relowner FROM target UNION SELECT nspowner FROM schema_meta)
),
acl_rows_all AS MATERIALIZED (
 SELECT 'relation'::pg_catalog.text AS scope,t.oid AS object_oid,0 AS attnum,x.*
 FROM target t CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(t.relacl,pg_catalog.acldefault('r',t.relowner))) x
 UNION ALL
 SELECT 'column',a.attrelid,a.attnum,x.* FROM columns_all a
 CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
 UNION ALL
 SELECT 'routine',p.oid,0,x.* FROM candidates p
 CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) x
 UNION ALL
 SELECT 'schema',n.oid,0,x.* FROM schema_meta n
 CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) x
 UNION ALL
 SELECT 'default_acl',a.oid,0,x.* FROM relevant_default_acls a
 CROSS JOIN LATERAL pg_catalog.aclexplode(a.defaclacl) x
),
role_roots AS (
 SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator','nca_push_api','postgres')
 UNION SELECT relowner FROM target UNION SELECT proowner FROM candidate_all
 UNION SELECT nspowner FROM schema_meta UNION SELECT defaclrole FROM relevant_default_acls
 UNION SELECT grantor FROM acl_rows_all UNION SELECT grantee FROM acl_rows_all WHERE grantee<>0
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
  r.rolcanlogin,r.rolreplication,r.rolbypassrls
 FROM pg_catalog.pg_roles r JOIN role_reach x ON x.oid=r.oid
),
memberships_all AS MATERIALIZED (
 SELECT m.roleid,m.member,m.grantor,m.admin_option,m.inherit_option,m.set_option
 FROM pg_catalog.pg_auth_members m JOIN role_reach x ON x.oid=m.member
),
type_ids AS MATERIALIZED (
 SELECT atttypid AS oid FROM columns_all WHERE NOT attisdropped
 UNION SELECT prorettype FROM candidates
 UNION SELECT pg_catalog.unnest(proargtypes::pg_catalog.oid[]) FROM candidates
 UNION SELECT pg_catalog.unnest(proallargtypes) FROM candidates
 UNION SELECT pg_catalog.unnest(protrftypes) FROM candidates
 UNION SELECT reltype FROM target
),
types_all AS MATERIALIZED (
 SELECT t.oid,t.typnamespace,n.nspname,t.typname,t.typtype,t.typowner,t.typbasetype,
  t.typtypmod,t.typelem,t.typrelid,t.typnotnull,t.typdefaultbin::pg_catalog.text AS default_node,
  t.typinput::pg_catalog.oid AS input_oid,t.typoutput::pg_catalog.oid AS output_oid,
  t.typmodin::pg_catalog.oid AS typmodin_oid,t.typmodout::pg_catalog.oid AS typmodout_oid
 FROM type_ids x JOIN pg_catalog.pg_type t ON t.oid=x.oid
 JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
),
source_status AS MATERIALIZED (
 SELECT p.oid,
  COALESCE((p.lanname IN ('sql','plpgsql') AND p.prosqlbody IS NULL AND p.probin IS NULL
   AND pg_catalog.btrim(p.prosrc)<>'' AND NOT EXISTS(
    SELECT 1 FROM pg_catalog.unnest(COALESCE(p.proallargtypes,p.proargtypes::pg_catalog.oid[])||ARRAY[p.prorettype]) x(oid)
    LEFT JOIN types_all t ON t.oid=x.oid WHERE t.oid IS NULL OR t.nspname<>'pg_catalog' OR t.typtype='d')),false) AS source_evidence_complete
 FROM candidates p
),
-- Edges involving the candidates/relation, plus outgoing edges of their types.
-- No inbound scan of every object depending on a shared built-in type.
dependencies_all AS MATERIALIZED (
 SELECT d.* FROM pg_catalog.pg_depend d WHERE
  (d.classid=(SELECT oid FROM catalog_ids WHERE relname='pg_proc') AND d.objid IN (SELECT oid FROM candidate_all))
  OR (d.refclassid=(SELECT oid FROM catalog_ids WHERE relname='pg_proc') AND d.refobjid IN (SELECT oid FROM candidate_all))
  OR (d.classid=(SELECT oid FROM catalog_ids WHERE relname='pg_class') AND d.objid IN (SELECT oid FROM target))
  OR (d.refclassid=(SELECT oid FROM catalog_ids WHERE relname='pg_class') AND d.refobjid IN (SELECT oid FROM target))
  OR (d.classid=(SELECT oid FROM catalog_ids WHERE relname='pg_type') AND d.objid IN (SELECT oid FROM type_ids))
),
shared_dependencies_all AS MATERIALIZED (
 SELECT d.* FROM pg_catalog.pg_shdepend d
 JOIN pg_catalog.pg_database db ON db.oid=d.dbid AND db.datname=pg_catalog.current_database()
 WHERE (d.classid=(SELECT oid FROM catalog_ids WHERE relname='pg_proc') AND d.objid IN (SELECT oid FROM candidate_all))
  OR (d.classid=(SELECT oid FROM catalog_ids WHERE relname='pg_class') AND d.objid IN (SELECT oid FROM target))
  OR (d.classid=(SELECT oid FROM catalog_ids WHERE relname='pg_type') AND d.objid IN (SELECT oid FROM type_ids))
  OR (d.classid=(SELECT oid FROM catalog_ids WHERE relname='pg_default_acl') AND d.objid IN (SELECT oid FROM relevant_default_acls))
),
relation_out AS (
 SELECT pg_catalog.jsonb_build_object('oid',t.oid,'relname',t.relname,'relnamespace',t.relnamespace,
  'schema','public','relkind',t.relkind,'relowner',t.relowner,'owner',r.rolname,
  'relrowsecurity',t.relrowsecurity,'relforcerowsecurity',t.relforcerowsecurity,
  'reltype',t.reltype,'relacl_is_null',t.relacl IS NULL,'relacl',t.relacl::pg_catalog.text) AS j
 FROM target t LEFT JOIN pg_catalog.pg_roles r ON r.oid=t.relowner
),
columns_out AS (
 SELECT pg_catalog.jsonb_build_object('attnum',a.attnum,'attname',a.attname,'attisdropped',a.attisdropped,
  'atttypid',a.atttypid,'atttypmod',a.atttypmod,'attnotnull',a.attnotnull,'atthasdef',a.atthasdef,
  'attidentity',a.attidentity,'attgenerated',a.attgenerated,'attcollation',a.attcollation,
  'attrdef_oid',a.default_oid,'adrelid',a.adrelid,'adnum',a.adnum,'adbin',a.default_node,
  'attacl',a.attacl::pg_catalog.text) AS j,a.attnum
 FROM columns_all a ORDER BY a.attnum LIMIT (SELECT columns FROM limits)
),
constraints_out AS (
 SELECT pg_catalog.jsonb_build_object('oid',c.oid,'conname',c.conname,'contype',c.contype,
  'connamespace',c.connamespace,'conrelid',c.conrelid,'contypid',c.contypid,'conkey',c.conkey,
  'confrelid',c.confrelid,'confkey',c.confkey,'convalidated',c.convalidated,
  'condeferrable',c.condeferrable,'condeferred',c.condeferred,'conindid',c.conindid,
  'confupdtype',c.confupdtype,'confdeltype',c.confdeltype,'confmatchtype',c.confmatchtype,
  'conbin',c.conbin::pg_catalog.text) AS j,c.oid
 FROM constraints_all c ORDER BY c.oid LIMIT (SELECT constraints FROM limits)
),
indexes_out AS (
 SELECT pg_catalog.jsonb_build_object('indexrelid',i.indexrelid,'indrelid',i.indrelid,
  'relname',i.relname,'relnamespace',i.relnamespace,'relowner',i.relowner,'relkind',i.relkind,'relam',i.relam,
  'indnatts',i.indnatts,'indnkeyatts',i.indnkeyatts,'indisunique',i.indisunique,'indnullsnotdistinct',i.indnullsnotdistinct,
  'indisprimary',i.indisprimary,'indisexclusion',i.indisexclusion,'indimmediate',i.indimmediate,
  'indisvalid',i.indisvalid,'indisready',i.indisready,'indislive',i.indislive,
  'indkey',i.indkey::pg_catalog.int2[],'indclass',i.indclass::pg_catalog.oid[],
  'indcollation',i.indcollation::pg_catalog.oid[],'indoption',i.indoption::pg_catalog.int2[],
  'indexprs',i.indexprs::pg_catalog.text,'indpred',i.indpred::pg_catalog.text) AS j,i.indexrelid
 FROM indexes_all i ORDER BY i.indexrelid LIMIT (SELECT indexes FROM limits)
),
policies_out AS (
 SELECT pg_catalog.jsonb_build_object('oid',p.oid,'polname',p.polname,'polrelid',p.polrelid,'polcmd',p.polcmd,
  'polpermissive',p.polpermissive,'polroles',p.polroles,
  'polqual',p.polqual::pg_catalog.text,'polwithcheck',p.polwithcheck::pg_catalog.text) AS j,p.oid
 FROM policies_all p ORDER BY p.oid LIMIT (SELECT policies FROM limits)
),
routines_out AS (
 SELECT pg_catalog.jsonb_build_object('oid',p.oid,'proname',p.proname,'pronamespace',p.pronamespace,'schema',p.nspname,
  'discovery',pg_catalog.jsonb_build_object('name',p.name_match,'source_token',p.body_token_match,'dependency',p.catalog_dependency_match),
  'proowner',p.proowner,'owner',r.rolname,'prolang',p.prolang,'language',p.lanname,
  'prokind',p.prokind,'provolatile',p.provolatile,'proparallel',p.proparallel,
  'proisstrict',p.proisstrict,'prosecdef',p.prosecdef,'proleakproof',p.proleakproof,'proretset',p.proretset,
  'prorettype',p.prorettype,'pronargs',p.pronargs,'pronargdefaults',p.pronargdefaults,
  'proargtypes',p.proargtypes::pg_catalog.oid[],'proallargtypes',p.proallargtypes,'proargmodes',p.proargmodes,'proargnames',p.proargnames,
  'proargdefaults',p.proargdefaults::pg_catalog.text,'protrftypes',p.protrftypes,'prosupport_oid',p.prosupport::pg_catalog.oid,
  'proconfig',p.proconfig,'proacl_is_null',p.proacl IS NULL,'proacl',p.proacl::pg_catalog.text,
  'prosrc',p.prosrc,'probin',p.probin,'prosqlbody',p.prosqlbody::pg_catalog.text,
  'protransform_catalog_field_available',false,
  'source_evidence_complete',s.source_evidence_complete,
  'source_incomplete_reason',CASE WHEN NOT s.source_evidence_complete THEN 'NON_TEXT_BODY_OR_EXTERNAL_LANGUAGE_OR_CUSTOM_SIGNATURE_REQUIRES_REVIEW' END
 ) AS j,p.oid
 FROM candidates p JOIN source_status s ON s.oid=p.oid LEFT JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
),
sections AS (
 SELECT pg_catalog.jsonb_build_object(
  'relation',(SELECT j FROM relation_out),
  'schema',(SELECT pg_catalog.jsonb_build_object('oid',n.oid,'nspname',n.nspname,'nspowner',n.nspowner,
   'nspacl',n.nspacl::pg_catalog.text,'nspacl_is_null',n.nspacl IS NULL) FROM schema_meta n),
  'columns',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY attnum) FROM columns_out),'[]'::pg_catalog.jsonb),
  'constraints',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY oid) FROM constraints_out),'[]'::pg_catalog.jsonb),
  'indexes',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY indexrelid) FROM indexes_out),'[]'::pg_catalog.jsonb),
  'policies',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY oid) FROM policies_out),'[]'::pg_catalog.jsonb),
  'types',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.oid) FROM
   (SELECT * FROM types_all ORDER BY oid LIMIT (SELECT types FROM limits)) x),'[]'::pg_catalog.jsonb),
  'routines',COALESCE((SELECT pg_catalog.jsonb_agg(j ORDER BY oid) FROM routines_out),'[]'::pg_catalog.jsonb),
  'acl_entries',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.scope,x.object_oid,x.attnum,x.grantee,x.grantor,x.privilege_type) FROM
   (SELECT a.*,g.rolname AS grantor_name,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee_name
    FROM acl_rows_all a LEFT JOIN pg_catalog.pg_roles g ON g.oid=a.grantor LEFT JOIN pg_catalog.pg_roles r ON r.oid=a.grantee
    ORDER BY a.scope,a.object_oid,a.attnum,a.grantee,a.grantor,a.privilege_type LIMIT (SELECT acl_entries FROM limits)) x),'[]'::pg_catalog.jsonb),
  'default_acls',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',x.oid,'defaclrole',x.defaclrole,
   'defaclnamespace',x.defaclnamespace,'defaclobjtype',x.defaclobjtype,'defaclacl',x.defaclacl::pg_catalog.text) ORDER BY x.oid) FROM
   (SELECT * FROM relevant_default_acls ORDER BY oid LIMIT (SELECT default_acls FROM limits)) x),'[]'::pg_catalog.jsonb),
  'roles',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.oid) FROM
   (SELECT * FROM roles_all ORDER BY oid LIMIT (SELECT roles FROM limits)) x),'[]'::pg_catalog.jsonb),
  'memberships',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.member,x.roleid,x.grantor) FROM
   (SELECT * FROM memberships_all ORDER BY member,roleid,grantor LIMIT (SELECT memberships FROM limits)) x),'[]'::pg_catalog.jsonb),
  'dependencies',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.classid,x.objid,x.objsubid,x.refclassid,x.refobjid,x.refobjsubid,x.deptype) FROM
   (SELECT * FROM dependencies_all ORDER BY classid,objid,objsubid,refclassid,refobjid,refobjsubid,deptype LIMIT (SELECT dependencies FROM limits)) x),'[]'::pg_catalog.jsonb),
  'shared_dependencies',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.dbid,x.classid,x.objid,x.objsubid,x.refclassid,x.refobjid,x.deptype) FROM
   (SELECT * FROM shared_dependencies_all ORDER BY dbid,classid,objid,objsubid,refclassid,refobjid,deptype LIMIT (SELECT shared_dependencies FROM limits)) x),'[]'::pg_catalog.jsonb)
 ) AS j
),
counts AS (
 SELECT (SELECT pg_catalog.count(*) FROM target) AS relations,
  (SELECT pg_catalog.count(*) FROM catalog_ids) AS catalog_ids,
  (SELECT pg_catalog.count(*) FROM columns_all) AS columns,
  (SELECT pg_catalog.count(*) FROM constraints_all) AS constraints,
  (SELECT pg_catalog.count(*) FROM indexes_all) AS indexes,
  (SELECT pg_catalog.count(*) FROM policies_all) AS policies,
  (SELECT pg_catalog.count(*) FROM candidate_all) AS candidate_routines,
  (SELECT pg_catalog.count(*) FROM types_all) AS types,
  (SELECT pg_catalog.count(*) FROM roles_all) AS roles,
  (SELECT pg_catalog.count(*) FROM memberships_all) AS memberships,
  (SELECT pg_catalog.count(*) FROM relevant_default_acls) AS default_acls,
  (SELECT pg_catalog.count(*) FROM acl_rows_all) AS acl_entries,
  (SELECT pg_catalog.count(*) FROM dependencies_all) AS dependencies,
  (SELECT pg_catalog.count(*) FROM shared_dependencies_all) AS shared_dependencies
),
reasons AS (
 SELECT 'RELATION_MISSING_OR_UNSUPPORTED' AS reason WHERE NOT EXISTS(SELECT 1 FROM target WHERE relkind IN ('r','p'))
 UNION ALL SELECT 'CATALOG_IDENTITIES_UNRESOLVED' FROM counts c WHERE c.catalog_ids<>4
 UNION ALL SELECT 'NO_CANDIDATE_ROUTINES' WHERE NOT EXISTS(SELECT 1 FROM candidate_all)
 UNION ALL SELECT 'CANDIDATE_CAP_EXCEEDED' FROM counts c,limits l WHERE c.candidate_routines>l.routines
 UNION ALL SELECT 'COLUMN_CAP_EXCEEDED' FROM counts c,limits l WHERE c.columns>l.columns
 UNION ALL SELECT 'CONSTRAINT_CAP_EXCEEDED' FROM counts c,limits l WHERE c.constraints>l.constraints
 UNION ALL SELECT 'INDEX_CAP_EXCEEDED' FROM counts c,limits l WHERE c.indexes>l.indexes
 UNION ALL SELECT 'POLICY_CAP_EXCEEDED' FROM counts c,limits l WHERE c.policies>l.policies
 UNION ALL SELECT 'TYPE_CAP_EXCEEDED' FROM counts c,limits l WHERE c.types>l.types
 UNION ALL SELECT 'ROLE_CAP_EXCEEDED' FROM counts c,limits l WHERE c.roles>l.roles
 UNION ALL SELECT 'MEMBERSHIP_CAP_EXCEEDED' FROM counts c,limits l WHERE c.memberships>l.memberships
 UNION ALL SELECT 'DEFAULT_ACL_CAP_EXCEEDED' FROM counts c,limits l WHERE c.default_acls>l.default_acls
 UNION ALL SELECT 'ACL_CAP_EXCEEDED' FROM counts c,limits l WHERE c.acl_entries>l.acl_entries
 UNION ALL SELECT 'DEPENDENCY_CAP_EXCEEDED' FROM counts c,limits l WHERE c.dependencies>l.dependencies
 UNION ALL SELECT 'SHARED_DEPENDENCY_CAP_EXCEEDED' FROM counts c,limits l WHERE c.shared_dependencies>l.shared_dependencies
 UNION ALL SELECT 'TYPE_IDENTITY_UNRESOLVED' WHERE EXISTS(SELECT 1 FROM type_ids x LEFT JOIN types_all t ON t.oid=x.oid WHERE t.oid IS NULL)
 UNION ALL SELECT 'ROLE_IDENTITY_UNRESOLVED' WHERE EXISTS(SELECT 1 FROM role_reach x LEFT JOIN roles_all r ON r.oid=x.oid WHERE r.oid IS NULL)
 UNION ALL SELECT 'ROUTINE_LANGUAGE_UNRESOLVED' WHERE EXISTS(SELECT 1 FROM candidates WHERE lanname IS NULL)
 UNION ALL SELECT 'SOURCE_REPRESENTATION_INCOMPLETE:'||s.oid::pg_catalog.text FROM source_status s WHERE NOT s.source_evidence_complete
 UNION ALL SELECT 'OUTPUT_CAP_EXCEEDED' FROM sections s,limits l WHERE pg_catalog.octet_length(s.j::pg_catalog.text)>l.output_bytes
),
flags AS (
 SELECT
  NOT EXISTS(SELECT 1 FROM reasons WHERE reason IN ('RELATION_MISSING_OR_UNSUPPORTED','COLUMN_CAP_EXCEEDED','CONSTRAINT_CAP_EXCEEDED','INDEX_CAP_EXCEEDED','POLICY_CAP_EXCEEDED','TYPE_CAP_EXCEEDED','TYPE_IDENTITY_UNRESOLVED','OUTPUT_CAP_EXCEEDED')) AS relation_catalog_collected,
  NOT EXISTS(SELECT 1 FROM reasons WHERE reason IN ('CATALOG_IDENTITIES_UNRESOLVED','CANDIDATE_CAP_EXCEEDED','OUTPUT_CAP_EXCEEDED')) AS candidate_discovery_complete_under_stated_rule,
  EXISTS(SELECT 1 FROM candidates) AND NOT EXISTS(SELECT 1 FROM reasons WHERE reason IN ('CANDIDATE_CAP_EXCEEDED','TYPE_CAP_EXCEEDED','TYPE_IDENTITY_UNRESOLVED','ROUTINE_LANGUAGE_UNRESOLVED','OUTPUT_CAP_EXCEEDED')) AS raw_routine_metadata_collected,
  EXISTS(SELECT 1 FROM candidates) AND NOT EXISTS(SELECT 1 FROM reasons WHERE reason='CANDIDATE_CAP_EXCEEDED' OR reason='OUTPUT_CAP_EXCEEDED' OR reason LIKE 'SOURCE_REPRESENTATION_INCOMPLETE:%') AS raw_routine_source_collected,
  EXISTS(SELECT 1 FROM target) AND NOT EXISTS(SELECT 1 FROM reasons WHERE reason IN ('CANDIDATE_CAP_EXCEEDED','COLUMN_CAP_EXCEEDED','POLICY_CAP_EXCEEDED','ROLE_CAP_EXCEEDED','ROLE_IDENTITY_UNRESOLVED','MEMBERSHIP_CAP_EXCEEDED','DEFAULT_ACL_CAP_EXCEEDED','ACL_CAP_EXCEEDED','OUTPUT_CAP_EXCEEDED')) AS acl_evidence_collected,
  NOT EXISTS(SELECT 1 FROM reasons WHERE reason IN ('CATALOG_IDENTITIES_UNRESOLVED','CANDIDATE_CAP_EXCEEDED','DEPENDENCY_CAP_EXCEEDED','SHARED_DEPENDENCY_CAP_EXCEEDED','OUTPUT_CAP_EXCEEDED')) AS dependency_evidence_collected
)
SELECT 'PUSH_PREFERENCES_RAW_CONTRACT_COLLECTOR_COMPLETE' AS marker,
 pg_catalog.jsonb_build_object(
  'snapshot_timestamp',pg_catalog.statement_timestamp(),'server_version',pg_catalog.current_setting('server_version'),
  'current_user',CURRENT_USER,'session_user',SESSION_USER,'transaction_read_only',pg_catalog.current_setting('transaction_read_only'),
  'discovery_rule','PUBLIC_NAME_PUSH_AND_PREFER_OR_SOURCE_IDENTIFIER_TOKEN_OR_DIRECT_RELATION_OR_ROWTYPE_DEPENDENCY',
  'completeness_meaning','COMPLETE_RAW_CATALOG_EVIDENCE_UNDER_STATED_RULE_NOT_VERIFIED_SEMANTICS',
  'discovery_outside_rule_proven_absent',false,
  'source_completeness_meaning','TEXT_SQL_OR_PLPGSQL_BODY_AND_BUILTIN_SIGNATURE_NOT_TRANSITIVE_SEMANTICS',
  'default_acl_meaning','CREATION_TIME_DEFAULTS_NOT_RETROACTIVE_EXISTING_OBJECT_AUTHORITY',
  'relation_catalog_collected',f.relation_catalog_collected,
  'candidate_discovery_complete_under_stated_rule',f.candidate_discovery_complete_under_stated_rule,
  'raw_routine_metadata_collected',f.raw_routine_metadata_collected,'raw_routine_source_collected',f.raw_routine_source_collected,
  'acl_evidence_collected',f.acl_evidence_collected,'dependency_evidence_collected',f.dependency_evidence_collected,
  'executable_deparsers_used',false,'function_definitions_collected',false,
  'raw_contract_evidence_collected',NOT EXISTS(SELECT 1 FROM reasons),'evidence_complete',NOT EXISTS(SELECT 1 FROM reasons),
  'semantics_verified',false,'manual_review_required',true,'transport_decision','MANUAL_REVIEW_REQUIRED',
  'incomplete_reasons',COALESCE((SELECT pg_catalog.jsonb_agg(reason ORDER BY reason) FROM reasons),'[]'::pg_catalog.jsonb),
  'counts',(SELECT pg_catalog.to_jsonb(c) FROM counts c),'limits',(SELECT pg_catalog.to_jsonb(l) FROM limits l),
  'evidence',CASE WHEN pg_catalog.octet_length(s.j::pg_catalog.text)<=l.output_bytes THEN s.j END,
  'runtime_rpc_calls',0,'application_rows_read',0,'mutations',0,
  'production_execution_authorized',false,'installation_authorized',false,'transport_authorized',false
 ) AS diagnostic
FROM sections s CROSS JOIN limits l CROSS JOIN flags f;

ROLLBACK;
