-- ============================================================
-- Klasquiz Database Schema
-- Run this in Supabase SQL Editor (new project)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

create table public.profiles (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null unique,
  email       text not null,
  role        text not null check (role in ('admin', 'teacher')),
  created_at  timestamptz default now()
);

create table public.quizzes (
  id          uuid primary key default uuid_generate_v4(),
  teacher_id  uuid references auth.users(id) on delete cascade not null,
  title       text not null,
  description text,
  created_at  timestamptz default now()
);

create table public.questions (
  id              uuid primary key default uuid_generate_v4(),
  quiz_id         uuid references public.quizzes(id) on delete cascade not null,
  question_type   text not null default 'multiple_choice' check (question_type in ('multiple_choice', 'drag_order', 'select_image')),
  question_text   text not null default '',
  image_url       text,
  time_limit      integer not null default 60,
  points_enabled  boolean not null default true,
  order_index     integer not null default 0
);

create table public.options (
  id            uuid primary key default uuid_generate_v4(),
  question_id   uuid references public.questions(id) on delete cascade not null,
  option_text   text,
  image_url     text,
  is_correct    boolean not null default false,
  correct_order integer
);

create table public.game_sessions (
  id                      uuid primary key default uuid_generate_v4(),
  quiz_id                 uuid references public.quizzes(id) on delete cascade not null,
  pin_code                text not null unique,
  is_live                 boolean not null default true,
  is_active               boolean not null default true,
  current_question_index  integer not null default 0,
  status                  text not null default 'lobby' check (status in ('lobby', 'active', 'finished'))
);

create table public.players (
  id          uuid primary key default uuid_generate_v4(),
  session_id  uuid references public.game_sessions(id) on delete cascade not null,
  nickname    text not null,
  total_score integer not null default 0
);

create table public.responses (
  id             uuid primary key default uuid_generate_v4(),
  session_id     uuid references public.game_sessions(id) on delete cascade not null,
  player_id      uuid references public.players(id) on delete cascade not null,
  question_id    uuid references public.questions(id) on delete cascade not null,
  is_correct     boolean not null default false,
  points_awarded integer not null default 0,
  response_time  integer not null default 0
);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'teacher')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.quizzes       enable row level security;
alter table public.questions     enable row level security;
alter table public.options       enable row level security;
alter table public.game_sessions enable row level security;
alter table public.players       enable row level security;
alter table public.responses     enable row level security;

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- profiles: admins see all, teachers see own
create policy "Admins manage all profiles"
  on public.profiles for all
  using (public.is_admin());

create policy "Users see own profile"
  on public.profiles for select
  using (user_id = auth.uid());

-- quizzes: teachers manage own, admins manage all
create policy "Teachers manage own quizzes"
  on public.quizzes for all
  using (teacher_id = auth.uid() or public.is_admin());

-- questions: via quiz ownership
create policy "Teachers manage own questions"
  on public.questions for all
  using (
    quiz_id in (select id from public.quizzes where teacher_id = auth.uid())
    or public.is_admin()
  );

-- options: via question ownership
create policy "Teachers manage own options"
  on public.options for all
  using (
    question_id in (
      select q.id from public.questions q
      join public.quizzes qz on q.quiz_id = qz.id
      where qz.teacher_id = auth.uid()
    )
    or public.is_admin()
  );

-- game_sessions: teachers manage own, anyone can read active sessions
create policy "Teachers manage own sessions"
  on public.game_sessions for all
  using (
    quiz_id in (select id from public.quizzes where teacher_id = auth.uid())
    or public.is_admin()
  );

create policy "Anyone can read active sessions"
  on public.game_sessions for select
  using (is_active = true);

-- players: anyone can insert and read in active sessions
create policy "Anyone can join active sessions"
  on public.players for insert
  with check (
    session_id in (select id from public.game_sessions where is_active = true)
  );

create policy "Anyone can read players in session"
  on public.players for select
  using (true);

create policy "Players can update own score"
  on public.players for update
  using (true);

-- responses: anyone can insert (for active sessions), teachers can read
create policy "Anyone can submit responses"
  on public.responses for insert
  with check (
    session_id in (select id from public.game_sessions where is_active = true)
  );

create policy "Teachers and players can read responses"
  on public.responses for select
  using (true);

-- ============================================================
-- REALTIME
-- Enable realtime on tables needed for live game
-- ============================================================

-- Run in Supabase Dashboard → Database → Replication
-- Or use the API to add these tables to the realtime publication:
--   alter publication supabase_realtime add table public.game_sessions;
--   alter publication supabase_realtime add table public.players;
--   alter publication supabase_realtime add table public.responses;
