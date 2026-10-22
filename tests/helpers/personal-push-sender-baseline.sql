-- Exact three routine definitions from consumed sender SQL SHA256 918d9f61e34437c909ff0f1b0f322855bb4192ef43f9df437e90eacf6ab86168
-- LOCAL scratch fixture only; never a production installer.
CREATE FUNCTION public.nca_claim_personal_push_deliveries(p_limit integer) RETURNS pg_catalog.jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' SET statement_timeout='5s'
AS $fn$
DECLARE result pg_catalog.jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>10 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NCA_SENDER_LIMIT'; END IF;
 WITH candidates AS MATERIALIZED (
  SELECT d.id FROM public.push_deliveries d
  WHERE d.personal_notification_id IS NOT NULL AND d.content_event_id IS NULL
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
CREATE FUNCTION public.nca_prepare_personal_push_delivery(p_delivery_id uuid,p_lease_token uuid) RETURNS pg_catalog.jsonb
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
 RETURN pg_catalog.jsonb_build_object('status','ready',
  'lease_remaining_ms',pg_catalog.floor(EXTRACT(EPOCH FROM (d.lease_until-pg_catalog.clock_timestamp()))*1000),
  'event_remaining_seconds',pg_catalog.floor(EXTRACT(EPOCH FROM (e.expires_at-pg_catalog.clock_timestamp()))),
  'subscription',pg_catalog.jsonb_build_object('endpoint',s.endpoint,'keys',pg_catalog.jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)),
  'notification',pg_catalog.jsonb_build_object('id',n.id::pg_catalog.text,'category',e.category,
   'story_id',n.story_id::pg_catalog.text,'chapter_id',n.chapter_id::pg_catalog.text,'comment_id',n.comment_id::pg_catalog.text));
END;
$fn$;
CREATE FUNCTION public.nca_finish_personal_push_delivery(p_delivery_id uuid,p_lease_token uuid,p_outcome text) RETURNS pg_catalog.jsonb
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
 IF d.personal_notification_id IS NULL OR d.content_event_id IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='NCA_SENDER_NOT_PERSONAL'; END IF;
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
