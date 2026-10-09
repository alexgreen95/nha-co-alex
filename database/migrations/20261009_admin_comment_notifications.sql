-- Separate migration. Run in Supabase SQL Editor after comment notification migration.
-- Does not replace the installed like/reply/mention functions or triggers.
BEGIN;

CREATE OR REPLACE FUNCTION public.nca_current_profile_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT role FROM public.profiles WHERE id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.nca_current_profile_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nca_current_profile_role() TO authenticated;

DO $$ BEGIN
 -- Existing owner-only permissive policies still determine which profile may
 -- be inserted/updated. These checks only protect its role; omitted INSERT
 -- roles use the existing 'reader' default, and normal UPDATEs retain the role.
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='nca profile role unchanged') THEN
  CREATE POLICY "nca profile role unchanged" ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true) WITH CHECK (role = public.nca_current_profile_role());
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='nca profile starts as reader') THEN
  CREATE POLICY "nca profile starts as reader" ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (role = 'reader');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='nca role admin delete comments') THEN
  -- Grant access even if legacy is_admin() does not recognize profiles.role.
  CREATE POLICY "nca role admin delete comments" ON public.comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.nca_current_profile_role() = 'admin');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='nca comment delete owner or role admin') THEN
  -- PostgreSQL ORs permissive policies, then ANDs restrictive policies. This
  -- bounds both legacy DELETE policies (owner OR is_admin(), and owner-only)
  -- without removing them; a restrictive policy alone cannot grant access.
  CREATE POLICY "nca comment delete owner or role admin" ON public.comments AS RESTRICTIVE FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.nca_current_profile_role() = 'admin');
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.nca_notify_admin_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE admin_id uuid; chapter bigint;
BEGIN
 IF NEW.parent_id IS NOT NULL THEN RETURN NEW; END IF;
 IF EXISTS (SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND role='admin') THEN RETURN NEW; END IF;
 IF NEW.chapter_index IS NOT NULL AND NEW.scope IN ('chapter','paragraph') THEN
  SELECT c.id INTO chapter FROM public.chapters c
  WHERE c.story_id=NEW.story_id AND c.published IS DISTINCT FROM false
  ORDER BY c.chapter_number,c.id OFFSET GREATEST(NEW.chapter_index,0) LIMIT 1;
 END IF;
 FOR admin_id IN SELECT id FROM public.profiles WHERE role='admin' LOOP
  IF admin_id=NEW.user_id THEN CONTINUE; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   admin_id::text||':'||NEW.user_id::text||':'||NEW.id::text||':comment',0));
  IF NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id=admin_id AND n.actor_id=NEW.user_id AND n.comment_id=NEW.id AND n.type='comment') THEN
   INSERT INTO public.notifications(user_id,actor_id,type,story_id,chapter_id,comment_id)
   VALUES(admin_id,NEW.user_id,'comment',NEW.story_id,chapter,NEW.id);
  END IF;
 END LOOP;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.nca_notify_admin_comment() FROM PUBLIC, anon, authenticated;

-- A top-level comment already notified an admin: suppress only that admin's
-- redundant mention for this same comment, actor and recipient. Other mentions
-- and all like/reply notifications retain their installed behavior.
CREATE OR REPLACE FUNCTION public.nca_skip_admin_comment_mention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.type='mention' AND EXISTS (
  SELECT 1 FROM public.notifications n WHERE n.type='comment'
  AND n.user_id=NEW.user_id AND n.actor_id=NEW.actor_id AND n.comment_id=NEW.comment_id
 ) THEN RETURN NULL; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.nca_skip_admin_comment_mention() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER nca_admin_top_level_comment_notification
AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.nca_notify_admin_comment();
CREATE OR REPLACE TRIGGER nca_admin_comment_mention_dedupe
BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.nca_skip_admin_comment_mention();

COMMIT;
