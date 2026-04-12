-- Run via Supabase CLI (`supabase db push`) or paste into SQL Editor in the Supabase dashboard.

create table if not exists public.questionnaire_responses (
  participant_id text not null,
  session_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (participant_id, session_id)
);

create index if not exists questionnaire_responses_created_at_idx
  on public.questionnaire_responses (created_at desc);

alter table public.questionnaire_responses enable row level security;
