-- 069_messenger_chatbot.sql
-- Requires 047. GlowSync AI answers messages sent to the Facebook Page.
-- One row per Messenger user (PSID): the last few turns, so replies follow
-- the conversation, and a pause so the bot stays quiet while a staff member
-- is chatting (they replied from the Page inbox, or the customer typed STAFF).
-- Only the server (service role) reads or writes it.

create table if not exists messenger_bot_state (
  psid text primary key,
  history jsonb not null default '[]'::jsonb,
  paused_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table messenger_bot_state enable row level security;
revoke all on messenger_bot_state from anon, authenticated;

notify pgrst, 'reload schema';
