CREATE TABLE IF NOT EXISTS public.water_planning_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  proximity_threshold_m numeric(10, 2) NOT NULL DEFAULT 2000
    CHECK (proximity_threshold_m > 0 AND proximity_threshold_m <= 20000),
  demand_standard_lpd numeric(8, 2) NOT NULL DEFAULT 20
    CHECK (demand_standard_lpd = 20),
  scenario_status varchar(20) NOT NULL DEFAULT 'saved'
    CHECK (scenario_status IN ('saved')),
  calculated_at timestamptz NOT NULL,
  source_data_timestamp timestamptz NOT NULL,
  calculation_version varchar(40) NOT NULL,
  map_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.water_planning_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL
    REFERENCES public.water_planning_scenarios(id) ON DELETE CASCADE,
  supplying_tank_id varchar NOT NULL
    REFERENCES public.tanks(id) ON DELETE RESTRICT,
  receiving_tank_id varchar NOT NULL
    REFERENCES public.tanks(id) ON DELETE RESTRICT,
  allocated_population integer NOT NULL CHECK (allocated_population > 0),
  allocated_water_m3_day numeric(14, 4) NOT NULL
    CHECK (allocated_water_m3_day > 0),
  distance_m numeric(14, 2) NOT NULL CHECK (distance_m >= 0),
  CONSTRAINT water_planning_allocations_distinct_tanks
    CHECK (supplying_tank_id <> receiving_tank_id),
  CONSTRAINT water_planning_allocations_pair_unique
    UNIQUE (scenario_id, supplying_tank_id, receiving_tank_id)
);

CREATE TABLE IF NOT EXISTS public.water_planning_tank_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL
    REFERENCES public.water_planning_scenarios(id) ON DELETE CASCADE,
  tank_id varchar NOT NULL REFERENCES public.tanks(id) ON DELETE RESTRICT,
  original_balance_m3_day numeric(14, 4) NOT NULL,
  scenario_balance_m3_day numeric(14, 4) NOT NULL,
  allocated_in_m3_day numeric(14, 4) NOT NULL DEFAULT 0,
  allocated_out_m3_day numeric(14, 4) NOT NULL DEFAULT 0,
  CONSTRAINT water_planning_tank_results_scenario_tank_unique
    UNIQUE (scenario_id, tank_id)
);

CREATE INDEX IF NOT EXISTS water_planning_scenarios_updated_at_idx
  ON public.water_planning_scenarios (updated_at DESC);
CREATE INDEX IF NOT EXISTS water_planning_allocations_scenario_idx
  ON public.water_planning_allocations (scenario_id);
CREATE INDEX IF NOT EXISTS water_planning_allocations_tanks_idx
  ON public.water_planning_allocations (supplying_tank_id, receiving_tank_id);
CREATE INDEX IF NOT EXISTS water_planning_tank_results_scenario_idx
  ON public.water_planning_tank_results (scenario_id);
