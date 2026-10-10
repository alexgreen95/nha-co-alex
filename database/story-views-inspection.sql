-- READ ONLY. No data, policy, function or schema is changed.
-- Run in Supabase SQL Editor and copy the complete story_views_diagnostics JSON.
-- Row estimates come from statistics; this does not COUNT/scan the view history.
SELECT jsonb_build_object(
  'server_version', current_setting('server_version'),
  'columns', (
    SELECT jsonb_agg(to_jsonb(c))
    FROM (
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('story_views', 'stories')
      ORDER BY table_name, ordinal_position
    ) c
  ),
  'tables', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', c.relname, 'kind', c.relkind,
      'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity,
      'estimated_rows', s.n_live_tup,
      'total_bytes', pg_catalog.pg_total_relation_size(c.oid)
    ))
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relname IN ('story_views', 'stories')
  ),
  'policies', (
    SELECT jsonb_agg(to_jsonb(p)) FROM pg_catalog.pg_policies p
    WHERE schemaname = 'public' AND tablename IN ('story_views', 'stories')
  ),
  'privileges', (
    SELECT jsonb_agg(jsonb_build_object(
      'role', r.rolname, 'table', c.relname,
      'select', pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT'),
      'insert', pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT'),
      'update', pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE'),
      'delete', pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE')
    ))
    FROM pg_catalog.pg_roles r
    CROSS JOIN pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE r.rolname IN ('anon', 'authenticated')
      AND n.nspname = 'public' AND c.relname IN ('story_views', 'stories')
  ),
  'constraints', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', c.relname, 'name', k.conname,
      'definition', pg_catalog.pg_get_constraintdef(k.oid)
    ))
    FROM pg_catalog.pg_constraint k
    JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('story_views', 'stories')
  ),
  'indexes', (
    SELECT jsonb_agg(to_jsonb(i)) FROM pg_catalog.pg_indexes i
    WHERE schemaname = 'public' AND tablename IN ('story_views', 'stories')
  ),
  'triggers', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', c.relname, 'enabled', t.tgenabled,
      'definition', pg_catalog.pg_get_triggerdef(t.oid),
      'function', pg_catalog.pg_get_functiondef(t.tgfoid)
    ))
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public'
      AND c.relname IN ('story_views', 'stories')
  ),
  'related_functions', (
    SELECT jsonb_agg(jsonb_build_object(
      'definition', pg_catalog.pg_get_functiondef(p.oid),
      'security_definer', p.prosecdef,
      'configuration', p.proconfig,
      'anon_execute', pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_execute', pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ))
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND (
        p.prosrc ILIKE '%story_views%'
        OR p.proname ILIKE '%story%view%'
        OR p.oid IN (
          SELECT d.refobjid
          FROM pg_catalog.pg_depend d
          JOIN pg_catalog.pg_policy pol ON pol.oid = d.objid
          JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
          JOIN pg_catalog.pg_namespace ns ON ns.oid = c.relnamespace
          WHERE d.classid = 'pg_catalog.pg_policy'::regclass
            AND d.refclassid = 'pg_catalog.pg_proc'::regclass
            AND ns.nspname = 'public' AND c.relname IN ('story_views', 'stories')
        )
      )
  )
) AS story_views_diagnostics;
