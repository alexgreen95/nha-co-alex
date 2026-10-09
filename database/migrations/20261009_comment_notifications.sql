-- Run once in Supabase SQL Editor as the database owner.
-- Adds notification triggers; preserves existing rows and recipient read/update policies.
BEGIN;

CREATE OR REPLACE FUNCTION public.nca_create_comment_notification(
  recipient uuid, actor uuid, notification_type text, story bigint, comment bigint
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF recipient IS NULL OR actor IS NULL OR recipient = actor THEN RETURN; END IF;
  IF notification_type NOT IN ('comment_like','reply','mention') THEN
    RAISE EXCEPTION 'Unsupported comment notification type';
  END IF;
  -- One lifetime like notification per actor/comment. Reply and mention share a key.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    recipient::text || ':' || actor::text || ':' || comment::text || ':' ||
    CASE WHEN notification_type IN ('reply','mention') THEN 'response' ELSE notification_type END, 0));
  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = recipient AND n.actor_id = actor AND n.comment_id = comment
      AND (n.type = notification_type OR
        (notification_type IN ('reply','mention') AND n.type IN ('reply','mention')))
  ) THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id,actor_id,type,story_id,comment_id)
  VALUES(recipient,actor,notification_type,story,comment);
END;
$$;
REVOKE ALL ON FUNCTION public.nca_create_comment_notification(uuid,uuid,text,bigint,bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nca_notify_comment_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.comments%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.comments WHERE id = NEW.comment_id;
  IF FOUND THEN
    PERFORM public.nca_create_comment_notification(c.user_id,NEW.user_id,'comment_like',c.story_id,c.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.nca_notify_comment_like() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nca_notify_comment_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipient uuid; parent public.comments%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO parent FROM public.comments WHERE id = NEW.parent_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  -- Frontend stores rootId in parent_id, even when replying to another reply.
  -- Walk up first to also support existing rows stored as a deep parent chain,
  -- then walk down from the root to validate against the entire thread.
  recipient := parent.user_id;
  IF NEW.reply_to_user_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE ancestors(id,user_id,parent_id) AS (
      SELECT id,user_id,parent_id FROM public.comments WHERE id = NEW.parent_id
      UNION
      SELECT c.id,c.user_id,c.parent_id FROM public.comments c
      JOIN ancestors a ON c.id = a.parent_id
      WHERE c.id <> NEW.id
    ), thread(id,user_id) AS (
      SELECT id,user_id FROM ancestors WHERE parent_id IS NULL
      UNION
      SELECT c.id,c.user_id FROM public.comments c JOIN thread t ON c.parent_id = t.id
      WHERE c.id <> NEW.id
    ) SELECT 1 FROM thread WHERE user_id = NEW.reply_to_user_id
  ) THEN recipient := NEW.reply_to_user_id; END IF;
  PERFORM public.nca_create_comment_notification(recipient,NEW.user_id,'reply',NEW.story_id,NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.nca_notify_comment_reply() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nca_notify_comment_mention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.comments%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.comments WHERE id = NEW.comment_id;
  IF FOUND THEN
    PERFORM public.nca_create_comment_notification(NEW.mentioned_user_id,c.user_id,'mention',c.story_id,c.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.nca_notify_comment_mention() FROM PUBLIC, anon, authenticated;

-- Idempotent install; only replaces the three triggers belonging to this migration.
CREATE OR REPLACE TRIGGER nca_comment_like_notification
AFTER INSERT ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.nca_notify_comment_like();
CREATE OR REPLACE TRIGGER nca_comment_reply_notification
AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.nca_notify_comment_reply();
CREATE OR REPLACE TRIGGER nca_comment_mention_notification
AFTER INSERT ON public.comment_mentions FOR EACH ROW EXECUTE FUNCTION public.nca_notify_comment_mention();

-- Mentions must belong to the authenticated author's own comment.
ALTER POLICY "Authenticated users can create mentions" ON public.comment_mentions
WITH CHECK (EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND c.user_id = auth.uid()));

-- Comment notifications are created by the triggers, not by client-supplied recipients.
-- Preserve the existing client INSERT permission for the other notification types.
ALTER POLICY "Authenticated users can create notifications" ON public.notifications
WITH CHECK (actor_id = auth.uid() AND user_id <> auth.uid() AND type NOT IN ('comment_like','reply','mention'));

-- Allows the frontend to keep legacy mentions working until this SQL is installed.
CREATE OR REPLACE FUNCTION public.nca_comment_notifications_enabled()
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.nca_comment_notifications_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nca_comment_notifications_enabled() TO anon, authenticated;

COMMIT;
