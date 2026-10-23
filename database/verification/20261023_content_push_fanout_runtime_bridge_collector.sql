BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';

WITH runner AS (
 SELECT pg_catalog.to_regrole('nca_push_fanout_runner')::pg_catalog.oid AS oid
)
SELECT pg_catalog.jsonb_build_object(
 'server_version_num',pg_catalog.current_setting('server_version_num'),
 'current_user',CURRENT_USER,'session_user',SESSION_USER,
 'runner_role',(SELECT pg_catalog.to_jsonb(r) - 'oid' FROM pg_catalog.pg_roles r WHERE r.oid=runner.oid),
 'runner_password_unset',(SELECT a.rolpassword IS NULL FROM pg_catalog.pg_authid a WHERE a.oid=runner.oid),
 'runner_memberships',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'role',parent.rolname,'member',member.rolname,'grantor',grantor.rolname,'grantor_is_superuser',grantor.rolsuper,
   'admin_option',m.admin_option,
   'inherit_option',m.inherit_option,'set_option',m.set_option)
   ORDER BY parent.rolname,member.rolname)
  FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid
   JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles grantor ON grantor.oid=m.grantor
  WHERE parent.oid=runner.oid OR member.oid=runner.oid),'[]'::pg_catalog.jsonb),
 'runner_schema_privileges',(SELECT pg_catalog.jsonb_build_object('usage',pg_catalog.has_schema_privilege(runner.oid,'public','USAGE'),
   'create',pg_catalog.has_schema_privilege(runner.oid,'public','CREATE'))),
 'runner_relations',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('schema',n.nspname,'relation',c.relname,
   'kind',c.relkind,'select',pg_catalog.has_table_privilege(runner.oid,c.oid,'SELECT'),
   'insert',pg_catalog.has_table_privilege(runner.oid,c.oid,'INSERT'),
   'update',pg_catalog.has_table_privilege(runner.oid,c.oid,'UPDATE'),
   'delete',pg_catalog.has_table_privilege(runner.oid,c.oid,'DELETE'),
   'truncate',pg_catalog.has_table_privilege(runner.oid,c.oid,'TRUNCATE'),
   'references',pg_catalog.has_table_privilege(runner.oid,c.oid,'REFERENCES'),
   'trigger',pg_catalog.has_table_privilege(runner.oid,c.oid,'TRIGGER'),
   'maintain',pg_catalog.has_table_privilege(runner.oid,c.oid,'MAINTAIN'),
   'columns',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',a.attname,
    'select',pg_catalog.has_column_privilege(runner.oid,c.oid,a.attnum,'SELECT'),
    'insert',pg_catalog.has_column_privilege(runner.oid,c.oid,a.attnum,'INSERT'),
    'update',pg_catalog.has_column_privilege(runner.oid,c.oid,a.attnum,'UPDATE'),
    'references',pg_catalog.has_column_privilege(runner.oid,c.oid,a.attnum,'REFERENCES')) ORDER BY a.attnum)
    FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::pg_catalog.jsonb))
   ORDER BY n.nspname,c.relname)
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('stories','chapters','content_publication_clock','content_publication_state',
   'content_publications','push_content_events','push_preferences','push_subscriptions','push_deliveries')),'[]'::pg_catalog.jsonb),
 'wrappers',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('schema',n.nspname,'name',p.proname,
   'identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),'return_type',pg_catalog.pg_get_function_result(p.oid),
   'owner',owner.rolname,'language',lang.lanname,'security_definer',p.prosecdef,'volatility',p.provolatile,
   'strict',p.proisstrict,'leakproof',p.proleakproof,'returns_set',p.proretset,'kind',p.prokind,
   'proconfig',p.proconfig,'source',p.prosrc,'source_md5',pg_catalog.md5(pg_catalog.replace(pg_catalog.replace(p.prosrc,E'\r\n',E'\n'),E'\r',E'\n')),
   'acl',p.proacl::pg_catalog.text,'effective_runner_execute',pg_catalog.has_function_privilege(runner.oid,p.oid,'EXECUTE'))
   ORDER BY p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid))
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner JOIN pg_catalog.pg_language lang ON lang.oid=p.prolang
  WHERE n.nspname='public' AND p.proname IN ('nca_runner_claim_content_push_events','nca_runner_fanout_content_push_event_page')),'[]'::pg_catalog.jsonb),
 'underlying_fanout_routines',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('schema',n.nspname,
   'name',p.proname,'identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),'owner',owner.rolname,
   'security_definer',p.prosecdef,'proconfig',p.proconfig,'source_md5',pg_catalog.md5(pg_catalog.replace(pg_catalog.replace(p.prosrc,E'\r\n',E'\n'),E'\r',E'\n')),
   'acl',p.proacl::pg_catalog.text,'runner_execute',pg_catalog.has_function_privilege(runner.oid,p.oid,'EXECUTE'),
   'fanout_execute',pg_catalog.has_function_privilege('nca_push_fanout',p.oid,'EXECUTE')) ORDER BY p.proname)
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
  WHERE n.nspname='public' AND p.proname IN ('nca_claim_content_push_events','nca_fanout_content_push_event_page')),'[]'::pg_catalog.jsonb),
 'fanout_role',(SELECT pg_catalog.to_jsonb(r)-'oid' FROM pg_catalog.pg_roles r WHERE rolname='nca_push_fanout'),
 'fanout_memberships',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',parent.rolname,
   'member',member.rolname,'grantor',grantor.rolname,'admin_option',m.admin_option,'inherit_option',m.inherit_option,'set_option',m.set_option)
   ORDER BY parent.rolname,member.rolname)
  FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid
   JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles grantor ON grantor.oid=m.grantor
  WHERE parent.rolname='nca_push_fanout' OR member.rolname='nca_push_fanout'),'[]'::pg_catalog.jsonb),
 'relevant_dependencies',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('dependent',dependent.proname,
   'referenced',referenced.proname,'dependency_type',d.deptype)
   ORDER BY dependent.proname,referenced.proname,d.deptype)
  FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_proc dependent ON d.classid='pg_catalog.pg_proc'::pg_catalog.regclass AND dependent.oid=d.objid
   JOIN pg_catalog.pg_proc referenced ON d.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass AND referenced.oid=d.refobjid
  JOIN pg_catalog.pg_namespace dn ON dn.oid=dependent.pronamespace JOIN pg_catalog.pg_namespace rn ON rn.oid=referenced.pronamespace
  WHERE dn.nspname='public' AND rn.nspname='public'
   AND dependent.proname IN ('nca_runner_claim_content_push_events','nca_runner_fanout_content_push_event_page')
   AND referenced.proname IN ('nca_claim_content_push_events','nca_fanout_content_push_event_page')),'[]'::pg_catalog.jsonb)
) AS content_push_fanout_bridge_catalog_evidence
FROM runner;

SELECT 'CONTENT_PUSH_FANOUT_RUNTIME_BRIDGE_COLLECTOR_COMPLETE' AS result;
ROLLBACK;
