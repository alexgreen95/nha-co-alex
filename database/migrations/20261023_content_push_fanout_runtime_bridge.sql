BEGIN;

DO $preflight$
DECLARE installer pg_catalog.oid; runner pg_catalog.oid;
BEGIN
 IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
 OR pg_catalog.current_setting('server_version_num')<>'170011'
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_INSTALL_CONTEXT'; END IF;
 SELECT oid INTO installer FROM pg_catalog.pg_roles WHERE rolname='postgres' AND (rolsuper OR rolbypassrls);
 IF installer IS NULL THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_INSTALLER'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='nca_push_fanout' AND NOT rolcanlogin AND NOT rolinherit)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='nca_push_fanout_runner')
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_ROLE_COLLISION'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('nca_runner_claim_content_push_events','nca_runner_fanout_content_push_event_page'))
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_ROUTINE_COLLISION'; END IF;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND ((p.proname='nca_claim_content_push_events' AND p.proargtypes='23'::pg_catalog.oidvector)
   OR (p.proname='nca_fanout_content_push_event_page' AND p.proargtypes='20 2950 23'::pg_catalog.oidvector)))<>2
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_BASE_ROUTINES'; END IF;
END;
$preflight$;

-- No password is set. The role cannot authenticate with password auth until a
-- separately authorized secret-provisioning operation establishes one.
CREATE ROLE nca_push_fanout_runner LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
 NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD NULL;
REVOKE ALL ON SCHEMA public FROM nca_push_fanout_runner;
GRANT USAGE ON SCHEMA public TO nca_push_fanout_runner;

CREATE FUNCTION public.nca_runner_claim_content_push_events(p_limit integer) RETURNS pg_catalog.jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'
AS $fn$
 SELECT public.nca_claim_content_push_events($1)
$fn$;

CREATE FUNCTION public.nca_runner_fanout_content_push_event_page(p_event_id bigint,p_lease_token uuid,p_limit integer) RETURNS pg_catalog.jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'
AS $fn$
 SELECT public.nca_fanout_content_push_event_page($1,$2,$3)
$fn$;

REVOKE ALL ON FUNCTION public.nca_runner_claim_content_push_events(integer) FROM PUBLIC,anon,authenticated,service_role,authenticator,nca_push_api,nca_push_sender,nca_push_fanout,nca_push_fanout_runner;
GRANT EXECUTE ON FUNCTION public.nca_runner_claim_content_push_events(integer) TO nca_push_fanout_runner;
REVOKE ALL ON FUNCTION public.nca_runner_fanout_content_push_event_page(bigint,uuid,integer) FROM PUBLIC,anon,authenticated,service_role,authenticator,nca_push_api,nca_push_sender,nca_push_fanout,nca_push_fanout_runner;
GRANT EXECUTE ON FUNCTION public.nca_runner_fanout_content_push_event_page(bigint,uuid,integer) TO nca_push_fanout_runner;

DO $verify$
DECLARE
 installer pg_catalog.oid; runner pg_catalog.oid; fanout pg_catalog.oid; r record;
 wrapper_hashes pg_catalog.jsonb:='{"nca_runner_claim_content_push_events":"c9166747a4412ac9341898bc4951de0c","nca_runner_fanout_content_push_event_page":"477ca15b8dad2e2e56215e0c11a1eebb"}';
 base_hashes pg_catalog.jsonb:='{"nca_capture_content_first_publication":"b24cbf8545839afc8bc0971c5abb5eed","nca_claim_content_push_events":"2d4fee3d093f5e7c2c7582de093727d6","nca_fanout_content_push_event_page":"d82a5508e9e26cbca4fae41322308949","nca_finish_content_push_delivery":"32394859ac08e9603d6391b131f754e9","nca_claim_content_push_deliveries":"fe016517a326762c3129096ed720bcc0","nca_prepare_content_push_delivery":"2ed79c71a627f15aa340d86b16339b7b"}';
 expected_wrapper pg_catalog.oid; allowed pg_catalog.oid; rel record;
BEGIN
 SELECT oid INTO installer FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT oid INTO runner FROM pg_catalog.pg_roles WHERE rolname='nca_push_fanout_runner';
 SELECT oid INTO fanout FROM pg_catalog.pg_roles WHERE rolname='nca_push_fanout';
 IF installer IS NULL OR runner IS NULL OR fanout IS NULL THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_ROLE_MISSING'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=runner AND rolcanlogin AND NOT rolinherit AND NOT rolsuper
   AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
   AND rolconnlimit=-1 AND rolvaliduntil IS NULL AND rolconfig IS NULL)
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_RUNNER_ATTRIBUTES'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=runner OR roleid=runner)
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_RUNNER_MEMBERSHIP'; END IF;
 IF NOT pg_catalog.has_schema_privilege(runner,'public','USAGE') OR pg_catalog.has_schema_privilege(runner,'public','CREATE')
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_SCHEMA_PRIVILEGE'; END IF;
 FOR rel IN SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('stories','chapters','content_publication_clock','content_publication_state',
   'content_publications','push_content_events','push_preferences','push_subscriptions','push_deliveries') LOOP
  IF pg_catalog.has_table_privilege(runner,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR pg_catalog.has_any_column_privilege(runner,rel.oid,'SELECT,INSERT,UPDATE,REFERENCES')
  THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_RELATION_PRIVILEGE'; END IF;
 END LOOP;
 IF pg_catalog.has_function_privilege(runner,'public.nca_claim_content_push_events(integer)','EXECUTE')
  OR pg_catalog.has_function_privilege(runner,'public.nca_fanout_content_push_event_page(bigint,uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_DIRECT_EXECUTE'; END IF;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('nca_runner_claim_content_push_events','nca_runner_fanout_content_push_event_page'))<>2
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_WRAPPER_COUNT'; END IF;
 FOR r IN SELECT p.* FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('nca_runner_claim_content_push_events','nca_runner_fanout_content_push_event_page') LOOP
  expected_wrapper:=CASE WHEN r.proname='nca_runner_claim_content_push_events' THEN
   'public.nca_runner_claim_content_push_events(integer)'::pg_catalog.regprocedure::pg_catalog.oid
   ELSE 'public.nca_runner_fanout_content_push_event_page(bigint,uuid,integer)'::pg_catalog.regprocedure::pg_catalog.oid END;
  IF r.oid<>expected_wrapper OR r.proowner<>installer OR NOT r.prosecdef OR r.provolatile<>'v' OR r.proisstrict
   OR r.proleakproof OR r.proretset OR r.prokind<>'f' OR r.prorettype<>'jsonb'::pg_catalog.regtype
   OR r.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='sql')
   OR r.proconfig IS DISTINCT FROM ARRAY['search_path=""','lock_timeout=2s','statement_timeout=5s']
   OR pg_catalog.md5(pg_catalog.replace(pg_catalog.replace(r.prosrc,E'\r\n',E'\n'),E'\r',E'\n')) IS DISTINCT FROM wrapper_hashes->>r.proname
   OR NOT pg_catalog.has_function_privilege(runner,r.oid,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(r.proacl,pg_catalog.acldefault('f',r.proowner))) a
    WHERE a.grantee NOT IN(installer,runner) OR a.is_grantable)
  THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_WRAPPER_DEFINITION_ACL'; END IF;
 END LOOP;
 FOR r IN SELECT p.* FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('nca_capture_content_first_publication','nca_claim_content_push_events',
   'nca_fanout_content_push_event_page','nca_finish_content_push_delivery','nca_claim_content_push_deliveries','nca_prepare_content_push_delivery') LOOP
  allowed:=CASE WHEN r.proname IN ('nca_claim_content_push_events','nca_fanout_content_push_event_page') THEN fanout
   WHEN r.proname IN ('nca_finish_content_push_delivery','nca_claim_content_push_deliveries','nca_prepare_content_push_delivery')
    THEN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='nca_push_sender') ELSE installer END;
  IF r.proowner<>installer OR NOT r.prosecdef OR r.provolatile<>'v' OR r.proisstrict OR r.proleakproof OR r.proretset OR r.prokind<>'f'
   OR r.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
   OR (r.proname='nca_capture_content_first_publication' AND r.proargtypes::pg_catalog.text IS DISTINCT FROM '')
   OR (r.proname='nca_claim_content_push_events' AND r.proargtypes::pg_catalog.text IS DISTINCT FROM '23')
   OR (r.proname='nca_fanout_content_push_event_page' AND r.proargtypes::pg_catalog.text IS DISTINCT FROM '20 2950 23')
   OR (r.proname='nca_finish_content_push_delivery' AND r.proargtypes::pg_catalog.text IS DISTINCT FROM '2950 2950 25')
   OR (r.proname='nca_claim_content_push_deliveries' AND r.proargtypes::pg_catalog.text IS DISTINCT FROM '23')
   OR (r.proname='nca_prepare_content_push_delivery' AND r.proargtypes::pg_catalog.text IS DISTINCT FROM '2950 2950')
   OR (r.proname='nca_capture_content_first_publication' AND r.prorettype IS DISTINCT FROM 'pg_catalog.trigger'::pg_catalog.regtype)
   OR (r.proname<>'nca_capture_content_first_publication' AND r.prorettype IS DISTINCT FROM 'pg_catalog.jsonb'::pg_catalog.regtype)
   OR r.proconfig IS DISTINCT FROM ARRAY['search_path=""','lock_timeout=2s','statement_timeout=5s']
   OR pg_catalog.md5(pg_catalog.replace(pg_catalog.replace(r.prosrc,E'\r\n',E'\n'),E'\r',E'\n')) IS DISTINCT FROM base_hashes->>r.proname
   OR NOT pg_catalog.has_function_privilege(allowed,r.oid,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(r.proacl,pg_catalog.acldefault('f',r.proowner))) a
    WHERE a.grantee NOT IN(installer,allowed) OR a.is_grantable)
  THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_BASE_ROUTINE_DRIFT'; END IF;
 END LOOP;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('nca_capture_content_first_publication','nca_claim_content_push_events',
   'nca_fanout_content_push_event_page','nca_finish_content_push_delivery','nca_claim_content_push_deliveries','nca_prepare_content_push_delivery'))<>6
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_BASE_ROUTINE_COUNT'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('nca_claim_content_push_deliveries','nca_prepare_content_push_delivery',
   'nca_finish_content_push_delivery','nca_claim_personal_push_deliveries','nca_prepare_personal_push_delivery','nca_finish_personal_push_delivery')
   AND pg_catalog.has_function_privilege(runner,p.oid,'EXECUTE'))
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_UNRELATED_EXECUTE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=fanout AND NOT rolcanlogin AND NOT rolinherit
   AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=fanout)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE roleid=fanout AND member<>installer)
 THEN RAISE EXCEPTION 'NCA_FANOUT_BRIDGE_FANOUT_BOUNDARY'; END IF;
END;
$verify$;

SELECT 'CONTENT_PUSH_FANOUT_RUNTIME_BRIDGE_INSTALLED' AS result;
COMMIT;
