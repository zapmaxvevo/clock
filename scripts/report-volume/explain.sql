-- Las cuatro consultas de §6.2 del contrato de R2a, sobre el volumen de
-- `seed.sql`. Cada sentencia es el texto que emite el repository (`.toSQL()`),
-- preparada con sus parámetros como los manda el driver: los instantes son los
-- que calcula `startOfDayKey` en Buenos Aires, que no tiene cambio de horario.
--
--   docker exec -i <contenedor> psql -U clock -d <base> -v ON_ERROR_STOP=1 < scripts/report-volume/explain.sql
--
-- Una corrida de calentamiento y cinco `explain (analyze, buffers)` por
-- consulta; se toma la mediana del `Execution Time`. Para medir con el índice
-- parcial, se crea a mano con la definición de §2, se corre
-- `analyze time_entry` y se vuelve a correr este archivo.

-- El driver manda cada sentencia sin nombre: el plan se arma con los valores.
set plan_cache_mode = force_custom_plan;

\set workspace '''00000000-0000-4000-8000-000000000001'''
\set member '''volume-user-02'''
\set week_from '(date_trunc(''week'', (now() at time zone ''America/Argentina/Buenos_Aires'')) at time zone ''America/Argentina/Buenos_Aires'')'
\set week_to '((date_trunc(''week'', (now() at time zone ''America/Argentina/Buenos_Aires'')) + interval ''7 days'') at time zone ''America/Argentina/Buenos_Aires'')'
\set year_from '((date_trunc(''year'', (now() at time zone ''America/Argentina/Buenos_Aires'')) - interval ''1 year'') at time zone ''America/Argentina/Buenos_Aires'')'
\set year_to '((date_trunc(''year'', (now() at time zone ''America/Argentina/Buenos_Aires'')) - interval ''1 year'' + interval ''366 days'') at time zone ''America/Argentina/Buenos_Aires'')'

-- Q1: totalsByPerson, everyone, la semana actual: la página sin parámetros. Presupuesto: mediana <= 15 ms.
\echo '== Q1'
prepare q1 as
select "totals"."user_id", "user"."name", "user_preference"."display_name", "membership"."status", "seconds", "billable_seconds" from (select "workspace_id", "user_id", sum(floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at"))))::bigint as "seconds", coalesce(sum(floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at")))) filter (where "billable"), 0)::bigint as "billable_seconds" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3)) group by "time_entry"."workspace_id", "time_entry"."user_id") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."user_id") inner join "user" on "user"."id" = "totals"."user_id" left join "user_preference" on "user_preference"."user_id" = "totals"."user_id";

\echo '-- calentamiento'
explain (analyze, buffers) execute q1(:workspace, :week_from, :week_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q1(:workspace, :week_from, :week_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q1(:workspace, :week_from, :week_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q1(:workspace, :week_from, :week_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q1(:workspace, :week_from, :week_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q1(:workspace, :week_from, :week_to);

-- Q2: totalsByProject, everyone, los 366 días desde el 1 de enero del año pasado. Presupuesto: mediana <= 150 ms.
\echo '== Q2'
prepare q2 as
select "project"."id", "project"."name", "project"."color", "client"."id", "client"."name", "seconds", "billable_seconds" from (select "workspace_id", "project_id", sum(floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at"))))::bigint as "seconds", coalesce(sum(floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at")))) filter (where "billable"), 0)::bigint as "billable_seconds" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3)) group by "time_entry"."workspace_id", "time_entry"."project_id") "totals" left join "project" on ("project"."workspace_id" = "totals"."workspace_id" and "project"."id" = "totals"."project_id") left join "client" on ("client"."workspace_id" = "project"."workspace_id" and "client"."id" = "project"."client_id");

\echo '-- calentamiento'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to);

-- Q3: totalsByPerson, self, los mismos 366 días. Presupuesto: mediana <= 30 ms.
\echo '== Q3'
prepare q3 as
select "totals"."user_id", "user"."name", "user_preference"."display_name", "membership"."status", "seconds", "billable_seconds" from (select "workspace_id", "user_id", sum(floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at"))))::bigint as "seconds", coalesce(sum(floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at")))) filter (where "billable"), 0)::bigint as "billable_seconds" from "time_entry" where (("time_entry"."workspace_id" = $1 and "time_entry"."user_id" = $2) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4)) group by "time_entry"."workspace_id", "time_entry"."user_id") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."user_id") inner join "user" on "user"."id" = "totals"."user_id" left join "user_preference" on "user_preference"."user_id" = "totals"."user_id";

\echo '-- calentamiento'
explain (analyze, buffers) execute q3(:workspace, :member, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q3(:workspace, :member, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q3(:workspace, :member, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q3(:workspace, :member, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q3(:workspace, :member, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q3(:workspace, :member, :year_from, :year_to);

-- Q4: listTimesheetEntries de una persona y la semana actual. El plan no cambia con el índice.
\echo '== Q4'
prepare q4 as
select "time_entry"."id", "time_entry"."workspace_id", "time_entry"."user_id", "time_entry"."description", "time_entry"."started_at", "time_entry"."ended_at", "time_entry"."project_id", "time_entry"."task_id", "time_entry"."billable", "time_entry"."created_at", "time_entry"."updated_at", "project"."id", "project"."name", "project"."color", "task"."id", "task"."name", coalesce((
  select json_agg(json_build_object('id', "tag"."id", 'name', "tag"."name"))
  from "time_entry_tag"
  inner join "tag"
    on "tag"."workspace_id" = "time_entry_tag"."workspace_id" and "tag"."id" = "time_entry_tag"."tag_id"
  where "time_entry_tag"."workspace_id" = "time_entry"."workspace_id"
    and "time_entry_tag"."time_entry_id" = "time_entry"."id"
), '[]'::json), "client"."id", "client"."name" from "time_entry" left join "project" on ("project"."workspace_id" = "time_entry"."workspace_id" and "project"."id" = "time_entry"."project_id") left join "task" on ("task"."workspace_id" = "time_entry"."workspace_id" and "task"."project_id" = "time_entry"."project_id" and "task"."id" = "time_entry"."task_id") left join "client" on ("client"."workspace_id" = "project"."workspace_id" and "client"."id" = "project"."client_id") where ("time_entry"."workspace_id" = $1 and "time_entry"."user_id" = $2 and "time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4) order by "time_entry"."started_at" asc, "time_entry"."created_at" asc, "time_entry"."id" asc;

\echo '-- calentamiento'
explain (analyze, buffers) execute q4(:workspace, :member, :week_from, :week_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q4(:workspace, :member, :week_from, :week_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q4(:workspace, :member, :week_from, :week_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q4(:workspace, :member, :week_from, :week_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q4(:workspace, :member, :week_from, :week_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q4(:workspace, :member, :week_from, :week_to);

deallocate all;
