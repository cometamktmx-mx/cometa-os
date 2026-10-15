-- COMETA Studio Operation V1: operational capacity, not attendance or payroll.
CREATE TABLE public.cometa_studio_work_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  typical_start_time time,
  target_minutes integer NOT NULL,
  work_days smallint[],
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cometa_studio_work_profiles_target_check CHECK (target_minutes BETWEEN 30 AND 900),
  CONSTRAINT cometa_studio_work_profiles_days_check CHECK (
    work_days IS NULL OR work_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  ),
  CONSTRAINT cometa_studio_work_profiles_timezone_check CHECK (length(btrim(timezone)) BETWEEN 1 AND 100)
);

CREATE TABLE public.cometa_studio_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_date date NOT NULL,
  timezone_snapshot text NOT NULL,
  typical_start_snapshot time,
  target_minutes_snapshot integer NOT NULL,
  status text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  total_paused_seconds integer NOT NULL DEFAULT 0,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cometa_studio_operations_status_check CHECK (status IN ('active','paused','closed')),
  CONSTRAINT cometa_studio_operations_target_check CHECK (target_minutes_snapshot BETWEEN 30 AND 900),
  CONSTRAINT cometa_studio_operations_paused_seconds_check CHECK (total_paused_seconds >= 0),
  CONSTRAINT cometa_studio_operations_state_check CHECK (
    (status = 'active' AND paused_at IS NULL AND closed_at IS NULL) OR
    (status = 'paused' AND paused_at IS NOT NULL AND closed_at IS NULL) OR
    (status = 'closed' AND paused_at IS NULL AND closed_at IS NOT NULL)
  ),
  CONSTRAINT cometa_studio_operations_time_order_check CHECK (closed_at IS NULL OR closed_at >= opened_at)
);

CREATE UNIQUE INDEX cometa_studio_operations_one_open_idx
  ON public.cometa_studio_operations (user_id)
  WHERE status IN ('active','paused');
CREATE INDEX cometa_studio_operations_user_date_idx
  ON public.cometa_studio_operations (user_id, operation_date DESC, opened_at);

ALTER TABLE public.cometa_studio_work_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cometa_studio_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cometa_studio_work_profiles FROM anon, authenticated;
REVOKE ALL ON public.cometa_studio_operations FROM anon, authenticated;
GRANT ALL ON public.cometa_studio_work_profiles TO service_role;
GRANT ALL ON public.cometa_studio_operations TO service_role;

CREATE OR REPLACE FUNCTION public.cometa_studio_operation_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER cometa_studio_work_profiles_updated_at
  BEFORE UPDATE ON public.cometa_studio_work_profiles FOR EACH ROW
  EXECUTE FUNCTION public.cometa_studio_operation_touch_updated_at();
CREATE TRIGGER cometa_studio_operations_updated_at
  BEFORE UPDATE ON public.cometa_studio_operations FOR EACH ROW
  EXECUTE FUNCTION public.cometa_studio_operation_touch_updated_at();

-- Atomic transition authority. p_user_id is supplied only by a guarded server route;
-- authenticated and anon roles cannot execute this function or write these tables.
CREATE OR REPLACE FUNCTION public.cometa_studio_operation_transition_v1(p_user_id uuid, p_action text)
RETURNS SETOF public.cometa_studio_operations
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_profile public.cometa_studio_work_profiles%ROWTYPE;
  v_current public.cometa_studio_operations%ROWTYPE;
BEGIN
  IF p_action NOT IN ('open','pause','resume','close') THEN
    RAISE EXCEPTION 'OPERATION_ACTION_INVALID';
  END IF;

  SELECT * INTO v_current FROM public.cometa_studio_operations
    WHERE user_id = p_user_id AND status IN ('active','paused')
    ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;

  IF p_action = 'open' THEN
    IF FOUND THEN RETURN NEXT v_current; RETURN; END IF;
    SELECT * INTO v_profile FROM public.cometa_studio_work_profiles WHERE user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'OPERATION_PROFILE_REQUIRED'; END IF;
    BEGIN
      INSERT INTO public.cometa_studio_operations (
        user_id, operation_date, timezone_snapshot, typical_start_snapshot,
        target_minutes_snapshot, status, opened_at
      ) VALUES (
        p_user_id, (v_now AT TIME ZONE v_profile.timezone)::date, v_profile.timezone,
        v_profile.typical_start_time, v_profile.target_minutes, 'active', v_now
      ) RETURNING * INTO v_current;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_current FROM public.cometa_studio_operations
        WHERE user_id = p_user_id AND status IN ('active','paused') ORDER BY opened_at DESC LIMIT 1;
    END;
    RETURN NEXT v_current; RETURN;
  END IF;

  IF NOT FOUND THEN RAISE EXCEPTION 'OPERATION_NOT_OPEN'; END IF;
  IF p_action = 'pause' THEN
    IF v_current.status = 'paused' THEN RETURN NEXT v_current; RETURN; END IF;
    UPDATE public.cometa_studio_operations SET status = 'paused', paused_at = v_now
      WHERE id = v_current.id RETURNING * INTO v_current;
  ELSIF p_action = 'resume' THEN
    IF v_current.status = 'active' THEN RETURN NEXT v_current; RETURN; END IF;
    UPDATE public.cometa_studio_operations SET
      status = 'active',
      total_paused_seconds = total_paused_seconds + GREATEST(0, floor(extract(epoch FROM (v_now - paused_at)))::integer),
      paused_at = NULL
      WHERE id = v_current.id RETURNING * INTO v_current;
  ELSE
    UPDATE public.cometa_studio_operations SET
      status = 'closed',
      total_paused_seconds = total_paused_seconds + CASE WHEN paused_at IS NULL THEN 0 ELSE GREATEST(0, floor(extract(epoch FROM (v_now - paused_at)))::integer) END,
      paused_at = NULL,
      closed_at = v_now
      WHERE id = v_current.id RETURNING * INTO v_current;
  END IF;
  RETURN NEXT v_current;
END; $$;

REVOKE ALL ON FUNCTION public.cometa_studio_operation_transition_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cometa_studio_operation_transition_v1(uuid, text) TO service_role;
