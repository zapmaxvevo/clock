# E1b: implementación y revisiones (2026-10-16)

Rama `fase2/e1b-ingreso` desde `main` en `e9ba1ec`, en el worktree
`/home/maxi/program/clock-e1b` (fuera del repositorio). Contrato:
[`fase2-e1b-ingreso.md`](fase2-e1b-ingreso.md). ADR aceptados que aplica:
[0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md) y
[0025](../adr/0025-un-modulo-escribe-en-otro-por-su-service.md).

## Criterio 18: las consultas de §6

`backend-dev` corrió cada consulta de §6 una vez, con `psql -e`, contra
`clock_e1b_back` migrada hasta la `0016`, sobre la siembra de abajo. El orden es
el del despliegue: la consulta previa (§6.1) y el registro de los externos de la
consulta 4; la sentencia de la `0016` (§6.2: la base ya tenía la migración
aplicada antes de sembrar, así que se corre la sentencia del archivo, tal cual)
y su comprobación; una entrada en la ventana con la carrera de D-E1b-11; la
consulta posterior (§6.3) con la `0016` a mano; y §6.7.

Sustituciones: `<dominios>` es `empresa.com, otra.com` (con blanco, para que la
consulta 4 lo saque); `<correo>`, el de cada fila; `<consulta_previa>` sale de
`\gset` sobre `now()`, en la sentencia siguiente a la consulta 0, por eso
difiere en microsegundos de la que se imprime.

Lo que muestra, contra el comentario de cada consulta:

- **1**: las nueve membresías; `ana` y `leo` (con el correo de `user` en
  mayúsculas y blancos) con su invitación `pending`; los dos `dup` aparecen con
  el mismo correo normalizado.
- **2**: las dos pendientes con membresía (`con_membresia = t`) son las que
  acepta la `0016`; la comprobación de §6.2 da 2.
- **3**: el `user` sin membresía.
- **4**: los dos externos sin invitación abierta (sin fila y revocada); después
  del registro, cero filas.
- **5**: los dos `user` con el mismo correo normalizado.
- **§6.3**: la membresía que entró en la ventana; la pendiente con membresía
  que dejó la carrera da 1, y la `0016` a mano la vuelve a 0.
- **§6.7**: el alta deja `pending` un correo nuevo, uno revocado y uno aceptado
  sin membresía, y no toca uno aceptado con membresía (`INSERT 0 0`).

La `0016` escribe `previous_value` y `next_value` con `json_build_object`, como
la `0013`: el texto lleva `"status" : "pending"`, con blancos que
`JSON.stringify` no pone. El valor JSON es el mismo; el test de la migración
compara los valores leídos.

### Siembra

```sql
-- Siembra del criterio 18, sobre clock_e1b_back migrada hasta la 0016.
truncate "user", workspace, invitation, audit_log cascade;

insert into "user" (id, name, email, email_verified) values
  ('u-owner', 'Owner', 'owner@empresa.com', true),
  ('u-ana', 'Ana', 'ana@empresa.com', true),
  ('u-leo', 'Leo', '  Leo@Empresa.com ', true),
  ('u-sin', 'Sin membresía', 'sin.membresia@empresa.com', true),
  ('u-ext', 'Externa', 'ext@gmail.com', true),
  ('u-extrev', 'Externa revocada', 'ext.rev@gmail.com', true),
  ('u-inv', 'Externa invitada', 'inv@gmail.com', true),
  ('u-dup1', 'Dup uno', 'dup@empresa.com', true),
  ('u-dup2', 'Dup dos', 'DUP@empresa.com ', true),
  ('u-inact', 'Inactiva', 'inactiva@empresa.com', true);

insert into account (id, account_id, provider_id, user_id, updated_at)
select 'a-' || id, 'sub-' || id, 'google', id, now()
from "user" where id not in ('u-inact');

insert into workspace (name, owner_id) values ('Workspace', 'u-owner');
insert into workspace_settings (workspace_id) select id from workspace;

insert into membership (workspace_id, user_id, role, status)
select w.id, m.user_id, m.role::workspace_role, m.status::membership_status
from workspace w, (values
  ('u-owner', 'owner', 'active'),
  ('u-ana', 'member', 'active'),
  ('u-leo', 'member', 'active'),
  ('u-ext', 'member', 'active'),
  ('u-extrev', 'member', 'active'),
  ('u-inv', 'member', 'active'),
  ('u-dup1', 'member', 'active'),
  ('u-dup2', 'member', 'active'),
  ('u-inact', 'member', 'inactive')
) as m(user_id, role, status);

insert into invitation (workspace_id, email, status, accepted_at, revoked_at)
select w.id, i.email, i.status::invitation_status,
  case when i.status = 'accepted' then now() end,
  case when i.status = 'revoked' then now() end
from workspace w, (values
  ('ana@empresa.com', 'pending'),
  ('leo@empresa.com', 'pending'),
  ('pendiente@empresa.com', 'pending'),
  ('ext.rev@gmail.com', 'revoked'),
  ('inv@gmail.com', 'accepted'),
  ('revocada@empresa.com', 'revoked'),
  ('aceptada.sin@gmail.com', 'accepted')
) as i(email, status);

insert into time_entry (workspace_id, user_id, started_at, ended_at)
select w.id, 'u-owner', s, s + interval '90 minutes'
from workspace w, (values (timestamptz '2026-10-14 12:00Z'), (timestamptz '2026-10-15 12:00Z')) as t(s);
```

### Salida

```text
===== 6.1 La consulta previa =====
select now() as consulta_previa;
        consulta_previa
-------------------------------
 2026-10-16 16:49:39.684369+00
(1 row)

select now() as consulta_previa
with ws as (select id from workspace order by created_at, id limit 1)
select lower(btrim(u.email)) as correo, m.role as rol, m.status as estado,
       m.created_at::date as alta,
       exists (select 1 from account a where a.user_id = u.id) as con_cuenta,
       i.status as invitacion,
       count(t.id) as entradas,
       round(coalesce(sum(extract(epoch from (t.ended_at - t.started_at))), 0) / 3600, 2) as horas
from membership m
join ws on ws.id = m.workspace_id
join "user" u on u.id = m.user_id
left join invitation i on i.workspace_id = m.workspace_id and i.email = lower(btrim(u.email))
left join time_entry t on t.workspace_id = m.workspace_id and t.user_id = m.user_id
group by u.id, u.email, m.role, m.status, m.created_at, i.status
order by m.status, correo;
        correo        |  rol   |  estado  |    alta    | con_cuenta | invitacion | entradas | horas
----------------------+--------+----------+------------+------------+------------+----------+-------
 ana@empresa.com      | member | active   | 2026-10-16 | t          | pending    |        0 |  0.00
 dup@empresa.com      | member | active   | 2026-10-16 | t          |            |        0 |  0.00
 dup@empresa.com      | member | active   | 2026-10-16 | t          |            |        0 |  0.00
 ext.rev@gmail.com    | member | active   | 2026-10-16 | t          | revoked    |        0 |  0.00
 ext@gmail.com        | member | active   | 2026-10-16 | t          |            |        0 |  0.00
 inv@gmail.com        | member | active   | 2026-10-16 | t          | accepted   |        0 |  0.00
 leo@empresa.com      | member | active   | 2026-10-16 | t          | pending    |        0 |  0.00
 owner@empresa.com    | owner  | active   | 2026-10-16 | t          |            |        2 |  3.00
 inactiva@empresa.com | member | inactive | 2026-10-16 | f          |            |        0 |  0.00
(9 rows)

select i.email as correo, i.status as estado, i.invited_at::date as invitada,
       exists (select 1 from membership m join "user" u on u.id = m.user_id
                where m.workspace_id = i.workspace_id
                  and lower(btrim(u.email)) = i.email) as con_membresia
from invitation i
where i.workspace_id = (select id from workspace order by created_at, id limit 1)
  and i.status in ('pending', 'accepted')
order by i.status, correo;
         correo         |  estado  |  invitada  | con_membresia
------------------------+----------+------------+---------------
 ana@empresa.com        | pending  | 2026-10-16 | t
 leo@empresa.com        | pending  | 2026-10-16 | t
 pendiente@empresa.com  | pending  | 2026-10-16 | f
 aceptada.sin@gmail.com | accepted | 2026-10-16 | f
 inv@gmail.com          | accepted | 2026-10-16 | t
(5 rows)

select lower(btrim(u.email)) as correo, u.created_at::date as creada,
       exists (select 1 from account a where a.user_id = u.id) as con_cuenta
from "user" u
where not exists (
  select 1 from membership m
  where m.user_id = u.id
    and m.workspace_id = (select id from workspace order by created_at, id limit 1))
order by correo;
          correo           |   creada   | con_cuenta
---------------------------+------------+------------
 sin.membresia@empresa.com | 2026-10-16 | t
(1 row)

select lower(btrim(u.email)) as correo, m.status as estado
from membership m
join "user" u on u.id = m.user_id
left join invitation i on i.workspace_id = m.workspace_id and i.email = lower(btrim(u.email))
where m.workspace_id = (select id from workspace order by created_at, id limit 1)
  and split_part(lower(btrim(u.email)), '@', 2)
      <> all (string_to_array(lower(replace('empresa.com, otra.com', ' ', '')), ','))
  and (i.status is null or i.status = 'revoked');
      correo       | estado
-------------------+--------
 ext@gmail.com     | active
 ext.rev@gmail.com | active
(2 rows)

select lower(btrim(email)) as correo, count(*) as filas
from "user"
group by lower(btrim(email))
having count(*) > 1;
     correo      | filas
-----------------+-------
 dup@empresa.com |     2
(1 row)

===== 6.1 La consulta 4 con filas: el registro de cada externo =====
with ws as (select id from workspace order by created_at, id limit 1),
inserted as (
  insert into invitation (workspace_id, email, status, accepted_at)
  select ws.id, lower(btrim('ext@gmail.com')), 'accepted', now() from ws
  on conflict (workspace_id, email) do update
    set status = 'accepted', accepted_at = now(), revoked_at = null, revoked_by_id = null
    where invitation.status = 'revoked'
  returning id, workspace_id, email
)
insert into audit_log (workspace_id, actor_id, action, entity, entity_id, next_value)
select workspace_id, null, 'invitation.registerExternal', 'invitation', id::text,
       json_build_object('email', email, 'status', 'accepted')::text
from inserted;
INSERT 0 1
with ws as (select id from workspace order by created_at, id limit 1),
inserted as (
  insert into invitation (workspace_id, email, status, accepted_at)
  select ws.id, lower(btrim('ext.rev@gmail.com')), 'accepted', now() from ws
  on conflict (workspace_id, email) do update
    set status = 'accepted', accepted_at = now(), revoked_at = null, revoked_by_id = null
    where invitation.status = 'revoked'
  returning id, workspace_id, email
)
insert into audit_log (workspace_id, actor_id, action, entity, entity_id, next_value)
select workspace_id, null, 'invitation.registerExternal', 'invitation', id::text,
       json_build_object('email', email, 'status', 'accepted')::text
from inserted;
INSERT 0 1
===== 6.1 La consulta 4, repetida =====
select lower(btrim(u.email)) as correo, m.status as estado
from membership m
join "user" u on u.id = m.user_id
left join invitation i on i.workspace_id = m.workspace_id and i.email = lower(btrim(u.email))
where m.workspace_id = (select id from workspace order by created_at, id limit 1)
  and split_part(lower(btrim(u.email)), '@', 2)
      <> all (string_to_array(lower(replace('empresa.com, otra.com', ' ', '')), ','))
  and (i.status is null or i.status = 'revoked');
 correo | estado
--------+--------
(0 rows)

===== 6.2 La migración: la sentencia de la 0016, tal cual =====
WITH "accepted" AS (
  UPDATE "invitation"
  SET "status" = 'accepted', "accepted_at" = now(), "updated_at" = now()
  WHERE "invitation"."status" = 'pending'
    AND EXISTS (
      SELECT 1
      FROM "membership"
      INNER JOIN "user" ON "user"."id" = "membership"."user_id"
      WHERE "membership"."workspace_id" = "invitation"."workspace_id"
        AND lower(btrim("user"."email")) = "invitation"."email"
    )
  RETURNING "invitation"."id", "invitation"."workspace_id"
)
INSERT INTO "audit_log" ("workspace_id", "actor_id", "action", "entity", "entity_id", "previous_value", "next_value")
SELECT "workspace_id", NULL, 'invitation.acceptBackfill', 'invitation', "id"::text,
  json_build_object('status', 'pending')::text,
  json_build_object('status', 'accepted')::text
FROM "accepted";
INSERT 0 2
===== 6.2 La comprobación de la migración =====
select count(*) from audit_log where action = 'invitation.acceptBackfill';
 count
-------
     2
(1 row)

===== La ventana: ventana@empresa.com entra con E1a mientras la invitan (la carrera de D-E1b-11) =====
insert into "user" (id, name, email, email_verified) values ('u-ventana', 'Ventana', 'ventana@empresa.com', true);
INSERT 0 1
insert into membership (workspace_id, user_id, role) select id, 'u-ventana', 'member' from workspace;
INSERT 0 1
insert into invitation (workspace_id, email) select id, 'ventana@empresa.com' from workspace;
INSERT 0 1
===== 6.3 Después del despliegue =====
select lower(btrim(u.email)) as correo, m.status as estado, m.created_at
from membership m
join "user" u on u.id = m.user_id
where m.workspace_id = (select id from workspace order by created_at, id limit 1)
  and m.created_at > '2026-10-16 16:49:39.684687+00'
order by m.created_at;
       correo        | estado |          created_at
---------------------+--------+-------------------------------
 ventana@empresa.com | active | 2026-10-16 16:49:39.750602+00
(1 row)

select count(*) from invitation i
where i.status = 'pending'
  and exists (select 1 from membership m join "user" u on u.id = m.user_id
               where m.workspace_id = i.workspace_id
                 and lower(btrim(u.email)) = i.email);
 count
-------
     1
(1 row)

===== 6.3 La segunda no dio cero: la sentencia de la 0016 a mano, y otra vez la cuenta =====
WITH "accepted" AS (
  UPDATE "invitation"
  SET "status" = 'accepted', "accepted_at" = now(), "updated_at" = now()
  WHERE "invitation"."status" = 'pending'
    AND EXISTS (
      SELECT 1
      FROM "membership"
      INNER JOIN "user" ON "user"."id" = "membership"."user_id"
      WHERE "membership"."workspace_id" = "invitation"."workspace_id"
        AND lower(btrim("user"."email")) = "invitation"."email"
    )
  RETURNING "invitation"."id", "invitation"."workspace_id"
)
INSERT INTO "audit_log" ("workspace_id", "actor_id", "action", "entity", "entity_id", "previous_value", "next_value")
SELECT "workspace_id", NULL, 'invitation.acceptBackfill', 'invitation', "id"::text,
  json_build_object('status', 'pending')::text,
  json_build_object('status', 'accepted')::text
FROM "accepted";
INSERT 0 1
select count(*) from invitation i
where i.status = 'pending'
  and exists (select 1 from membership m join "user" u on u.id = m.user_id
               where m.workspace_id = i.workspace_id
                 and lower(btrim(u.email)) = i.email);
 count
-------
     0
(1 row)

===== 6.7 Previews y la base local: la consulta =====
select lower(btrim(u.email)) as correo, m.role, m.status
from membership m join "user" u on u.id = m.user_id
where m.workspace_id = (select id from workspace order by created_at, id limit 1)
order by correo;
        correo        |  role  |  status
----------------------+--------+----------
 ana@empresa.com      | member | active
 dup@empresa.com      | member | active
 dup@empresa.com      | member | active
 ext.rev@gmail.com    | member | active
 ext@gmail.com        | member | active
 inactiva@empresa.com | member | inactive
 inv@gmail.com        | member | active
 leo@empresa.com      | member | active
 owner@empresa.com    | owner  | active
 ventana@empresa.com  | member | active
(10 rows)

===== 6.7 El alta, para un correo nuevo, uno revocado, uno aceptado sin membresía y uno aceptado con membresía =====
with ws as (select id from workspace order by created_at, id limit 1)
insert into invitation (workspace_id, email)
select ws.id, lower(btrim('preview@empresa.com')) from ws
on conflict (workspace_id, email) do update
  set status = 'pending', invited_at = now(),
      accepted_at = null, revoked_at = null, revoked_by_id = null
  where invitation.status = 'revoked'
     or (invitation.status = 'accepted'
         and not exists (
           select 1 from membership m join "user" u on u.id = m.user_id
           where m.workspace_id = invitation.workspace_id
             and lower(btrim(u.email)) = invitation.email));
INSERT 0 1
with ws as (select id from workspace order by created_at, id limit 1)
insert into invitation (workspace_id, email)
select ws.id, lower(btrim('revocada@empresa.com')) from ws
on conflict (workspace_id, email) do update
  set status = 'pending', invited_at = now(),
      accepted_at = null, revoked_at = null, revoked_by_id = null
  where invitation.status = 'revoked'
     or (invitation.status = 'accepted'
         and not exists (
           select 1 from membership m join "user" u on u.id = m.user_id
           where m.workspace_id = invitation.workspace_id
             and lower(btrim(u.email)) = invitation.email));
INSERT 0 1
with ws as (select id from workspace order by created_at, id limit 1)
insert into invitation (workspace_id, email)
select ws.id, lower(btrim('aceptada.sin@gmail.com')) from ws
on conflict (workspace_id, email) do update
  set status = 'pending', invited_at = now(),
      accepted_at = null, revoked_at = null, revoked_by_id = null
  where invitation.status = 'revoked'
     or (invitation.status = 'accepted'
         and not exists (
           select 1 from membership m join "user" u on u.id = m.user_id
           where m.workspace_id = invitation.workspace_id
             and lower(btrim(u.email)) = invitation.email));
INSERT 0 1
with ws as (select id from workspace order by created_at, id limit 1)
insert into invitation (workspace_id, email)
select ws.id, lower(btrim('inv@gmail.com')) from ws
on conflict (workspace_id, email) do update
  set status = 'pending', invited_at = now(),
      accepted_at = null, revoked_at = null, revoked_by_id = null
  where invitation.status = 'revoked'
     or (invitation.status = 'accepted'
         and not exists (
           select 1 from membership m join "user" u on u.id = m.user_id
           where m.workspace_id = invitation.workspace_id
             and lower(btrim(u.email)) = invitation.email));
INSERT 0 0
select email, status, accepted_at is not null as con_aceptada, revoked_at is not null as con_revocada from invitation where email in ('preview@empresa.com','revocada@empresa.com','aceptada.sin@gmail.com','inv@gmail.com') order by email;
         email          |  status  | con_aceptada | con_revocada
------------------------+----------+--------------+--------------
 aceptada.sin@gmail.com | pending  | f            | f
 inv@gmail.com          | accepted | t            | f
 preview@empresa.com    | pending  | f            | f
 revocada@empresa.com   | pending  | f            | f
(4 rows)
```
