-- Las consultas de §6.2 y §6.3 del contrato de R3, sobre el volumen de `seed.sql`:
-- Q1 a Q6 son las de R2a y R2b con el texto de la lectura por niveles (Q4,
-- `listTimesheetEntries`, no cambia), y Q7 a Q10 las nuevas. Q17 a Q22 son
-- las de §6.2 del contrato de R4, con los filtros de cliente y de proyecto, y
-- Q23 y Q24 las de §6.3, con el filtro de personas y su catálogo. Q25 a Q30
-- son las de §6.2 del contrato de R10, por semana y por mes, y Q31 a Q34 las
-- de §6.3, por descripción, y Q35 a Q39 las de §6.2 del contrato de R5, la
-- lectura del gráfico. Desde R10b el primer nivel también lleva el
-- `limit` del tope, `REPORT_MAX_ROWS + 1` (D-R10-10): el `limit $n` lo llevan
-- solo Q2, Q5 y Q11; las demás de primer nivel no lo llevan, aunque el
-- repository lo mande.
-- Cada sentencia es el texto que emite el repository (`.toSQL()`), preparada
-- con sus parámetros como los manda el driver: los instantes son los que
-- calcula `startOfDayKey` en Buenos Aires, que no tiene cambio de horario.
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

-- Q2: totalsByLevels [project], everyone, los 366 días desde el 1 de enero del año pasado, con `limit 3001`. Presupuesto: mediana <= 150 ms.
\echo '== Q2'
prepare q2 as
select "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "project_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_1") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $4;

\echo '-- calentamiento'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to, 3001);
\echo '-- medida 1'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to, 3001);
\echo '-- medida 2'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to, 3001);
\echo '-- medida 3'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to, 3001);
\echo '-- medida 4'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to, 3001);
\echo '-- medida 5'
explain (analyze, buffers) execute q2(:workspace, :year_from, :year_to, 3001);

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

-- Q5: totalsByLevels [date], everyone, los 366 días desde el 1 de enero del año pasado, un tramo por día, con `limit 3001`. Presupuesto: mediana <= 150 ms.
-- El arreglo de cortes es un solo parámetro, `$1`, como lo manda el driver.
\echo '== Q5'
prepare q5 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" limit $5;

\echo '-- calentamiento'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to, 3001);
\echo '-- medida 1'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to, 3001);
\echo '-- medida 2'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to, 3001);
\echo '-- medida 3'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to, 3001);
\echo '-- medida 4'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to, 3001);
\echo '-- medida 5'
explain (analyze, buffers) execute q5(:'day_cuts', :workspace, :year_from, :year_to, 3001);

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

-- Parte B (§6.3 del contrato de R3): los niveles de abajo con el `limit` de su
-- presupuesto, `REPORT_MAX_ROWS` (3000) menos las filas de los niveles de
-- arriba, más uno, como lo calcula el service. Las filas de cada nivel se
-- cuentan con la misma sentencia, sin el `limit`, antes de medir.
-- Q11: totalsByLevels [person], everyone, 366 días, con `limit 3001`: el primer nivel del pedido de Q12 y Q13. Presupuesto: mediana <= 150 ms.
\echo '== Q11'
prepare q11 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" limit $4;

\echo '-- calentamiento'
explain (analyze, buffers) execute q11(:workspace, :year_from, :year_to, 3001);
\echo '-- medida 1'
explain (analyze, buffers) execute q11(:workspace, :year_from, :year_to, 3001);
\echo '-- medida 2'
explain (analyze, buffers) execute q11(:workspace, :year_from, :year_to, 3001);
\echo '-- medida 3'
explain (analyze, buffers) execute q11(:workspace, :year_from, :year_to, 3001);
\echo '-- medida 4'
explain (analyze, buffers) execute q11(:workspace, :year_from, :year_to, 3001);
\echo '-- medida 5'
explain (analyze, buffers) execute q11(:workspace, :year_from, :year_to, 3001);

-- Las filas de cada nivel, sin tope: un `limit` mayor que cualquier nivel.
prepare q11_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1") as level_rows;
execute q11_rows(:workspace, :year_from, :year_to) \gset q11_
prepare q12_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $4) as level_rows;
execute q12_rows(:workspace, :year_from, :year_to, 1000000) \gset q12_
prepare q13_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."key_3", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", "entries"."key_3" as "key_3", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", width_bucket("started_at", $1::timestamptz[]) as "key_3", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2", "entries"."key_3") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $5) as level_rows;
execute q13_rows(:'day_cuts', :workspace, :year_from, :year_to, 1000000) \gset q13_
prepare q9_rows as select count(*) from (select "tag"."id", "tag"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "time_entry"."workspace_id" as "workspace_id", "time_entry_tag"."tag_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at"))) as "seconds", "time_entry"."billable" as "billable" from "time_entry" left join "time_entry_tag" on ("time_entry_tag"."workspace_id" = "time_entry"."workspace_id" and "time_entry_tag"."time_entry_id" = "time_entry"."id") where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" left join "tag" on ("tag"."workspace_id" = "totals"."workspace_id" and "tag"."id" = "totals"."key_1")) as level_rows;
execute q9_rows(:workspace, :year_from, :year_to) \gset q9_
prepare q14_rows as select count(*) from (select "tag"."id", "tag"."name", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "time_entry"."workspace_id" as "workspace_id", "time_entry_tag"."tag_id" as "key_1", "time_entry"."project_id" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at"))) as "seconds", "time_entry"."billable" as "billable" from "time_entry" left join "time_entry_tag" on ("time_entry_tag"."workspace_id" = "time_entry"."workspace_id" and "time_entry_tag"."time_entry_id" = "time_entry"."id") where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" left join "tag" on ("tag"."workspace_id" = "totals"."workspace_id" and "tag"."id" = "totals"."key_1") left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $4) as level_rows;
execute q14_rows(:workspace, :year_from, :year_to, 1000000) \gset q14_
prepare q16_rows as select count(*) from (select "tag"."id", "tag"."name", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."key_3", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", "entries"."key_3" as "key_3", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "time_entry"."workspace_id" as "workspace_id", "time_entry_tag"."tag_id" as "key_1", "time_entry"."project_id" as "key_2", width_bucket("time_entry"."started_at", $1::timestamptz[]) as "key_3", floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at"))) as "seconds", "time_entry"."billable" as "billable" from "time_entry" left join "time_entry_tag" on ("time_entry_tag"."workspace_id" = "time_entry"."workspace_id" and "time_entry_tag"."time_entry_id" = "time_entry"."id") where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2", "entries"."key_3") "totals" left join "tag" on ("tag"."workspace_id" = "totals"."workspace_id" and "tag"."id" = "totals"."key_1") left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $5) as level_rows;
execute q16_rows(:'day_cuts', :workspace, :year_from, :year_to, 1000000) \gset q16_
prepare q3_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $1 and "time_entry"."user_id" = $2) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1") as level_rows;
execute q3_rows(:workspace, :member, :year_from, :year_to) \gset q3_
prepare q15p_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $1 and "time_entry"."user_id" = $2) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $5) as level_rows;
execute q15p_rows(:workspace, :member, :year_from, :year_to, 1000000) \gset q15p_
prepare q15_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."key_3", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", "entries"."key_3" as "key_3", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", width_bucket("started_at", $1::timestamptz[]) as "key_3", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $2 and "time_entry"."user_id" = $3) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2", "entries"."key_3") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $6) as level_rows;
execute q15_rows(:'day_cuts', :workspace, :member, :year_from, :year_to, 1000000) \gset q15_
select 3000 - :q11_count + 1 as q12_limit,
       3000 - :q11_count - :q12_count + 1 as q13_limit,
       3000 - :q9_count + 1 as q14_limit,
       3000 - :q9_count - :q14_count + 1 as q16_limit,
       3000 - :q3_count - :q15p_count + 1 as q15_limit \gset
\echo 'filas por nivel: q11' :q11_count 'q12' :q12_count 'q13' :q13_count 'q9' :q9_count 'q14' :q14_count 'q16' :q16_count 'q3' :q3_count 'q15p' :q15p_count 'q15' :q15_count
\echo 'limit: q12' :q12_limit 'q13' :q13_limit 'q14' :q14_limit 'q16' :q16_limit 'q15' :q15_limit

-- Q12: totalsByLevels [person, project], everyone, 366 días, con el `limit` de su presupuesto. Presupuesto: mediana <= 150 ms.
\echo '== Q12'
prepare q12 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $4;

\echo '-- calentamiento'
explain (analyze, buffers) execute q12(:workspace, :year_from, :year_to, :q12_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q12(:workspace, :year_from, :year_to, :q12_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q12(:workspace, :year_from, :year_to, :q12_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q12(:workspace, :year_from, :year_to, :q12_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q12(:workspace, :year_from, :year_to, :q12_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q12(:workspace, :year_from, :year_to, :q12_limit);

-- Q13: totalsByLevels [person, project, date], everyone, 366 días, con el `limit` de su presupuesto (no entra). Presupuesto: mediana <= 250 ms.
\echo '== Q13'
prepare q13 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."key_3", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", "entries"."key_3" as "key_3", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", width_bucket("started_at", $1::timestamptz[]) as "key_3", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2", "entries"."key_3") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $5;

\echo '-- calentamiento'
explain (analyze, buffers) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);

-- Q14: totalsByLevels [tag, project], everyone, 366 días, con el `limit` de su presupuesto. Presupuesto: mediana <= 150 ms.
\echo '== Q14'
prepare q14 as
select "tag"."id", "tag"."name", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "time_entry"."workspace_id" as "workspace_id", "time_entry_tag"."tag_id" as "key_1", "time_entry"."project_id" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at"))) as "seconds", "time_entry"."billable" as "billable" from "time_entry" left join "time_entry_tag" on ("time_entry_tag"."workspace_id" = "time_entry"."workspace_id" and "time_entry_tag"."time_entry_id" = "time_entry"."id") where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" left join "tag" on ("tag"."workspace_id" = "totals"."workspace_id" and "tag"."id" = "totals"."key_1") left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $4;

\echo '-- calentamiento'
explain (analyze, buffers) execute q14(:workspace, :year_from, :year_to, :q14_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q14(:workspace, :year_from, :year_to, :q14_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q14(:workspace, :year_from, :year_to, :q14_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q14(:workspace, :year_from, :year_to, :q14_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q14(:workspace, :year_from, :year_to, :q14_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q14(:workspace, :year_from, :year_to, :q14_limit);

-- Q15: totalsByLevels [person, project, date], self, 366 días, con el `limit` de su presupuesto. Presupuesto: mediana <= 40 ms.
\echo '== Q15'
prepare q15 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."key_3", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", "entries"."key_3" as "key_3", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", width_bucket("started_at", $1::timestamptz[]) as "key_3", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $2 and "time_entry"."user_id" = $3) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2", "entries"."key_3") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $6;

\echo '-- calentamiento'
explain (analyze, buffers) execute q15(:'day_cuts', :workspace, :member, :year_from, :year_to, :q15_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q15(:'day_cuts', :workspace, :member, :year_from, :year_to, :q15_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q15(:'day_cuts', :workspace, :member, :year_from, :year_to, :q15_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q15(:'day_cuts', :workspace, :member, :year_from, :year_to, :q15_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q15(:'day_cuts', :workspace, :member, :year_from, :year_to, :q15_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q15(:'day_cuts', :workspace, :member, :year_from, :year_to, :q15_limit);

-- Q16: totalsByLevels [tag, project, date], everyone, 366 días, con el `limit` de su presupuesto. Presupuesto: mediana <= 250 ms.
\echo '== Q16'
prepare q16 as
select "tag"."id", "tag"."name", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."key_3", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", "entries"."key_3" as "key_3", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "time_entry"."workspace_id" as "workspace_id", "time_entry_tag"."tag_id" as "key_1", "time_entry"."project_id" as "key_2", width_bucket("time_entry"."started_at", $1::timestamptz[]) as "key_3", floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at"))) as "seconds", "time_entry"."billable" as "billable" from "time_entry" left join "time_entry_tag" on ("time_entry_tag"."workspace_id" = "time_entry"."workspace_id" and "time_entry_tag"."time_entry_id" = "time_entry"."id") where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2", "entries"."key_3") "totals" left join "tag" on ("tag"."workspace_id" = "totals"."workspace_id" and "tag"."id" = "totals"."key_1") left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $5;

\echo '-- calentamiento'
explain (analyze, buffers) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);

-- El pedido Persona → Proyecto → Fecha entero, en una transacción como la del service: Q11 + Q12 + Q13. Presupuesto: <= 450 ms.
\echo '== P1'
\echo '-- calentamiento'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q11(:workspace, :year_from, :year_to, 3001);
explain (analyze) execute q12(:workspace, :year_from, :year_to, :q12_limit);
explain (analyze) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
commit;
\echo '-- medida 1'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q11(:workspace, :year_from, :year_to, 3001);
explain (analyze) execute q12(:workspace, :year_from, :year_to, :q12_limit);
explain (analyze) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
commit;
\echo '-- medida 2'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q11(:workspace, :year_from, :year_to, 3001);
explain (analyze) execute q12(:workspace, :year_from, :year_to, :q12_limit);
explain (analyze) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
commit;
\echo '-- medida 3'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q11(:workspace, :year_from, :year_to, 3001);
explain (analyze) execute q12(:workspace, :year_from, :year_to, :q12_limit);
explain (analyze) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
commit;
\echo '-- medida 4'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q11(:workspace, :year_from, :year_to, 3001);
explain (analyze) execute q12(:workspace, :year_from, :year_to, :q12_limit);
explain (analyze) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
commit;
\echo '-- medida 5'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q11(:workspace, :year_from, :year_to, 3001);
explain (analyze) execute q12(:workspace, :year_from, :year_to, :q12_limit);
explain (analyze) execute q13(:'day_cuts', :workspace, :year_from, :year_to, :q13_limit);
commit;

-- El pedido Etiqueta → Proyecto → Fecha entero: Q9 + Q14 + Q16 + Q10. Presupuesto: <= 600 ms.
\echo '== P2'
\echo '-- calentamiento'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q9(:workspace, :year_from, :year_to);
explain (analyze) execute q14(:workspace, :year_from, :year_to, :q14_limit);
explain (analyze) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;
\echo '-- medida 1'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q9(:workspace, :year_from, :year_to);
explain (analyze) execute q14(:workspace, :year_from, :year_to, :q14_limit);
explain (analyze) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;
\echo '-- medida 2'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q9(:workspace, :year_from, :year_to);
explain (analyze) execute q14(:workspace, :year_from, :year_to, :q14_limit);
explain (analyze) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;
\echo '-- medida 3'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q9(:workspace, :year_from, :year_to);
explain (analyze) execute q14(:workspace, :year_from, :year_to, :q14_limit);
explain (analyze) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;
\echo '-- medida 4'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q9(:workspace, :year_from, :year_to);
explain (analyze) execute q14(:workspace, :year_from, :year_to, :q14_limit);
explain (analyze) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;
\echo '-- medida 5'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q9(:workspace, :year_from, :year_to);
explain (analyze) execute q14(:workspace, :year_from, :year_to, :q14_limit);
explain (analyze) execute q16(:'day_cuts', :workspace, :year_from, :year_to, :q16_limit);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;

-- Contrato de R4, §6.2 (parte A): los filtros de cliente y de proyecto sobre el
-- mismo volumen, con el texto que emite el repository. Los ids van con
-- `inArray`, un parámetro por valor; ningún arreglo nuevo (D-R4-11). Tres
-- proyectos, el 1, el 2 y el 3; dos clientes, el 1 y el 2 (seis proyectos).
\set p1 '''00000000-0000-4000-8002-000000000001'''
\set p2 '''00000000-0000-4000-8002-000000000002'''
\set p3 '''00000000-0000-4000-8002-000000000003'''
\set c1 '''00000000-0000-4000-8001-000000000001'''
\set c2 '''00000000-0000-4000-8001-000000000002'''
\set owner '''volume-user-01'''

-- Q17: totalsByLevels [person], everyone, 366 días, tres proyectos. Presupuesto: mediana <= 150 ms.
\echo '== Q17'
prepare q17 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3) and "time_entry"."project_id" in ($4, $5, $6))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1";

\echo '-- calentamiento'
explain (analyze, buffers) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
\echo '-- medida 1'
explain (analyze, buffers) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
\echo '-- medida 2'
explain (analyze, buffers) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
\echo '-- medida 3'
explain (analyze, buffers) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
\echo '-- medida 4'
explain (analyze, buffers) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
\echo '-- medida 5'
explain (analyze, buffers) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);

-- Q18: totalsByLevels [project], everyone, 366 días, solo «Sin proyecto». Presupuesto: mediana <= 150 ms.
\echo '== Q18'
prepare q18 as
select "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "project_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3) and "time_entry"."project_id" is null)) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_1") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id");

\echo '-- calentamiento'
explain (analyze, buffers) execute q18(:workspace, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q18(:workspace, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q18(:workspace, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q18(:workspace, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q18(:workspace, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q18(:workspace, :year_from, :year_to);

-- Q19: totalsByLevels [person], everyone, 366 días, dos clientes. Presupuesto: mediana <= 150 ms.
\echo '== Q19'
prepare q19 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3) and exists (select 1 from "project" "filter_project" where ("filter_project"."workspace_id" = "time_entry"."workspace_id" and "filter_project"."id" = "time_entry"."project_id" and "filter_project"."client_id" in ($4, $5))))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1";

\echo '-- calentamiento'
explain (analyze, buffers) execute q19(:workspace, :year_from, :year_to, :c1, :c2);
\echo '-- medida 1'
explain (analyze, buffers) execute q19(:workspace, :year_from, :year_to, :c1, :c2);
\echo '-- medida 2'
explain (analyze, buffers) execute q19(:workspace, :year_from, :year_to, :c1, :c2);
\echo '-- medida 3'
explain (analyze, buffers) execute q19(:workspace, :year_from, :year_to, :c1, :c2);
\echo '-- medida 4'
explain (analyze, buffers) execute q19(:workspace, :year_from, :year_to, :c1, :c2);
\echo '-- medida 5'
explain (analyze, buffers) execute q19(:workspace, :year_from, :year_to, :c1, :c2);

-- Q20: entryTotals, everyone, 366 días, tres proyectos y dos clientes. Presupuesto: mediana <= 150 ms.
\echo '== Q20'
prepare q20 as
select coalesce(sum(floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at")))), 0)::bigint, coalesce(sum(floor(extract(epoch from date_trunc('milliseconds', "time_entry"."ended_at") - date_trunc('milliseconds', "time_entry"."started_at")))) filter (where "billable"), 0)::bigint from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3) and ("time_entry"."project_id" in ($4, $5, $6) and exists (select 1 from "project" "filter_project" where ("filter_project"."workspace_id" = "time_entry"."workspace_id" and "filter_project"."id" = "time_entry"."project_id" and "filter_project"."client_id" in ($7, $8)))));

\echo '-- calentamiento'
explain (analyze, buffers) execute q20(:workspace, :year_from, :year_to, :p1, :p2, :p3, :c1, :c2);
\echo '-- medida 1'
explain (analyze, buffers) execute q20(:workspace, :year_from, :year_to, :p1, :p2, :p3, :c1, :c2);
\echo '-- medida 2'
explain (analyze, buffers) execute q20(:workspace, :year_from, :year_to, :p1, :p2, :p3, :c1, :c2);
\echo '-- medida 3'
explain (analyze, buffers) execute q20(:workspace, :year_from, :year_to, :p1, :p2, :p3, :c1, :c2);
\echo '-- medida 4'
explain (analyze, buffers) execute q20(:workspace, :year_from, :year_to, :p1, :p2, :p3, :c1, :c2);
\echo '-- medida 5'
explain (analyze, buffers) execute q20(:workspace, :year_from, :year_to, :p1, :p2, :p3, :c1, :c2);

-- El pedido Persona → Proyecto → Fecha con los tres proyectos: Q17 es su
-- primer nivel, Q21a el segundo y Q21 el tercero, cada uno con el `limit` de
-- su presupuesto, como lo calcula el service. Las filas de cada nivel se
-- cuentan con la misma sentencia, sin el `limit`, antes de medir.
prepare q17_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3) and "time_entry"."project_id" in ($4, $5, $6))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1") as level;
execute q17_rows(:workspace, :year_from, :year_to, :p1, :p2, :p3) \gset q17_
prepare q21a_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3) and "time_entry"."project_id" in ($4, $5, $6))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $7) as level;
execute q21a_rows(:workspace, :year_from, :year_to, :p1, :p2, :p3, 1000000) \gset q21a_
prepare q21_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."key_3", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", "entries"."key_3" as "key_3", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", width_bucket("started_at", $1::timestamptz[]) as "key_3", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4) and "time_entry"."project_id" in ($5, $6, $7))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2", "entries"."key_3") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $8) as level;
execute q21_rows(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, 1000000) \gset q21_
select 3000 - :q17_count + 1 as q21a_limit,
       3000 - :q17_count - :q21a_count + 1 as q21_limit \gset
\echo 'filas por nivel: q17' :q17_count 'q21a' :q21a_count 'q21' :q21_count
\echo 'limit: q21a' :q21a_limit 'q21' :q21_limit

-- Q21a: totalsByLevels [person, project], everyone, 366 días, tres proyectos, con el `limit` de su presupuesto: el nivel 2 del pedido.
\echo '== Q21a'
prepare q21a as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $1 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $2 and "time_entry"."started_at" < $3) and "time_entry"."project_id" in ($4, $5, $6))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $7;

\echo '-- calentamiento'
explain (analyze, buffers) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);

-- Q21: totalsByLevels [person, project, date], everyone, 366 días, tres proyectos, con el `limit` de su presupuesto. Presupuesto: mediana <= 250 ms.
\echo '== Q21'
prepare q21 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."key_3", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", "entries"."key_3" as "key_3", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", width_bucket("started_at", $1::timestamptz[]) as "key_3", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4) and "time_entry"."project_id" in ($5, $6, $7))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2", "entries"."key_3") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $8;

\echo '-- calentamiento'
explain (analyze, buffers) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);

-- Q22: los dos catálogos de `getProjectFilterCatalog`, cada uno. Presupuesto: mediana <= 10 ms.
\echo '== Q22a'
prepare q22a as
select "id", "workspace_id", "name", "address", "note", "archived_at", "created_by", "created_at", "updated_at" from "client" where "client"."workspace_id" = $1;

\echo '-- calentamiento'
explain (analyze, buffers) execute q22a(:workspace);
\echo '-- medida 1'
explain (analyze, buffers) execute q22a(:workspace);
\echo '-- medida 2'
explain (analyze, buffers) execute q22a(:workspace);
\echo '-- medida 3'
explain (analyze, buffers) execute q22a(:workspace);
\echo '-- medida 4'
explain (analyze, buffers) execute q22a(:workspace);
\echo '-- medida 5'
explain (analyze, buffers) execute q22a(:workspace);

\echo '== Q22b'
prepare q22b as
select "project"."id", "project"."workspace_id", "project"."client_id", "project"."name", "project"."color", "project"."is_public", "project"."billable_by_default", "project"."note", "project"."archived_at", "project"."created_by", "project"."created_at", "project"."updated_at", "project_member"."is_manager" from "project" left join "project_member" on ("project_member"."workspace_id" = "project"."workspace_id" and "project_member"."project_id" = "project"."id" and "project_member"."user_id" = $1) where "project"."workspace_id" = $2;

\echo '-- calentamiento'
explain (analyze, buffers) execute q22b(:owner, :workspace);
\echo '-- medida 1'
explain (analyze, buffers) execute q22b(:owner, :workspace);
\echo '-- medida 2'
explain (analyze, buffers) execute q22b(:owner, :workspace);
\echo '-- medida 3'
explain (analyze, buffers) execute q22b(:owner, :workspace);
\echo '-- medida 4'
explain (analyze, buffers) execute q22b(:owner, :workspace);
\echo '-- medida 5'
explain (analyze, buffers) execute q22b(:owner, :workspace);

-- El pedido Persona → Proyecto → Fecha entero con tres proyectos, en una transacción
-- como la del service: los dos catálogos, Q17, Q21a y Q21. Presupuesto: <= 500 ms.
\echo '== P3'
\echo '-- calentamiento'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
explain (analyze) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
explain (analyze) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
commit;
\echo '-- medida 1'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
explain (analyze) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
explain (analyze) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
commit;
\echo '-- medida 2'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
explain (analyze) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
explain (analyze) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
commit;
\echo '-- medida 3'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
explain (analyze) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
explain (analyze) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
commit;
\echo '-- medida 4'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
explain (analyze) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
explain (analyze) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
commit;
\echo '-- medida 5'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q17(:workspace, :year_from, :year_to, :p1, :p2, :p3);
explain (analyze) execute q21a(:workspace, :year_from, :year_to, :p1, :p2, :p3, :q21a_limit);
explain (analyze) execute q21(:'day_cuts', :workspace, :year_from, :year_to, :p1, :p2, :p3, :q21_limit);
commit;


-- Contrato de R4, §6.3 (parte B): el filtro de personas angosta el alcance a
-- `chosen`, `workspace_id = $1 and user_id in ($2, …)` con `inArray`, un
-- parámetro por valor; el estado de la membresía también va con `inArray`,
-- parámetros escalares del enum (D-R4-11). Tres personas: dos activas y una
-- inactiva.
\set u1 '''volume-user-02'''
\set u2 '''volume-user-03'''
\set u3 '''volume-user-29'''
\set active '''active'''
\set inactive '''inactive'''

-- Q23: totalsByLevels [person], chosen con tres personas, 366 días. Presupuesto: mediana <= 60 ms.
\echo '== Q23'
prepare q23 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $1 and "time_entry"."user_id" in ($2, $3, $4)) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $5 and "time_entry"."started_at" < $6))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1";

\echo '-- calentamiento'
explain (analyze, buffers) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);

-- El pedido Persona → Proyecto de las tres personas: Q23 es su primer nivel y
-- Q23a el segundo, con el `limit` de su presupuesto, como lo calcula el
-- service. Las filas de cada nivel se cuentan con la misma sentencia, sin el
-- `limit`, antes de medir.
prepare q23_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $1 and "time_entry"."user_id" in ($2, $3, $4)) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $5 and "time_entry"."started_at" < $6))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1") as counted;
execute q23_rows(:workspace, :u1, :u2, :u3, :year_from, :year_to) \gset q23_
prepare q23a_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $1 and "time_entry"."user_id" in ($2, $3, $4)) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $5 and "time_entry"."started_at" < $6))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $7) as counted;
execute q23a_rows(:workspace, :u1, :u2, :u3, :year_from, :year_to, 1000000) \gset q23a_
select 3000 - :q23_count + 1 as q23a_limit \gset
\echo 'filas por nivel: q23' :q23_count 'q23a' :q23a_count
\echo 'limit: q23a' :q23a_limit

-- Q23a: totalsByLevels [person, project], chosen con tres personas, 366 días, con el `limit` de su presupuesto: el nivel 2 del pedido.
\echo '== Q23a'
prepare q23a as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "group_project"."id", "group_project"."name", "group_project"."color", "group_project_client"."id", "group_project_client"."name", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "project_id" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $1 and "time_entry"."user_id" in ($2, $3, $4)) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $5 and "time_entry"."started_at" < $6))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" left join "project" "group_project" on ("group_project"."workspace_id" = "totals"."workspace_id" and "group_project"."id" = "totals"."key_2") left join "client" "group_project_client" on ("group_project_client"."workspace_id" = "group_project"."workspace_id" and "group_project_client"."id" = "group_project"."client_id") limit $7;

\echo '-- calentamiento'
explain (analyze, buffers) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);

-- Q24: listPeople, el catálogo de personas. Presupuesto: mediana <= 10 ms.
\echo '== Q24'
prepare q24 as
select "membership"."user_id", "user"."name", "user_preference"."display_name", "membership"."status" from "membership" inner join "user" on "user"."id" = "membership"."user_id" left join "user_preference" on "user_preference"."user_id" = "membership"."user_id" where ("membership"."workspace_id" = $1 and "membership"."status" in ($2, $3));

\echo '-- calentamiento'
explain (analyze, buffers) execute q24(:workspace, :active, :inactive);
\echo '-- medida 1'
explain (analyze, buffers) execute q24(:workspace, :active, :inactive);
\echo '-- medida 2'
explain (analyze, buffers) execute q24(:workspace, :active, :inactive);
\echo '-- medida 3'
explain (analyze, buffers) execute q24(:workspace, :active, :inactive);
\echo '-- medida 4'
explain (analyze, buffers) execute q24(:workspace, :active, :inactive);
\echo '-- medida 5'
explain (analyze, buffers) execute q24(:workspace, :active, :inactive);

-- El pedido Persona → Proyecto entero de las tres personas, en una transacción
-- como la del service: los tres catálogos, Q23 y Q23a. Presupuesto: <= 250 ms.
\echo '== P4'
\echo '-- calentamiento'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
explain (analyze) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
commit;
\echo '-- medida 1'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
explain (analyze) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
commit;
\echo '-- medida 2'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
explain (analyze) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
commit;
\echo '-- medida 3'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
explain (analyze) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
commit;
\echo '-- medida 4'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
explain (analyze) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
commit;
\echo '-- medida 5'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q23(:workspace, :u1, :u2, :u3, :year_from, :year_to);
explain (analyze) execute q23a(:workspace, :u1, :u2, :u3, :year_from, :year_to, :q23a_limit);
commit;

-- Contrato de R10, §6.2 (parte A): la semana y el mes como dimensiones, con
-- los cortes de `weekBuckets` y `monthBuckets` en Buenos Aires para los 366
-- días desde el 1 de enero del año pasado. El primer corte es el inicio del
-- período aunque su semana o su mes empiecen antes; los siguientes, cada lunes
-- o cada día 1. Cada arreglo es un parámetro propio, como lo manda el driver.
select array_agg(to_char((day at time zone 'America/Argentina/Buenos_Aires') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') order by day)::text as week_cuts
  from generate_series(
         date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year',
         date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year' + interval '365 days',
         interval '1 day'
       ) as day
 where day = date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year' or extract(isodow from day) = 1 \gset
select array_agg(to_char((day at time zone 'America/Argentina/Buenos_Aires') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') order by day)::text as month_cuts
  from generate_series(
         date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year',
         date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year' + interval '365 days',
         interval '1 day'
       ) as day
 where day = date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year' or extract(day from day) = 1 \gset
select cardinality(:'week_cuts'::timestamptz[]) as week_cuts, cardinality(:'month_cuts'::timestamptz[]) as month_cuts;

-- Q25: totalsByLevels [week], everyone, 366 días, con lunes. Presupuesto: mediana <= 150 ms.
\echo '== Q25'
prepare q25 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals";

\echo '-- calentamiento'
explain (analyze, buffers) execute q25(:'week_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q25(:'week_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q25(:'week_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q25(:'week_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q25(:'week_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q25(:'week_cuts', :workspace, :year_from, :year_to);

-- Q26: totalsByLevels [month], everyone, 366 días: el primer nivel del pedido de Q27 y Q28. Presupuesto: mediana <= 150 ms.
\echo '== Q26'
prepare q26 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals";

\echo '-- calentamiento'
explain (analyze, buffers) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q26(:'month_cuts', :workspace, :year_from, :year_to);

-- Las filas de cada nivel, sin tope: un `limit` mayor que cualquier nivel.
prepare q26_rows as select count(*) from (select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals") as level;
execute q26_rows(:'month_cuts', :workspace, :year_from, :year_to) \gset q26_
prepare q27_rows as select count(*) from (select "totals"."key_1", "totals"."key_2", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", width_bucket("started_at", $2::timestamptz[]) as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $3 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" limit $6) as level;
execute q27_rows(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, 1000000) \gset q27_
prepare q28_rows as select count(*) from (select "totals"."key_1", "totals"."key_2", "totals"."key_3", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", "entries"."key_3" as "key_3", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", width_bucket("started_at", $2::timestamptz[]) as "key_2", width_bucket("started_at", $3::timestamptz[]) as "key_3", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $4 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $5 and "time_entry"."started_at" < $6))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2", "entries"."key_3") "totals" limit $7) as level;
execute q28_rows(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, 1000000) \gset q28_
prepare q29_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."key_2", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", width_bucket("started_at", $1::timestamptz[]) as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" limit $5) as level;
execute q29_rows(:'week_cuts', :workspace, :year_from, :year_to, 1000000) \gset q29_
select 3000 - :q26_count + 1 as q27_limit,
       3000 - :q26_count - :q27_count + 1 as q28_limit,
       3000 - :q11_count + 1 as q29_limit \gset
\echo 'filas por nivel: q26' :q26_count 'q27' :q27_count 'q28' :q28_count 'q11' :q11_count 'q29' :q29_count
\echo 'limit: q27' :q27_limit 'q28' :q28_limit 'q29' :q29_limit

-- Q27: totalsByLevels [month, week], everyone, 366 días, con el `limit` de su presupuesto. Presupuesto: mediana <= 150 ms.
\echo '== Q27'
prepare q27 as
select "totals"."key_1", "totals"."key_2", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", width_bucket("started_at", $2::timestamptz[]) as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $3 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" limit $6;

\echo '-- calentamiento'
explain (analyze, buffers) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);

-- Q28: totalsByLevels [month, week, date], everyone, 366 días, tres arreglos, con el `limit` de su presupuesto. Presupuesto: mediana <= 250 ms.
\echo '== Q28'
prepare q28 as
select "totals"."key_1", "totals"."key_2", "totals"."key_3", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", "entries"."key_3" as "key_3", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", width_bucket("started_at", $2::timestamptz[]) as "key_2", width_bucket("started_at", $3::timestamptz[]) as "key_3", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $4 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $5 and "time_entry"."started_at" < $6))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2", "entries"."key_3") "totals" limit $7;

\echo '-- calentamiento'
explain (analyze, buffers) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);

-- Q29: totalsByLevels [person, week], everyone, 366 días, con el `limit` de su presupuesto: Q11 es su primer nivel. Presupuesto: mediana <= 150 ms.
\echo '== Q29'
prepare q29 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", "totals"."key_2", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", width_bucket("started_at", $1::timestamptz[]) as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" limit $5;

\echo '-- calentamiento'
explain (analyze, buffers) execute q29(:'week_cuts', :workspace, :year_from, :year_to, :q29_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q29(:'week_cuts', :workspace, :year_from, :year_to, :q29_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q29(:'week_cuts', :workspace, :year_from, :year_to, :q29_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q29(:'week_cuts', :workspace, :year_from, :year_to, :q29_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q29(:'week_cuts', :workspace, :year_from, :year_to, :q29_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q29(:'week_cuts', :workspace, :year_from, :year_to, :q29_limit);

-- Q30: totalsByLevels [week], self, 366 días. Presupuesto: mediana <= 30 ms.
\echo '== Q30'
prepare q30 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $2 and "time_entry"."user_id" = $3) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals";

\echo '-- calentamiento'
explain (analyze, buffers) execute q30(:'week_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q30(:'week_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q30(:'week_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q30(:'week_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q30(:'week_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q30(:'week_cuts', :workspace, :member, :year_from, :year_to);

-- El pedido Mes → Semana → Fecha entero, en una transacción como la del service, con los catálogos: Q22a + Q22b + Q24 + Q26 + Q27 + Q28. Presupuesto: <= 500 ms.
\echo '== pedido Mes → Semana → Fecha'
\echo '-- calentamiento'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
explain (analyze) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
explain (analyze) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
commit;
\echo '-- medida 1'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
explain (analyze) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
explain (analyze) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
commit;
\echo '-- medida 2'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
explain (analyze) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
explain (analyze) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
commit;
\echo '-- medida 3'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
explain (analyze) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
explain (analyze) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
commit;
\echo '-- medida 4'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
explain (analyze) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
explain (analyze) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
commit;
\echo '-- medida 5'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q26(:'month_cuts', :workspace, :year_from, :year_to);
explain (analyze) execute q27(:'month_cuts', :'week_cuts', :workspace, :year_from, :year_to, :q27_limit);
explain (analyze) execute q28(:'month_cuts', :'week_cuts', :'day_cuts', :workspace, :year_from, :year_to, :q28_limit);
commit;

-- Contrato de R10, §6.3 (parte B): la descripción como dimensión. Lo que se
-- muestra se calcula sobre la fila ya agrupada: el `id` con `sha256` y
-- `convert_to`, el texto con `left` y la marca con `char_length`; los dos
-- largos son `REPORT_DESCRIPTION_SHOWN` (100), un entero escalar cada uno. El
-- último mes entero es el anterior al de hoy en Buenos Aires.
\set month_from '((date_trunc(''month'', (now() at time zone ''America/Argentina/Buenos_Aires'')) - interval ''1 month'') at time zone ''America/Argentina/Buenos_Aires'')'
\set month_to '(date_trunc(''month'', (now() at time zone ''America/Argentina/Buenos_Aires'')) at time zone ''America/Argentina/Buenos_Aires'')'

prepare q31 as
select case when "totals"."key_1" = '' then null else left(encode(sha256(convert_to("totals"."key_1", 'UTF8')), 'hex'), 32) end, left("totals"."key_1", $1), char_length("totals"."key_1") > $2, "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "description" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $3 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" limit $6;

-- Las filas de cada nivel, sin tope: un `limit` mayor que cualquier nivel.
prepare q31_rows as select count(*) from (select case when "totals"."key_1" = '' then null else left(encode(sha256(convert_to("totals"."key_1", 'UTF8')), 'hex'), 32) end, left("totals"."key_1", $1), char_length("totals"."key_1") > $2, "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "description" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $3 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" limit $6) as level_rows;
execute q31_rows(100, 100, :workspace, :year_from, :year_to, 1000000) \gset q31_
execute q31_rows(100, 100, :workspace, :month_from, :month_to, 1000000) \gset q32_
execute q11_rows(:workspace, :month_from, :month_to) \gset q32p_
prepare q33_rows as select count(*) from (select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", case when "totals"."key_2" = '' then null else left(encode(sha256(convert_to("totals"."key_2", 'UTF8')), 'hex'), 32) end, left("totals"."key_2", $1), char_length("totals"."key_2") > $2, "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "description" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $3 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" limit $6) as level_rows;
execute q33_rows(100, 100, :workspace, :month_from, :month_to, 1000000) \gset q33_
prepare q34_rows as select count(*) from (select case when "totals"."key_1" = '' then null else left(encode(sha256(convert_to("totals"."key_1", 'UTF8')), 'hex'), 32) end, left("totals"."key_1", $1), char_length("totals"."key_1") > $2, "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "description" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $3 and "time_entry"."user_id" = $4) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $5 and "time_entry"."started_at" < $6))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" limit $7) as level_rows;
execute q34_rows(100, 100, :workspace, :member, :year_from, :year_to, 1000000) \gset q34_
select 3000 - :q32p_count + 1 as q33_limit \gset
\echo 'filas por nivel: q31' :q31_count 'q32' :q32_count 'q32p' :q32p_count 'q33' :q33_count 'q34' :q34_count
\echo 'limit: q33' :q33_limit

-- Q31: totalsByLevels [description], everyone, 366 días, con `limit 3001` (no entra). Presupuesto: mediana <= 200 ms.
\echo '== Q31'
\echo '-- calentamiento'
explain (analyze, buffers) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
\echo '-- medida 1'
explain (analyze, buffers) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
\echo '-- medida 2'
explain (analyze, buffers) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
\echo '-- medida 3'
explain (analyze, buffers) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
\echo '-- medida 4'
explain (analyze, buffers) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
\echo '-- medida 5'
explain (analyze, buffers) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);

-- Q32: totalsByLevels [description], everyone, el último mes entero, con `limit 3001`: el mismo texto que Q31. Presupuesto: mediana <= 60 ms.
\echo '== Q32'
\echo '-- calentamiento'
explain (analyze, buffers) execute q31(100, 100, :workspace, :month_from, :month_to, 3001);
\echo '-- medida 1'
explain (analyze, buffers) execute q31(100, 100, :workspace, :month_from, :month_to, 3001);
\echo '-- medida 2'
explain (analyze, buffers) execute q31(100, 100, :workspace, :month_from, :month_to, 3001);
\echo '-- medida 3'
explain (analyze, buffers) execute q31(100, 100, :workspace, :month_from, :month_to, 3001);
\echo '-- medida 4'
explain (analyze, buffers) execute q31(100, 100, :workspace, :month_from, :month_to, 3001);
\echo '-- medida 5'
explain (analyze, buffers) execute q31(100, 100, :workspace, :month_from, :month_to, 3001);

-- Q33: totalsByLevels [person, description], everyone, el último mes entero, con el `limit` de su presupuesto: Q11 con el mes es su primer nivel. Presupuesto: mediana <= 100 ms.
\echo '== Q33'
prepare q33 as
select "totals"."key_1", "user"."name", "user_preference"."display_name", "membership"."status", case when "totals"."key_2" = '' then null else left(encode(sha256(convert_to("totals"."key_2", 'UTF8')), 'hex'), 32) end, left("totals"."key_2", $1), char_length("totals"."key_2") > $2, "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", "entries"."key_2" as "key_2", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "user_id" as "key_1", "description" as "key_2", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $3 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1", "entries"."key_2") "totals" inner join "membership" on ("membership"."workspace_id" = "totals"."workspace_id" and "membership"."user_id" = "totals"."key_1") inner join "user" on "user"."id" = "totals"."key_1" left join "user_preference" on "user_preference"."user_id" = "totals"."key_1" limit $6;

\echo '-- calentamiento'
explain (analyze, buffers) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
\echo '-- medida 1'
explain (analyze, buffers) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
\echo '-- medida 2'
explain (analyze, buffers) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
\echo '-- medida 3'
explain (analyze, buffers) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
\echo '-- medida 4'
explain (analyze, buffers) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
\echo '-- medida 5'
explain (analyze, buffers) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);

-- Q34: totalsByLevels [description], self, 366 días, con `limit 3001`. Presupuesto: mediana <= 40 ms.
\echo '== Q34'
prepare q34 as
select case when "totals"."key_1" = '' then null else left(encode(sha256(convert_to("totals"."key_1", 'UTF8')), 'hex'), 32) end, left("totals"."key_1", $1), char_length("totals"."key_1") > $2, "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", "description" as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $3 and "time_entry"."user_id" = $4) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $5 and "time_entry"."started_at" < $6))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals" limit $7;

\echo '-- calentamiento'
explain (analyze, buffers) execute q34(100, 100, :workspace, :member, :year_from, :year_to, 3001);
\echo '-- medida 1'
explain (analyze, buffers) execute q34(100, 100, :workspace, :member, :year_from, :year_to, 3001);
\echo '-- medida 2'
explain (analyze, buffers) execute q34(100, 100, :workspace, :member, :year_from, :year_to, 3001);
\echo '-- medida 3'
explain (analyze, buffers) execute q34(100, 100, :workspace, :member, :year_from, :year_to, 3001);
\echo '-- medida 4'
explain (analyze, buffers) execute q34(100, 100, :workspace, :member, :year_from, :year_to, 3001);
\echo '-- medida 5'
explain (analyze, buffers) execute q34(100, 100, :workspace, :member, :year_from, :year_to, 3001);

-- pedido Descripción: todo el equipo, 366 días (no entra), en una transacción como la del service, con los catálogos: Q22a + Q22b + Q24 + Q31 + Q10. Presupuesto: <= 500 ms.
\echo '== pedido Descripción'
\echo '-- calentamiento'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;
\echo '-- medida 1'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;
\echo '-- medida 2'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;
\echo '-- medida 3'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;
\echo '-- medida 4'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;
\echo '-- medida 5'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q31(100, 100, :workspace, :year_from, :year_to, 3001);
explain (analyze) execute q10(:workspace, :year_from, :year_to);
commit;

-- pedido Persona → Descripción: todo el equipo, el último mes entero, con los catálogos: Q22a + Q22b + Q24 + Q11 con el mes + Q33. Presupuesto: <= 250 ms.
\echo '== pedido Persona → Descripción'
\echo '-- calentamiento'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q11(:workspace, :month_from, :month_to, 3001);
explain (analyze) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
commit;
\echo '-- medida 1'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q11(:workspace, :month_from, :month_to, 3001);
explain (analyze) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
commit;
\echo '-- medida 2'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q11(:workspace, :month_from, :month_to, 3001);
explain (analyze) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
commit;
\echo '-- medida 3'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q11(:workspace, :month_from, :month_to, 3001);
explain (analyze) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
commit;
\echo '-- medida 4'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q11(:workspace, :month_from, :month_to, 3001);
explain (analyze) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
commit;
\echo '-- medida 5'
begin transaction isolation level repeatable read read only;
explain (analyze) execute q22a(:workspace);
explain (analyze) execute q22b(:owner, :workspace);
explain (analyze) execute q24(:workspace, :active, :inactive);
explain (analyze) execute q11(:workspace, :month_from, :month_to, 3001);
explain (analyze) execute q33(100, 100, :workspace, :month_from, :month_to, :q33_limit);
commit;

-- Contrato de R5, §6.2: la lectura del gráfico, `totalsByBucket`, que arma la
-- misma sentencia que un nivel de una dimensión de tiempo, sin `limit` (D-R5-3).
-- Con `everyone` es el texto de Q25 y Q26, y con `self` el de Q30; cambian los
-- cortes. Q35 y Q38 usan los de `month_cuts`. Q36 lleva los de `weekBuckets`
-- con lunes en los 182 días desde el 1 de enero del año pasado, Q37 los de
-- `dayBuckets` en sus 31 primeros días y Q39 los de los siete días de la semana
-- actual, la de `week_from`.
\set half_to '((date_trunc(''year'', (now() at time zone ''America/Argentina/Buenos_Aires'')) - interval ''1 year'' + interval ''182 days'') at time zone ''America/Argentina/Buenos_Aires'')'
\set january_to '((date_trunc(''year'', (now() at time zone ''America/Argentina/Buenos_Aires'')) - interval ''1 year'' + interval ''31 days'') at time zone ''America/Argentina/Buenos_Aires'')'
select array_agg(to_char((day at time zone 'America/Argentina/Buenos_Aires') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') order by day)::text as half_week_cuts
  from generate_series(
         date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year',
         date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year' + interval '181 days',
         interval '1 day'
       ) as day
 where day = date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year' or extract(isodow from day) = 1 \gset
select array_agg(to_char((day at time zone 'America/Argentina/Buenos_Aires') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') order by day)::text as january_cuts
  from generate_series(
         date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year',
         date_trunc('year', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 year' + interval '30 days',
         interval '1 day'
       ) as day \gset
select array_agg(to_char((day at time zone 'America/Argentina/Buenos_Aires') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') order by day)::text as this_week_cuts
  from generate_series(
         date_trunc('week', (now() at time zone 'America/Argentina/Buenos_Aires')),
         date_trunc('week', (now() at time zone 'America/Argentina/Buenos_Aires')) + interval '6 days',
         interval '1 day'
       ) as day \gset
select cardinality(:'month_cuts'::timestamptz[]) as month_cuts,
       cardinality(:'half_week_cuts'::timestamptz[]) as half_week_cuts,
       cardinality(:'january_cuts'::timestamptz[]) as january_cuts,
       cardinality(:'this_week_cuts'::timestamptz[]) as this_week_cuts;

-- Q35: totalsByBucket [month], everyone, 366 días, sin `limit`. Presupuesto: mediana <= 150 ms.
\echo '== Q35'
prepare q35 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals";

\echo '-- calentamiento'
explain (analyze, buffers) execute q35(:'month_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q35(:'month_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q35(:'month_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q35(:'month_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q35(:'month_cuts', :workspace, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q35(:'month_cuts', :workspace, :year_from, :year_to);

-- Q36: totalsByBucket [week], everyone, 182 días, con lunes. Presupuesto: mediana <= 100 ms.
\echo '== Q36'
prepare q36 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals";

\echo '-- calentamiento'
explain (analyze, buffers) execute q36(:'half_week_cuts', :workspace, :year_from, :half_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q36(:'half_week_cuts', :workspace, :year_from, :half_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q36(:'half_week_cuts', :workspace, :year_from, :half_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q36(:'half_week_cuts', :workspace, :year_from, :half_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q36(:'half_week_cuts', :workspace, :year_from, :half_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q36(:'half_week_cuts', :workspace, :year_from, :half_to);

-- Q37: totalsByBucket [date], everyone, 31 días. Presupuesto: mediana <= 40 ms.
\echo '== Q37'
prepare q37 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals";

\echo '-- calentamiento'
explain (analyze, buffers) execute q37(:'january_cuts', :workspace, :year_from, :january_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q37(:'january_cuts', :workspace, :year_from, :january_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q37(:'january_cuts', :workspace, :year_from, :january_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q37(:'january_cuts', :workspace, :year_from, :january_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q37(:'january_cuts', :workspace, :year_from, :january_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q37(:'january_cuts', :workspace, :year_from, :january_to);

-- Q38: totalsByBucket [month], self, 366 días. Presupuesto: mediana <= 30 ms.
\echo '== Q38'
prepare q38 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where (("time_entry"."workspace_id" = $2 and "time_entry"."user_id" = $3) and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $4 and "time_entry"."started_at" < $5))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals";

\echo '-- calentamiento'
explain (analyze, buffers) execute q38(:'month_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q38(:'month_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q38(:'month_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q38(:'month_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q38(:'month_cuts', :workspace, :member, :year_from, :year_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q38(:'month_cuts', :workspace, :member, :year_from, :year_to);

-- Q39: totalsByBucket [date], everyone, la semana actual: la página sin parámetros. Presupuesto: mediana <= 15 ms.
\echo '== Q39'
prepare q39 as
select "totals"."key_1", "totals"."seconds", "totals"."billable_seconds" from (select "entries"."workspace_id" as "workspace_id", "entries"."key_1" as "key_1", sum("entries"."seconds")::bigint as "seconds", coalesce(sum("entries"."seconds") filter (where "entries"."billable"), 0)::bigint as "billable_seconds" from (select "workspace_id" as "workspace_id", width_bucket("started_at", $1::timestamptz[]) as "key_1", floor(extract(epoch from date_trunc('milliseconds', "ended_at") - date_trunc('milliseconds', "started_at"))) as "seconds", "billable" as "billable" from "time_entry" where ("time_entry"."workspace_id" = $2 and ("time_entry"."ended_at" is not null and "time_entry"."started_at" >= $3 and "time_entry"."started_at" < $4))) "entries" group by "entries"."workspace_id", "entries"."key_1") "totals";

\echo '-- calentamiento'
explain (analyze, buffers) execute q39(:'this_week_cuts', :workspace, :week_from, :week_to);
\echo '-- medida 1'
explain (analyze, buffers) execute q39(:'this_week_cuts', :workspace, :week_from, :week_to);
\echo '-- medida 2'
explain (analyze, buffers) execute q39(:'this_week_cuts', :workspace, :week_from, :week_to);
\echo '-- medida 3'
explain (analyze, buffers) execute q39(:'this_week_cuts', :workspace, :week_from, :week_to);
\echo '-- medida 4'
explain (analyze, buffers) execute q39(:'this_week_cuts', :workspace, :week_from, :week_to);
\echo '-- medida 5'
explain (analyze, buffers) execute q39(:'this_week_cuts', :workspace, :week_from, :week_to);
deallocate all;
