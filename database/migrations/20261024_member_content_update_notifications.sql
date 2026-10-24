begin;

alter table public.notifications
  add column content_publication_id bigint
  references public.content_publications(id)
  on delete cascade;

alter table public.notifications
  drop constraint notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'story_like'::text,
    'comment'::text,
    'reply'::text,
    'mention'::text,
    'comment_like'::text,
    'update'::text
  ]));

create unique index notifications_content_publication_user_uidx
  on public.notifications(user_id,content_publication_id)
  where content_publication_id is not null;

create or replace function public.nca_fanout_member_content_update_notification()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_admin_id pg_catalog.uuid;
begin
  if TG_TABLE_SCHEMA<>'public'
     or TG_TABLE_NAME<>'content_publications'
     or TG_OP<>'INSERT'
     or TG_NARGS<>0 then
    raise exception 'NCA_CONTENT_UPDATE_NOTIFICATION_TRIGGER_CONTEXT';
  end if;

  if NEW.origin<>'genuine'
     or NEW.kind not in ('new_story','new_chapter') then
    return NEW;
  end if;

  select p.id into v_admin_id
  from public.profiles p
  where p.role='admin'
  order by p.id
  limit 1;

  insert into public.notifications(
    user_id,actor_id,type,story_id,chapter_id,comment_id,
    is_read,created_at,content_publication_id
  )
  select
    p.id,v_admin_id,'update',NEW.story_id,NEW.chapter_id,null,
    false,NEW.occurred_at,NEW.id
  from public.profiles p
  where p.role='reader'
  on conflict do nothing;

  return NEW;
end;
$function$;

revoke all on function public.nca_fanout_member_content_update_notification()
  from public,anon,authenticated,service_role;
grant execute on function public.nca_fanout_member_content_update_notification()
  to postgres;

create trigger nca_member_content_update_notification
after insert on public.content_publications
for each row
execute function public.nca_fanout_member_content_update_notification();

commit;
