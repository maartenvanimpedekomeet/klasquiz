ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS avatar jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS answer_visible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_scores boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS question_order jsonb DEFAULT '[]'::jsonb;
