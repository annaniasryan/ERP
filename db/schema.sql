-- Optional: the API creates this table automatically on first use.
create table if not exists erp_demo_state (
  id int primary key,
  rev int not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
