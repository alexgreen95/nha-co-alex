-- NEW rich PERSONAL push presentation only; never rerun the consumed sender installer.
-- Baseline: 640436fa8234ba30ac1466aae298e06742878a06:
-- database/migrations/20261020_personal_push_sender.sql
-- SHA256 918d9f61e34437c909ff0f1b0f322855bb4192ef43f9df437e90eacf6ab86168
-- No runtime sender calls or application data changes during installation.
-- Apply only in a controlled migration window; drift fails before replacement.
BEGIN;
SET LOCAL search_path = '';
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
DO $guard$
DECLARE p record; owner_oid pg_catalog.oid; sender_oid pg_catalog.oid;
BEGIN
 SELECT oid INTO owner_oid FROM pg_catalog.pg_roles WHERE rolname='postgres';
 SELECT oid INTO sender_oid FROM pg_catalog.pg_roles WHERE rolname='nca_push_sender';
 SELECT f.* INTO p FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
 WHERE n.nspname='public' AND f.proname='nca_prepare_personal_push_delivery'
  AND f.pronargs=2 AND f.proargtypes[0]=2950 AND f.proargtypes[1]=2950;
 IF CURRENT_USER<>'postgres' OR owner_oid IS NULL OR sender_oid IS NULL OR p.oid IS NULL
 OR p.proowner<>owner_oid OR NOT p.prosecdef OR p.provolatile<>'v' OR p.prokind<>'f'
 OR p.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
 OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u' OR p.prorettype<>3802 OR p.proretset
 OR p.pronargdefaults<>0 OR p.proargnames IS DISTINCT FROM ARRAY['p_delivery_id','p_lease_token']
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""','lock_timeout=2s','statement_timeout=5s']
 OR pg_catalog.md5(pg_catalog.replace(p.prosrc,pg_catalog.chr(13),''))<>'8901ee381de45fe1e4af73f219e33207'
 THEN RAISE EXCEPTION 'NCA_RICH_PERSONAL_PREPARE_BASELINE'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  WHERE a.grantee NOT IN(owner_oid,sender_oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
 OR NOT pg_catalog.has_function_privilege(sender_oid,p.oid,'EXECUTE')
 THEN RAISE EXCEPTION 'NCA_RICH_PERSONAL_PREPARE_ACL'; END IF;
 -- The only new relation/column dependencies. Do not assume or grant authority.
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
  AND ((c.relname='profiles' AND a.attname='id' AND a.atttypid=2950)
    OR (c.relname='profiles' AND a.attname='display_name' AND a.atttypid IN(25,1043))
    OR (c.relname='stories' AND a.attname='id' AND a.atttypid=20)
    OR (c.relname='stories' AND a.attname='title' AND a.atttypid IN(25,1043))))<>4
 THEN RAISE EXCEPTION 'NCA_RICH_PERSONAL_METADATA_SCHEMA'; END IF;
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint k
  JOIN pg_catalog.pg_class c ON c.oid=k.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname='id' AND NOT a.attisdropped
  WHERE n.nspname='public' AND c.relname IN ('profiles','stories') AND k.contype='p'
   AND k.conkey=ARRAY[a.attnum] AND NOT k.condeferrable AND k.convalidated)<>2
 THEN RAISE EXCEPTION 'NCA_RICH_PERSONAL_METADATA_IDENTITY'; END IF;
END;
$guard$;
CREATE OR REPLACE FUNCTION public.nca_prepare_personal_push_delivery(p_delivery_id uuid,p_lease_token uuid) RETURNS pg_catalog.jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'
AS $fn$
DECLARE
 d public.push_deliveries%ROWTYPE;
 n public.notifications%ROWTYPE;
 e public.push_personal_events%ROWTYPE;
 pref public.push_preferences%ROWTYPE;
 s public.push_subscriptions%ROWTYPE;
 enabled pg_catalog.bool;
 since_at pg_catalog.timestamptz;
 reason pg_catalog.text;
 actor_display_name pg_catalog.text;
 story_title pg_catalog.text;
BEGIN
 IF p_delivery_id IS NULL OR p_lease_token IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NCA_SENDER_ARGUMENT'; END IF;
 -- Initial unlocked lookup provides only the lock-order locator; never authority.
 SELECT * INTO d FROM public.push_deliveries WHERE id=p_delivery_id;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 IF d.personal_notification_id IS NULL OR d.content_event_id IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_SENDER_NOT_PERSONAL'; END IF;
 SELECT * INTO n FROM public.notifications WHERE id=d.personal_notification_id FOR SHARE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 SELECT * INTO e FROM public.push_personal_events WHERE notification_id=d.personal_notification_id FOR SHARE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 SELECT * INTO pref FROM public.push_preferences WHERE user_id=e.recipient_id FOR SHARE;
 SELECT * INTO s FROM public.push_subscriptions WHERE id=d.subscription_id FOR SHARE;
 SELECT * INTO d FROM public.push_deliveries WHERE id=p_delivery_id FOR UPDATE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status','gone'); END IF;
 IF d.status<>'leased' OR d.lease_token IS DISTINCT FROM p_lease_token
 OR d.lease_until IS NULL OR d.lease_until<=pg_catalog.clock_timestamp()+INTERVAL '15 seconds' THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_SENDER_LEASE_CONFLICT'; END IF;
 enabled:=CASE e.category WHEN 'comment' THEN pref.comment_enabled WHEN 'reply' THEN pref.reply_enabled
  WHEN 'mention' THEN pref.mention_enabled WHEN 'comment_like' THEN pref.comment_like_enabled ELSE false END;
 since_at:=CASE e.category WHEN 'comment' THEN pref.comment_enabled_since WHEN 'reply' THEN pref.reply_enabled_since
  WHEN 'mention' THEN pref.mention_enabled_since WHEN 'comment_like' THEN pref.comment_like_enabled_since END;
 IF n.user_id IS DISTINCT FROM e.recipient_id OR n.type IS DISTINCT FROM e.category
 OR e.category NOT IN ('comment','reply','mention','comment_like') THEN reason:='SOURCE_MISMATCH';
 ELSIF e.expires_at<=pg_catalog.clock_timestamp() THEN reason:='EVENT_EXPIRED';
 ELSIF enabled IS DISTINCT FROM true OR since_at IS NULL OR since_at>e.occurred_at THEN reason:='PREFERENCE_DISABLED';
 ELSIF s.id IS NULL OR s.state<>'active' OR s.user_id IS DISTINCT FROM e.recipient_id
 OR s.binding_id IS DISTINCT FROM d.captured_binding_id OR s.binding_version IS DISTINCT FROM d.captured_binding_version
 OR s.activated_at IS NULL OR s.activated_at>e.occurred_at
 OR s.endpoint IS NULL OR s.p256dh IS NULL OR s.auth IS NULL THEN reason:='SUBSCRIPTION_CHANGED'; END IF;
 IF reason IS NOT NULL THEN
  UPDATE public.push_deliveries SET status='cancelled',lease_token=NULL,lease_until=NULL,
   last_error_code=reason,updated_at=pg_catalog.clock_timestamp() WHERE id=d.id;
  RETURN pg_catalog.jsonb_build_object('status','cancelled');
 END IF;
 -- Presentation uses only the already-authoritative notification references.
 -- No comment text, caller-supplied labels, new row locks or sender table grants.
 SELECT p.display_name,t.title INTO actor_display_name,story_title
 FROM (VALUES (1)) AS singleton(id)
 LEFT JOIN public.profiles p ON p.id=n.actor_id
 LEFT JOIN public.stories t ON t.id=n.story_id;
 RETURN pg_catalog.jsonb_build_object('status','ready',
  'lease_remaining_ms',pg_catalog.floor(EXTRACT(EPOCH FROM (d.lease_until-pg_catalog.clock_timestamp()))*1000),
  'event_remaining_seconds',pg_catalog.floor(EXTRACT(EPOCH FROM (e.expires_at-pg_catalog.clock_timestamp()))),
  'subscription',pg_catalog.jsonb_build_object('endpoint',s.endpoint,'keys',pg_catalog.jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)),
  'notification',pg_catalog.jsonb_build_object('id',n.id::pg_catalog.text,'category',e.category,
   'story_id',n.story_id::pg_catalog.text,'chapter_id',n.chapter_id::pg_catalog.text,'comment_id',n.comment_id::pg_catalog.text,
   'actor_display_name',actor_display_name,'story_title',story_title));
END;
$fn$;
DO $verify$
DECLARE p record;
BEGIN
 SELECT f.* INTO p FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
 WHERE n.nspname='public' AND f.proname='nca_prepare_personal_push_delivery'
  AND f.pronargs=2 AND f.proargtypes[0]=2950 AND f.proargtypes[1]=2950;
 IF p.oid IS NULL OR NOT p.prosecdef OR p.proowner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""','lock_timeout=2s','statement_timeout=5s']
 OR pg_catalog.md5(pg_catalog.replace(p.prosrc,pg_catalog.chr(13),''))<>'30f40a077080f75281f4bfc91d377e72'
 THEN RAISE EXCEPTION 'NCA_RICH_PERSONAL_PREPARE_RESULT'; END IF;
END;
$verify$;
COMMIT;
