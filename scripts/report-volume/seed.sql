-- Volumen sintético del reporte (contrato de R2a, §6.1, y de R3, §6.1). Determinista: `setseed`
-- fija `random()` y los ids salen de contadores. Se corre una vez sobre una base
-- vacía migrada hasta la 0014; las fechas son relativas al día en que corre.
--
--   docker exec -i <contenedor> psql -U clock -d <base> -v ON_ERROR_STOP=1 < scripts/report-volume/seed.sql
--
-- Un workspace, 30 personas (el owner, 27 activas y 2 inactivas), 6 clientes,
-- 24 proyectos (16 con cliente, 4 archivados, la mitad con tareas), tres años
-- de días hábiles que terminan ayer con 8 entradas por persona y por día entre
-- las 08:00 y las 19:00 de Buenos Aires, y un timer abierto para cinco
-- personas. Doce etiquetas, dos archivadas, en el 60 % de las entradas
-- cerradas.

begin;

-- Sobre otra base los ids chocan, o peor, el volumen se suma a datos reales.
do $$
begin
  if exists (select 1 from workspace) or exists (select 1 from "user") then
    raise exception 'seed.sql pide una base vacía migrada hasta la 0014.';
  end if;
end
$$;

select setseed(0.2026);

insert into "user" (id, name, email, email_verified)
select
  format('volume-user-%s', lpad(i::text, 2, '0')),
  format('Persona %s', i),
  format('persona%s@empresa.com', i),
  true
from generate_series(1, 30) as i;

insert into workspace (id, name, owner_id, timezone)
values (
  '00000000-0000-4000-8000-000000000001',
  'Volumen',
  'volume-user-01',
  'America/Argentina/Buenos_Aires'
);

insert into workspace_settings (workspace_id)
values ('00000000-0000-4000-8000-000000000001');

insert into membership (workspace_id, user_id, role, status)
select
  '00000000-0000-4000-8000-000000000001',
  format('volume-user-%s', lpad(i::text, 2, '0')),
  (case when i = 1 then 'owner' else 'member' end)::workspace_role,
  (case when i > 28 then 'inactive' else 'active' end)::membership_status
from generate_series(1, 30) as i;

-- La mitad con el nombre editado.
insert into user_preference (user_id, display_name)
select format('volume-user-%s', lpad(i::text, 2, '0')), format('Nombre editado %s', i)
from generate_series(2, 30, 2) as i;

insert into client (id, workspace_id, name)
select
  format('00000000-0000-4000-8001-%s', lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  format('Cliente %s', i)
from generate_series(1, 6) as i;

insert into project (id, workspace_id, client_id, name, color, archived_at)
select
  format('00000000-0000-4000-8002-%s', lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  case
    when i <= 16 then format('00000000-0000-4000-8001-%s', lpad(((i - 1) % 6 + 1)::text, 12, '0'))::uuid
  end,
  format('Proyecto %s', i),
  (array['red', 'orange', 'amber', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink', 'slate'])[(i - 1) % 12 + 1],
  case when i > 20 then now() end
from generate_series(1, 24) as i;

-- Tres tareas en cada proyecto par.
insert into task (id, workspace_id, project_id, name)
select
  format('00000000-0000-4000-8003-%s', lpad((p * 10 + t)::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  format('00000000-0000-4000-8002-%s', lpad(p::text, 12, '0'))::uuid,
  format('Tarea %s', t)
from generate_series(2, 24, 2) as p
cross join generate_series(1, 3) as t;

-- Ocho franjas de 82 minutos desde las 08:00: la última termina antes de las
-- 19:00. Cada entrada dura de 30 a 75 minutos dentro de su franja, así que no
-- se superponen.
with today as (
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date as day
),
days as (
  select d::date as day
  from today,
    generate_series(today.day - interval '3 years', today.day - interval '1 day', interval '1 day') as d
  where extract(isodow from d) < 6
),
slots as (
  select
    person,
    days.day,
    slot,
    random() as r_duration,
    random() as r_offset,
    random() as r_project,
    random() as r_pick,
    random() as r_task,
    random() as r_billable
  from generate_series(1, 30) as person
  cross join days
  cross join generate_series(0, 7) as slot
  order by person, days.day, slot
),
shaped as (
  select
    row_number() over (order by person, day, slot) as n,
    person,
    day,
    slot,
    30 + floor(r_duration * 46)::int as minutes,
    r_offset,
    case when r_project >= 0.1 then floor(r_pick * 24)::int + 1 end as project,
    r_task,
    r_billable < 0.4 as billable
  from slots
),
timed as (
  select
    *,
    (day + time '08:00' + make_interval(mins => slot * 82 + floor(r_offset * (82 - minutes + 1))::int))
      at time zone 'America/Argentina/Buenos_Aires' as started_at
  from shaped
)
insert into time_entry (id, workspace_id, user_id, started_at, ended_at, project_id, task_id, billable)
select
  format('00000000-0000-4000-9000-%s', lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  format('volume-user-%s', lpad(person::text, 2, '0')),
  started_at,
  started_at + make_interval(mins => minutes),
  case when project is not null then format('00000000-0000-4000-8002-%s', lpad(project::text, 12, '0'))::uuid end,
  case
    when project is not null and project % 2 = 0 and r_task < 0.5
      then format('00000000-0000-4000-8003-%s', lpad((project * 10 + floor(r_task * 6)::int + 1)::text, 12, '0'))::uuid
  end,
  billable
from timed;

-- Cinco timers abiertos, de hoy.
insert into time_entry (id, workspace_id, user_id, started_at)
select
  format('00000000-0000-4000-9001-%s', lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  format('volume-user-%s', lpad(i::text, 2, '0')),
  now() - interval '1 hour'
from generate_series(2, 6) as i;

-- Doce etiquetas; la 11 y la 12, archivadas.
insert into tag (id, workspace_id, name, archived_at)
select
  format('00000000-0000-4000-8004-%s', lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  format('Etiqueta %s', i),
  case when i > 10 then now() end
from generate_series(1, 12) as i;

-- Después de las entradas, que así no cambian: Q1 a Q6 se comparan con R2a y
-- R2b. Cada entrada cerrada, con su propio `random()`: 40 % sin etiquetas, 35 %
-- con una, 20 % con dos y 5 % con tres, consecutivas desde una al azar.
with drawn as (
  select ordered.id, random() as r_count, random() as r_first
  from (select id from time_entry where ended_at is not null order by id) as ordered
),
counted as (
  select
    id,
    case
      when r_count < 0.40 then 0
      when r_count < 0.75 then 1
      when r_count < 0.95 then 2
      else 3
    end as tags,
    floor(r_first * 12)::int as first
  from drawn
)
insert into time_entry_tag (workspace_id, time_entry_id, tag_id)
select
  '00000000-0000-4000-8000-000000000001',
  id,
  format('00000000-0000-4000-8004-%s', lpad(((first + k) % 12 + 1)::text, 12, '0'))::uuid
from counted
cross join generate_series(0, 2) as k
where k < tags;

commit;

analyze;
