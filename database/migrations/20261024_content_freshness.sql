begin;

create table public.content_freshness_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  baseline_cutoff_at timestamptz not null,
  updates_seen_sequence bigint not null default 0 check (updates_seen_sequence >= 0),
  initialized_at timestamptz not null,
  updated_at timestamptz not null
);

create table public.content_freshness_ack (
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id bigint not null references public.stories(id) on delete cascade,
  story_ack_sequence bigint not null default 0 check (story_ack_sequence >= 0),
  chapter_ack_sequence bigint not null default 0 check (chapter_ack_sequence >= 0),
  updated_at timestamptz not null,
  primary key (user_id, story_id)
);

alter table public.content_freshness_accounts enable row level security;
alter table public.content_freshness_ack enable row level security;

revoke all on table public.content_freshness_accounts from public, anon, authenticated;
revoke all on table public.content_freshness_ack from public, anon, authenticated;
grant all on table public.content_freshness_accounts to postgres;
grant all on table public.content_freshness_ack to postgres;

create or replace function public.nca_freshness_visible_catalog()
returns table (
  story_id bigint,
  story_sequence bigint,
  story_occurred_at timestamptz,
  chapter_sequence bigint,
  chapter_occurred_at timestamptz,
  chapter_id bigint
)
language sql
stable
set search_path to ''
as $function$
  with story_frontier as (
    select distinct on (p.story_id)
      p.story_id,
      p.catalog_sequence,
      p.occurred_at
    from public.content_publications p
    join public.stories s
      on s.id = p.story_id
     and s.published is true
    where p.origin = 'genuine'
      and p.kind = 'new_story'
    order by p.story_id, p.catalog_sequence desc, p.id desc
  ),
  chapter_frontier as (
    select distinct on (p.story_id)
      p.story_id,
      p.catalog_sequence,
      p.occurred_at,
      p.chapter_id
    from public.content_publications p
    join public.stories s
      on s.id = p.story_id
     and s.published is true
    join public.chapters c
      on c.id = p.chapter_id
     and c.story_id = p.story_id
     and c.published is true
    where p.origin = 'genuine'
      and p.kind = 'new_chapter'
    order by p.story_id, p.catalog_sequence desc, p.id desc
  ),
  ids as (
    select story_id from story_frontier
    union
    select story_id from chapter_frontier
  )
  select
    ids.story_id,
    sf.catalog_sequence as story_sequence,
    sf.occurred_at as story_occurred_at,
    cf.catalog_sequence as chapter_sequence,
    cf.occurred_at as chapter_occurred_at,
    cf.chapter_id
  from ids
  left join story_frontier sf using (story_id)
  left join chapter_frontier cf using (story_id)
  order by ids.story_id;
$function$;

revoke all on function public.nca_freshness_visible_catalog() from public, anon, authenticated;
grant execute on function public.nca_freshness_visible_catalog() to postgres;

create or replace function public.nca_get_freshness_catalog()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select pg_catalog.jsonb_build_object(
    'server_now', pg_catalog.statement_timestamp(),
    'stories', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'story_id', f.story_id,
          'story_sequence', case when f.story_sequence is null then null else f.story_sequence::pg_catalog.text end,
          'story_occurred_at', f.story_occurred_at,
          'chapter_sequence', case when f.chapter_sequence is null then null else f.chapter_sequence::pg_catalog.text end,
          'chapter_occurred_at', f.chapter_occurred_at,
          'chapter_id', f.chapter_id
        )
        order by f.story_id
      ) filter (where f.story_id is not null),
      '[]'::pg_catalog.jsonb
    )
  )
  from public.nca_freshness_visible_catalog() f;
$function$;

revoke all on function public.nca_get_freshness_catalog() from public;
grant execute on function public.nca_get_freshness_catalog() to anon, authenticated, service_role, postgres;

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
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_now := pg_catalog.clock_timestamp();

  insert into public.content_freshness_accounts(
    user_id, baseline_cutoff_at, updates_seen_sequence, initialized_at, updated_at
  )
  values(
    v_caller, v_now - interval '3 days', 0, v_now, v_now
  )
  on conflict (user_id) do nothing;

  select * into v_account
  from public.content_freshness_accounts
  where user_id = v_caller;

  if not found then
    raise exception 'NCA_FRESHNESS_ACCOUNT_MISSING' using errcode = '55000';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'story_id', a.story_id,
        'story_ack_sequence', a.story_ack_sequence::pg_catalog.text,
        'chapter_ack_sequence', a.chapter_ack_sequence::pg_catalog.text
      )
      order by a.story_id
    ),
    '[]'::pg_catalog.jsonb
  )
  into v_acks
  from public.content_freshness_ack a
  where a.user_id = v_caller;

  return pg_catalog.jsonb_build_object(
    'baseline_cutoff_at', v_account.baseline_cutoff_at,
    'updates_seen_sequence', v_account.updates_seen_sequence::pg_catalog.text,
    'acks', v_acks
  );
end;
$function$;

revoke all on function public.nca_get_freshness_state() from public, anon;
grant execute on function public.nca_get_freshness_state() to authenticated, service_role, postgres;

create or replace function public.nca_ack_story_freshness(p_story_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller pg_catalog.uuid;
  v_now pg_catalog.timestamptz;
  v_sequence pg_catalog.int8;
  v_ack pg_catalog.int8;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_story_id is null or p_story_id <= 0 then
    raise exception 'NCA_FRESHNESS_INVALID_STORY' using errcode = '22023';
  end if;

  v_now := pg_catalog.clock_timestamp();

  insert into public.content_freshness_accounts(
    user_id, baseline_cutoff_at, updates_seen_sequence, initialized_at, updated_at
  )
  values(v_caller, v_now - interval '3 days', 0, v_now, v_now)
  on conflict (user_id) do nothing;

  select f.story_sequence into v_sequence
  from public.nca_freshness_visible_catalog() f
  where f.story_id = p_story_id;

  if v_sequence is null then
    return pg_catalog.jsonb_build_object('acknowledged', false, 'story_id', p_story_id);
  end if;

  insert into public.content_freshness_ack(
    user_id, story_id, story_ack_sequence, chapter_ack_sequence, updated_at
  )
  values(v_caller, p_story_id, v_sequence, 0, v_now)
  on conflict (user_id, story_id) do update
  set story_ack_sequence = greatest(
        public.content_freshness_ack.story_ack_sequence,
        excluded.story_ack_sequence
      ),
      updated_at = v_now
  returning story_ack_sequence into v_ack;

  return pg_catalog.jsonb_build_object(
    'acknowledged', true,
    'story_id', p_story_id,
    'story_ack_sequence', v_ack::pg_catalog.text
  );
end;
$function$;

revoke all on function public.nca_ack_story_freshness(bigint) from public, anon;
grant execute on function public.nca_ack_story_freshness(bigint) to authenticated, service_role, postgres;

create or replace function public.nca_ack_chapter_freshness(p_story_id bigint, p_chapter_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller pg_catalog.uuid;
  v_now pg_catalog.timestamptz;
  v_sequence pg_catalog.int8;
  v_frontier_chapter pg_catalog.int8;
  v_ack pg_catalog.int8;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_story_id is null or p_story_id <= 0 or p_chapter_id is null or p_chapter_id <= 0 then
    raise exception 'NCA_FRESHNESS_INVALID_CHAPTER' using errcode = '22023';
  end if;

  v_now := pg_catalog.clock_timestamp();

  insert into public.content_freshness_accounts(
    user_id, baseline_cutoff_at, updates_seen_sequence, initialized_at, updated_at
  )
  values(v_caller, v_now - interval '3 days', 0, v_now, v_now)
  on conflict (user_id) do nothing;

  select f.chapter_sequence, f.chapter_id
    into v_sequence, v_frontier_chapter
  from public.nca_freshness_visible_catalog() f
  where f.story_id = p_story_id;

  if v_sequence is null or v_frontier_chapter is distinct from p_chapter_id then
    return pg_catalog.jsonb_build_object(
      'acknowledged', false,
      'story_id', p_story_id,
      'chapter_id', p_chapter_id,
      'reason', 'not_current_frontier'
    );
  end if;

  insert into public.content_freshness_ack(
    user_id, story_id, story_ack_sequence, chapter_ack_sequence, updated_at
  )
  values(v_caller, p_story_id, 0, v_sequence, v_now)
  on conflict (user_id, story_id) do update
  set chapter_ack_sequence = greatest(
        public.content_freshness_ack.chapter_ack_sequence,
        excluded.chapter_ack_sequence
      ),
      updated_at = v_now
  returning chapter_ack_sequence into v_ack;

  return pg_catalog.jsonb_build_object(
    'acknowledged', true,
    'story_id', p_story_id,
    'chapter_id', p_chapter_id,
    'chapter_ack_sequence', v_ack::pg_catalog.text
  );
end;
$function$;

revoke all on function public.nca_ack_chapter_freshness(bigint,bigint) from public, anon;
grant execute on function public.nca_ack_chapter_freshness(bigint,bigint) to authenticated, service_role, postgres;

create or replace function public.nca_get_member_updates(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller pg_catalog.uuid;
  v_role pg_catalog.text;
  v_now pg_catalog.timestamptz;
  v_account public.content_freshness_accounts%rowtype;
  v_updates pg_catalog.jsonb;
  v_unread pg_catalog.int8;
  v_max_sequence pg_catalog.int8;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'NCA_MEMBER_UPDATES_INVALID_LIMIT' using errcode = '22023';
  end if;

  select role into v_role from public.profiles where id = v_caller;
  if coalesce(v_role, 'reader') = 'admin' then
    return pg_catalog.jsonb_build_object(
      'is_admin', true,
      'updates', '[]'::pg_catalog.jsonb,
      'unread_count', 0,
      'max_sequence', null
    );
  end if;

  v_now := pg_catalog.clock_timestamp();
  insert into public.content_freshness_accounts(
    user_id, baseline_cutoff_at, updates_seen_sequence, initialized_at, updated_at
  )
  values(v_caller, v_now - interval '3 days', 0, v_now, v_now)
  on conflict (user_id) do nothing;

  select * into v_account
  from public.content_freshness_accounts
  where user_id = v_caller;

  if not found then
    raise exception 'NCA_FRESHNESS_ACCOUNT_MISSING' using errcode = '55000';
  end if;

  with eligible as (
    select
      p.catalog_sequence,
      p.occurred_at,
      p.kind,
      p.story_id,
      p.chapter_id,
      s.title as story_title,
      c.title as chapter_title
    from public.content_publications p
    join public.stories s
      on s.id = p.story_id
     and s.published is true
    left join public.chapters c
      on c.id = p.chapter_id
     and c.story_id = p.story_id
    where p.origin = 'genuine'
      and p.kind in ('new_story','new_chapter')
      and p.occurred_at >= v_account.baseline_cutoff_at
      and (p.kind = 'new_story' or (c.id is not null and c.published is true))
  ),
  limited as (
    select *
    from eligible
    order by catalog_sequence desc
    limit p_limit
  )
  select
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'catalog_sequence', l.catalog_sequence::pg_catalog.text,
          'occurred_at', l.occurred_at,
          'kind', l.kind,
          'story_id', l.story_id,
          'chapter_id', l.chapter_id,
          'story_title', l.story_title,
          'chapter_title', l.chapter_title,
          'is_read', l.catalog_sequence <= v_account.updates_seen_sequence
        )
        order by l.catalog_sequence desc
      ),
      '[]'::pg_catalog.jsonb
    ),
    count(*) filter (where l.catalog_sequence > v_account.updates_seen_sequence),
    max(l.catalog_sequence)
  into v_updates, v_unread, v_max_sequence
  from limited l;

  return pg_catalog.jsonb_build_object(
    'is_admin', false,
    'updates', v_updates,
    'unread_count', coalesce(v_unread,0),
    'max_sequence', case when v_max_sequence is null then null else v_max_sequence::pg_catalog.text end
  );
end;
$function$;

revoke all on function public.nca_get_member_updates(integer) from public, anon;
grant execute on function public.nca_get_member_updates(integer) to authenticated, service_role, postgres;

create or replace function public.nca_mark_member_updates_read(p_through_sequence bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller pg_catalog.uuid;
  v_role pg_catalog.text;
  v_now pg_catalog.timestamptz;
  v_account public.content_freshness_accounts%rowtype;
  v_target pg_catalog.int8;
  v_seen pg_catalog.int8;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_through_sequence is null or p_through_sequence <= 0 then
    raise exception 'NCA_MEMBER_UPDATES_INVALID_SEQUENCE' using errcode = '22023';
  end if;

  select role into v_role from public.profiles where id = v_caller;
  if coalesce(v_role, 'reader') = 'admin' then
    return pg_catalog.jsonb_build_object('updated', false, 'reason', 'admin');
  end if;

  v_now := pg_catalog.clock_timestamp();

  insert into public.content_freshness_accounts(
    user_id, baseline_cutoff_at, updates_seen_sequence, initialized_at, updated_at
  )
  values(v_caller, v_now - interval '3 days', 0, v_now, v_now)
  on conflict (user_id) do nothing;

  select * into v_account
  from public.content_freshness_accounts
  where user_id = v_caller
  for update;

  if not found then
    raise exception 'NCA_FRESHNESS_ACCOUNT_MISSING' using errcode = '55000';
  end if;

  select max(p.catalog_sequence) into v_target
  from public.content_publications p
  join public.stories s
    on s.id = p.story_id
   and s.published is true
  left join public.chapters c
    on c.id = p.chapter_id
   and c.story_id = p.story_id
  where p.origin = 'genuine'
    and p.kind in ('new_story','new_chapter')
    and p.occurred_at >= v_account.baseline_cutoff_at
    and p.catalog_sequence <= p_through_sequence
    and (p.kind = 'new_story' or (c.id is not null and c.published is true));

  if v_target is null then
    return pg_catalog.jsonb_build_object(
      'updated', false,
      'updates_seen_sequence', v_account.updates_seen_sequence::pg_catalog.text
    );
  end if;

  update public.content_freshness_accounts
  set updates_seen_sequence = greatest(updates_seen_sequence, v_target),
      updated_at = v_now
  where user_id = v_caller
  returning updates_seen_sequence into v_seen;

  return pg_catalog.jsonb_build_object(
    'updated', true,
    'updates_seen_sequence', v_seen::pg_catalog.text
  );
end;
$function$;

revoke all on function public.nca_mark_member_updates_read(bigint) from public, anon;
grant execute on function public.nca_mark_member_updates_read(bigint) to authenticated, service_role, postgres;

commit;
