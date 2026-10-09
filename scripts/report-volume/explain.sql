-- Las consultas de §6.2 del contrato de R3, sobre el volumen de `seed.sql`:
-- Q1 a Q6 son las de R2a y R2b con el texto de la lectura por niveles (Q4,
-- `listTimesheetEntries`, no cambia), y Q7 a Q10 las nuevas. Cada sentencia es
-- el texto que emite el repository (`.toSQL()`), preparada con sus parámetros
-- como los manda el driver: los instantes son los que calcula `startOfDayKey`
-- en Buenos Aires, que no tiene cambio de horario.
--
--   docker exec -i <contenedor> psql -U clock -d <base> -v ON_ERROR_STOP=1 < scripts/report-volume/explain.sql
--
-- Una corrida de calentamiento y cinco `explain (analyze, buffers)` por
-- consulta; se toma la mediana del `Execution Time`.

-- El driver manda cada sentencia sin nombre: el plan se arma con los valores.
set plan_cache_mode = force_custom_plan;

\set workspace '''00000000-0000-4000-8000-000000000001'''
\set member '''volume-user-02'''
\set week_from '(date_trunc(''week'', (now() at time zone ''America/Argentina/Buenos_Aires'')) at time zone ''America/Argentina/Buenos_Aires'')'
\set week_to '((date_trunc(''week'', (now() at time zone ''America/Argentina/Buenos_Aires'')) + interval ''7 days'') at time zone ''America/Argentina/Buenos_Aires'')'
\set year_from '((date_trunc(''year'', (now() at time zone ''America/Argentina/Buenos_Aires'')) - interval ''1 year'') at time zone ''America/Argentina/Buenos_Aires'')'
\set year_to '((date_trunc(''year'', (now() at time zone ''America/Argentina/Buenos_Aires'')) - interval ''1 year'' + interval ''366 days'') at time zone ''America/Argentina/Buenos_Aires'')'

-- Q1: totalsByLevels [person], everyone, la semana actual: la página sin parámetros. Presupuesto: mediana <= 15 ms.
\echo '== Q1'
prepare q1 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1";

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

-- Q2: totalsByLevels [project], everyone, los 366 días desde el 1 de enero del año pasado. Presupuesto: mediana <= 150 ms.
\echo '== Q2'
prepare q2 as
select "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "project_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_1") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id");

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

-- Q3: totalsByLevels [person], self, los mismos 366 días. Presupuesto: mediana <= 30 ms.
\echo '== Q3'
prepare q3 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $1 and "time_entry"."user_id" = $2) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1";

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

-- Los cortes de Q5 y Q6: el inicio de cada uno de los 366 días desde el 1 de
-- enero del año pasado, la medianoche de Buenos Aires, igual a lo que da
-- `startOfDayKey`. Llegan como el literal de texto que arma el driver con los
-- `toISOString()`: `EXECUTE` no admite una subconsulta como parámetro.
select array_agg(to_char((day at time zone 'America/Argentina/Buenos_Aires') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') order by day)::text as day_cuts
  from generate_series(
         date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year',
         date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year' + interval '365 days',
         interval '1 day'
       ) as day \gset
select cardinality(:'day_cuts'::timestamptz[]) as cuts, (:'day_cuts'::timestamptz[])[1] as first_cut;

-- Q5: totalsByLevels [date], everyone, los 366 días desde el 1 de enero del año pasado, un tramo por día. Presupuesto: mediana <= 150 ms.
-- El arreglo de cortes es un solo parámetro, `$1`, como lo manda el driver.
\echo '== Q5'
prepare q5 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals";

\echo '-- calentamiento'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to);

-- Q6: totalsByLevels [date], self, los mismos 366 días. Presupuesto: mediana <= 30 ms.
\echo '== Q6'
prepare q6 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $2 and "time_entry"."user_id" = $3) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals";

\echo '-- calentamiento'
explain (analyze, buffers) execute q6(:'day_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q6(:'day_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q6(:'day_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q6(:'day_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q6(:'day_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q6(:'day_cuts', :workspace, :member, :year_from, :year_to);

-- Q7: totalsByLevels [client], everyone, los mismos 366 días. Presupuesto: mediana <= 150 ms.
\echo '== Q7'
prepare q7 as
select "group_client"."id", "group_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "time_entry"."workspace_id" as "workspace_id", "entry_project"."client_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at"))) as "seconds", "time_entry"."billable" as "billable" from "time_entry" left join "project" "entry_project" on ("entry_project"."workspace_id" = "time_entry"."workspace_id" and "entry_project"."id" = "time_entry"."project_id") where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" left join "client" "group_client" on ("group_client"."workspace_id" = "totals"."workspace_id" and "group_client"."id" = "totals"."key_1");

\echo '-- calentamiento'
explain (analyze, buffers) execute q7(:workspace, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q7(:workspace, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q7(:workspace, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q7(:workspace, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q7(:workspace, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q7(:workspace, :year_from, :year_to);

-- Q8: totalsByLevels [task], everyone, los mismos 366 días. Presupuesto: mediana <= 150 ms.
\echo '== Q8'
prepare q8 as
select "task"."id", "task"."name", "task_project"."id", "task_project"."name", "task_project"."color", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "task_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" left join "task" on ("task"."workspace_id" = "totals"."workspace_id" and "task"."id" = "totals"."key_1") left join "project" "task_project" on ("task_project"."workspace_id" = "task"."workspace_id" and "task_project"."id" = "task"."project_id");

\echo '-- calentamiento'
explain (analyze, buffers) execute q8(:workspace, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q8(:workspace, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q8(:workspace, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q8(:workspace, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q8(:workspace, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q8(:workspace, :year_from, :year_to);

-- Q9: totalsByLevels [tag], everyone, los mismos 366 días. Presupuesto: mediana <= 150 ms.
\echo '== Q9'
prepare q9 as
select "tag"."id", "tag"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "time_entry"."workspace_id" as "workspace_id", "time_entry_tag"."tag_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at"))) as "seconds", "time_entry"."billable" as "billable" from "time_entry" left join "time_entry_tag" on ("time_entry_tag"."workspace_id" = "time_entry"."workspace_id" and "time_entry_tag"."time_entry_id" = "time_entry"."id") where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" left join "tag" on ("tag"."workspace_id" = "totals"."workspace_id" and "tag"."id" = "totals"."key_1");

\echo '-- calentamiento'
explain (analyze, buffers) execute q9(:workspace, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q9(:workspace, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q9(:workspace, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q9(:workspace, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q9(:workspace, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q9(:workspace, :year_from, :year_to);

-- Q10: entryTotals, everyone, los mismos 366 días: el total por etiqueta. Presupuesto: mediana <= 150 ms.
\echo '== Q10'
prepare q10 as
select coalesce(sum(floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at")))), 0)::bigint, coalesce(sum(floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at")))) filter (where "billable"), 0)::bigint from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3));

\echo '-- calentamiento'
explain (analyze, buffers) execute q10(:workspace, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q10(:workspace, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q10(:workspace, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q10(:workspace, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q10(:workspace, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q10(:workspace, :year_from, :year_to);

deallocate all;
