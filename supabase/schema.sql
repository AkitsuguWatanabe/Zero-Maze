-- ============================================================
-- Zero-Maze — Supabase schema
-- Run this in the Supabase SQL editor (Project > SQL Editor)
-- ============================================================

-- ============================================================
-- instructions — Saved instruction evaluations (one per GO)
-- ============================================================

create table public.instructions (
  id                  uuid        primary key default gen_random_uuid(),

  -- Layer 1: raw input (original unedited text from the supervisor)
  raw_input           text        not null,

  -- Layer 2: structured 5-element data
  what                text        not null,
  purpose             text,
  completion          text,
  deadline            text,
  constraints         text,
  estimated_hours     text,

  -- Layer 3: AI-generated final instruction text
  final_text          text,

  -- Evaluation data
  scores              jsonb       not null,   -- { purpose_background, task_content, completion_deliverable, deadline_clarity, workload_estimate, constraints_notes }
  total_score         integer     not null,   -- out of 30 (最新＝GO確定時点の評価)
  -- 20-9: 再評価前・最初の評価結果（無ければtotal_score/scoresと同値）。
  -- マネジメント助言のスコア推移グラフは、AIの手直し込みの最新スコアではなく
  -- 指示者自身が最初に書いた時点の実力を追うため、こちらを使う。
  initial_scores      jsonb,
  initial_total_score integer,
  business_category   jsonb,                  -- { major, major_label, sub, sub_label }
  consistency_error   text,                   -- null if no contradiction
  over_interference   boolean     not null default false,

  -- Instruction context
  urgency             text        check (urgency in ('high', 'medium', 'low')),
  assignee_name       text,
  tone                text        check (tone in ('junior', 'peer', 'senior', 'external')),
  assignee_rank       text        check (assignee_rank in ('A', 'B', 'C', 'D')),
  support_mode        text        check (support_mode in ('efficiency', 'coaching')),
  milestones          jsonb,                  -- string[] | null

  -- Status lifecycle
  status              text        not null default 'confirmed'
                                  check (status in ('draft', 'evaluated', 'confirmed', 'sent')),

  -- Ownership — scopes each instruction to the manager who created it
  created_by_user_id  uuid        references auth.users(id),
  sent_at             timestamptz,

  created_at          timestamptz not null default now()
);

alter table public.instructions enable row level security;

create policy "service role full access"
  on public.instructions
  using (true)
  with check (true);

create index instructions_created_at_idx  on public.instructions (created_at desc);
create index instructions_user_idx        on public.instructions (created_by_user_id);
create index instructions_rank_idx        on public.instructions (assignee_rank);
create index instructions_status_idx      on public.instructions (status);
create index instructions_assignee_idx    on public.instructions (assignee_name);

-- ============================================================
-- members — Team member profiles with per-category skill ranks
-- Each person has a separate A–D rank per business sub-category.
-- The "profile" JSONB stores: { "1-1": "A", "2-1": "C", ... }
-- ============================================================

create table public.members (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  email       text,
  -- profile: Partial<Record<sub_category, "A"|"B"|"C"|"D">>
  -- e.g. { "1-1": "A", "1-2": "B", "2-1": "C", "4-2": "D" }
  profile     jsonb       not null default '{}',
  -- Scopes members to the manager who owns them (each user sees only their own team)
  user_id     uuid        references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.members enable row level security;

create policy "service role full access"
  on public.members
  using (true)
  with check (true);

create index members_name_idx    on public.members (name);
create index members_user_idx    on public.members (user_id);
-- Unique name per user (not globally) — two managers can each have their own "田中 太郎"
create unique index members_name_unique on public.members (user_id, lower(name));

-- ============================================================
-- user_roles — Maps auth users to admin/user roles
-- Used by /api/me to determine if the caller can manage members/users.
-- ============================================================

create table public.user_roles (
  user_id  uuid  primary key references auth.users(id) on delete cascade,
  role     text  not null default 'user'
                 check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

create policy "service role full access"
  on public.user_roles
  using (true)
  with check (true);

-- ============================================================
-- Migration notes (for existing deployments)
-- Run these if the tables already exist and need to be updated:
--
-- ALTER TABLE instructions
--   ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);
-- CREATE INDEX IF NOT EXISTS instructions_user_idx ON instructions (created_by_user_id);
--
-- ALTER TABLE members
--   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
-- CREATE INDEX IF NOT EXISTS members_user_idx ON members (user_id);
-- DROP INDEX IF EXISTS members_name_unique;
-- CREATE UNIQUE INDEX members_name_unique ON members (user_id, lower(name));
--
-- CREATE TABLE IF NOT EXISTS public.user_roles (
--   user_id uuid primary key references auth.users(id) on delete cascade,
--   role text not null default 'user' check (role in ('admin','user')),
--   created_at timestamptz not null default now()
-- );
-- ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "service role full access" ON user_roles USING (true) WITH CHECK (true);
--
-- NOTE: the above user_roles definition is stale — the running production schema has
-- diverged (id/tenant_id/team_id/reseller_id/login_id columns etc. are in active use
-- across the codebase) but the migration that added them was never recorded here.
-- Likewise `teams` and `tenants` are real production tables with no definition in this
-- file. Treat this file as a partial historical record, not the source of truth.
--
-- 16-5: team_categories — per-team display-label overrides for the 8 fixed
-- business-category slots (4 majors x 2 subs). The slot keys (major/sub) are global
-- and fixed; only the label text is customizable per team. A team with no rows here
-- falls back to the global default labels (see BUSINESS_CATEGORIES in mock-data.ts).
-- CREATE TABLE public.team_categories (
--   id          uuid        primary key default gen_random_uuid(),
--   team_id     uuid        not null references teams(id) on delete cascade,
--   major       text        not null check (major in ('1','2','3','4')),
--   major_label text        not null,
--   sub         text        not null check (sub in ('1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2')),
--   sub_label   text        not null,
--   updated_at  timestamptz not null default now(),
--   unique (team_id, sub)
-- );
-- ALTER TABLE public.team_categories ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "service role full access" ON public.team_categories USING (true) WITH CHECK (true);
-- CREATE INDEX team_categories_team_idx ON public.team_categories (team_id);
--
-- 16-6: instruction_templates — up to 3 per-instructor reusable instruction
-- skeletons, saved from a GO-confirmed instruction (see StepDone in
-- WorkflowClient.tsx). slot is 1-3; saving a 4th replaces a chosen existing slot
-- (upsert on user_id+slot) rather than growing without bound.
-- CREATE TABLE public.instruction_templates (
--   id            uuid        primary key default gen_random_uuid(),
--   user_id       uuid        not null references auth.users(id) on delete cascade,
--   slot          integer     not null check (slot in (1,2,3)),
--   label         text        not null,
--   overview      text        not null,
--   constraints   text,
--   tone          text,
--   support_mode  text        check (support_mode in ('efficiency', 'coaching')),
--   importance    text        check (importance in ('standard', 'high')),
--   created_at    timestamptz not null default now(),
--   unique (user_id, slot)
-- );
-- ALTER TABLE public.instruction_templates ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "service role full access" ON public.instruction_templates USING (true) WITH CHECK (true);
--
-- 18-2: instructions.feedback_acknowledged_at — 担当者からのフィードバック
-- （feedback_status/feedback_comment/feedback_at）を指示者が確認済みかどうか。
-- 未確認（NULL）のものだけをFeedbackNotificationGuardのポップアップ対象にする。
-- ALTER TABLE public.instructions
--   ADD COLUMN feedback_acknowledged_at timestamptz;
--
-- リリース時点の既存回答は「最初から確認済み」として扱い、機能デプロイ直後に
-- 過去分が一斉にポップアップしないようにする（1回だけ実行すればよい）。
-- UPDATE public.instructions
--   SET feedback_acknowledged_at = now()
--   WHERE feedback_status IS NOT NULL AND feedback_acknowledged_at IS NULL;
-- ============================================================
