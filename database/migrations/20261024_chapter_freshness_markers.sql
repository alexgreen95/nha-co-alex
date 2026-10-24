begin;

create table public.content_freshness_chapter_read (
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id bigint not null references public.stories(id) on delete cascade,
  chapter_id bigint not null references public.chapters(id) on delete cascade,
  publication_sequence bigint not null check (publication_sequence >= 0),
  read_at timestamptz not null,
  primary key (user_id, chapter_id)
);

alter table public.content_freshness_chapter_read enable row level security;
revoke all on table public.content_freshness_chapter_read from public,anon,authenticated;
grant all on table public.content_freshness_chapter_read to postgres;

create or replace function public.nca_get_freshness_catalog()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with frontier as (
    select * from public.nca_freshness_visible_catalog()
  ), recent_chapters as (
    select
      p.story_id,
      p.chapter_id,
      p.catalog_sequence,
      p.occurred_at
    from public.content_publications p
    join public.stories s
      on s.id=p.story_id and s.published is true
    join public.chapters c
      on c.id=p.chapter_id and c.story_id=p.story_id and c.published is true
    where p.origin='genuine'
      and p.kind='new_chapter'
      and p.occurred_at >= pg_catalog.statement_timestamp()-interval '3 days'
  )
  select pg_catalog.jsonb_build_object(
    'server_now',pg_catalog.statement_timestamp(),
    'stories',coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'story_id',f.story_id,
            'story_sequence',case when f.story_sequence is null then null else f.story_sequence::pg_catalog.text end,
            'story_occurred_at',f.story_occurred_at,
            'chapter_sequence',case when f.chapter_sequence is null then null else f.chapter_sequence::pg_catalog.text end,
            'chapter_occurred_at',f.chapter_occurred_at,
            'chapter_id',f.chapter_id
          )
          order by f.story_id
        )
        from frontier f
      ),
      '[]'::pg_catalog.jsonb
    ),
    'recent_chapters',coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'story_id',r.story_id,
            'chapter_id',r.chapter_id,
            'chapter_sequence',r.catalog_sequence::pg_catalog.text,
            'chapter_occurred_at',r.occurred_at
          )
          order by r.occurred_at,r.catalog_sequence,r.chapter_id
        )
        from recent_chapters r
      ),
      '[]'::pg_catalog.jsonb
    )
  );
$function$;

revoke all on function public.nca_get_freshness_catalog() from public;
grant execute on function public.nca_get_freshness_catalog() to anon,authenticated,service_role,postgres;

create or replace function public.nca_get_freshness_state()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller pg_catalog.uuid;
  v_now pg_catalog.timestamptz;
  v_account public.content_freshness_accounts%rowtype;
  v_acks pg_catalog.jsonb;
  v_read_chapter_ids pg_catalog.jsonb;
begin
  v_caller:=auth.uid();
  if v_caller is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  v_now:=pg_catalog.clock_timestamp();

  insert into public.content_freshness_accounts(
    user_id,baseline_cutoff_at,initialized_at,updated_at
  )
  values(v_caller,v_now-interval '3 days',v_now,v_now)
  on conflict(user_id) do nothing;

  select * into v_account
  from public.content_freshness_accounts
  where user_id=v_caller;

  if not found then
    raise exception 'NCA_FRESHNESS_ACCOUNT_MISSING' using errcode='55000';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'story_id',a.story_id,
        'story_ack_sequence',a.story_ack_sequence::pg_catalog.text,
        'chapter_ack_sequence',a.chapter_ack_sequence::pg_catalog.text
      )
      order by a.story_id
    ),
    '[]'::pg_catalog.jsonb
  )
  into v_acks
  from public.content_freshness_ack a
  where a.user_id=v_caller;

  select coalesce(
    pg_catalog.jsonb_agg(r.chapter_id order by r.chapter_id),
    '[]'::pg_catalog.jsonb
  )
  into v_read_chapter_ids
  from public.content_freshness_chapter_read r
  where r.user_id=v_caller;

  return pg_catalog.jsonb_build_object(
    'baseline_cutoff_at',v_account.baseline_cutoff_at,
    'acks',v_acks,
    'read_chapter_ids',v_read_chapter_ids
  );
end;
$function$;

revoke all on function public.nca_get_freshness_state() from public,anon;
grant execute on function public.nca_get_freshness_state() to authenticated,service_role,postgres;

create or replace function public.nca_mark_chapter_freshness_read(
  p_story_id bigint,
  p_chapter_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller pg_catalog.uuid;
  v_now pg_catalog.timestamptz;
  v_sequence pg_catalog.int8;
begin
  v_caller:=auth.uid();
  if v_caller is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_story_id is null or p_story_id<=0 or p_chapter_id is null or p_chapter_id<=0 then
    raise exception 'NCA_FRESHNESS_INVALID_CHAPTER' using errcode='22023';
  end if;

  v_now:=pg_catalog.clock_timestamp();

  select p.catalog_sequence
  into v_sequence
  from public.content_publications p
  join public.stories s
    on s.id=p.story_id and s.published is true
  join public.chapters c
    on c.id=p.chapter_id and c.story_id=p.story_id and c.published is true
  where p.story_id=p_story_id
    and p.chapter_id=p_chapter_id
    and p.origin='genuine'
    and p.kind='new_chapter'
    and p.occurred_at >= v_now-interval '3 days'
  order by p.catalog_sequence desc,p.id desc
  limit 1;

  if v_sequence is null then
    return pg_catalog.jsonb_build_object(
      'acknowledged',false,
      'story_id',p_story_id,
      'chapter_id',p_chapter_id,
      'reason','not_recent_genuine_publication'
    );
  end if;

  insert into public.content_freshness_chapter_read(
    user_id,story_id,chapter_id,publication_sequence,read_at
  )
  values(v_caller,p_story_id,p_chapter_id,v_sequence,v_now)
  on conflict(user_id,chapter_id) do update
  set story_id=excluded.story_id,
      publication_sequence=greatest(public.content_freshness_chapter_read.publication_sequence,excluded.publication_sequence),
      read_at=case
        when excluded.publication_sequence >= public.content_freshness_chapter_read.publication_sequence then excluded.read_at
        else public.content_freshness_chapter_read.read_at
      end;

  return pg_catalog.jsonb_build_object(
    'acknowledged',true,
    'story_id',p_story_id,
    'chapter_id',p_chapter_id,
    'chapter_sequence',v_sequence::pg_catalog.text
  );
end;
$function$;

revoke all on function public.nca_mark_chapter_freshness_read(bigint,bigint) from public,anon;
grant execute on function public.nca_mark_chapter_freshness_read(bigint,bigint) to authenticated,service_role,postgres;

commit;
