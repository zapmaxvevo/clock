import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { ACCOUNT_LINK_TTL_DAYS } from "@/server/access";
import { db, type Transaction } from "@/server/db";
import {
  account,
  invitation,
  membership,
  user,
  userPreference,
  type InvitationStatus,
} from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";

import {
  MEMBER_STATUSES,
  memberStatusOf,
  type MemberStatus,
} from "@/modules/workspace/schema";

import type { ChangeableRole } from "./schema";

/** Lo que la lista muestra de una membresía (ADR 0010: `join`, sin reglas). */
export type TeamMemberRow = {
  readonly membershipId: string;
  readonly userId: string;
  readonly role: Role;
  readonly status: MemberStatus;
  /** D-E2-7: si tiene una fila de `account`; se muestra. */
  readonly hasAccount: boolean;
  /** `user.name`, el de Google. */
  readonly accountName: string;
  readonly email: string;
  /** `user_preference.display_name`, o `null`. */
  readonly displayName: string | null;
  /** D-E2b-2: la fecha de la marca, o `null` sin marca. */
  readonly linkRequestedAt: Date | null;
  /** D-E2b-11: el vencimiento de la marca, calculado por la base; `null` sin marca. */
  readonly linkExpiresAt: Date | null;
  /** D-E2b-11: si la marca ya venció según `now()`; `false` sin marca. */
  readonly linkExpired: boolean;
  /** D-E2b-8: el estado de la invitación del correo normalizado, o `null`. */
  readonly invitationStatus: InvitationStatus | null;
};

/** Una membresía bloqueada para cambiar el rol, el estado o la vinculación. */
export type LockedMembership = {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: Role;
  readonly status: MembershipStatus;
  /** D-E2b-6: si tiene una marca, vigente o vencida. */
  readonly linkPending: boolean;
  /** D-E2b-11: si la marca está vigente según `now()`. */
  readonly linkValid: boolean;
  /** D-E2b-6: la fecha de la marca, o `null`, para la constancia. */
  readonly linkRequestedAt: Date | null;
};

/** D-E2b-3: la membresía del ingreso, bloqueada. */
export type EntryMembership = {
  readonly id: string;
  readonly role: Role;
  readonly status: MembershipStatus;
};

/** D-E2b-11: la marca vence `ACCOUNT_LINK_TTL_DAYS` días después de pedirse. */
const linkExpiresAt = sql<Date | null>`${membership.accountLinkRequestedAt} + make_interval(days => ${ACCOUNT_LINK_TTL_DAYS})`;

/** D-E2b-11: vigente según `now()`, la hora de inicio de la transacción. */
const linkValid = sql<boolean>`coalesce(${membership.accountLinkRequestedAt} > now() - make_interval(days => ${ACCOUNT_LINK_TTL_DAYS}), false)`;

const linkPending = sql<boolean>`${membership.accountLinkRequestedAt} is not null`;

const normalizedUserEmail = sql<string>`lower(btrim(${user.email}))`;

/** Único lugar del módulo con acceso a datos. */
export const teamRepository = {
  /**
   * Las membresías `active` e `inactive` de `workspaceId`, con `"user"` interno,
   * `user_preference` con `left join` y si tienen una fila de `account`. Sin
   * orden. Las `invited` no están (RP-64). D-E2b-11: la marca, su vencimiento
   * y si ya venció, con `now()`; D-E2b-8: la invitación del correo normalizado,
   * con `left join` (ADR 0010: se muestra).
   */
  async listMembers(workspaceId: string): Promise<readonly TeamMemberRow[]> {
    const rows = await db
      .select({
        membershipId: membership.id,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        hasAccount: sql<boolean>`exists (
          select 1 from ${account} where ${account.userId} = ${membership.userId}
        )`,
        accountName: user.name,
        email: user.email,
        displayName: userPreference.displayName,
        linkRequestedAt: membership.accountLinkRequestedAt,
        linkExpiresAt: sql<Date | null>`${linkExpiresAt}`.mapWith(
          membership.accountLinkRequestedAt,
        ),
        linkExpired: sql<boolean>`${linkPending} and not ${linkValid}`,
        invitationStatus: invitation.status,
      })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .leftJoin(userPreference, eq(userPreference.userId, membership.userId))
      .leftJoin(
        invitation,
        and(
          eq(invitation.workspaceId, membership.workspaceId),
          eq(invitation.email, normalizedUserEmail),
        ),
      )
      .where(
        and(
          eq(membership.workspaceId, workspaceId),
          inArray(membership.status, [...MEMBER_STATUSES]),
        ),
      );
    return rows.map((row) => ({ ...row, status: memberStatusOf(row.status) }));
  },

  /**
   * D-R8-7, D-E2-6, D-E2b-6: el bloqueo de `changeRole`, `changeStatus`,
   * `setAccountLink` y `releaseEmail`. En una
   * sentencia, las membresías de `workspaceId` con `id = membershipId` o
   * `user_id = actorUserId`, `order by id`, `for no key update`. Devuelve las
   * que existen: ninguna, una (también si son la misma) o dos.
   *
   * Una sola sentencia ordenada: dos, o el orden de los parámetros, pueden
   * esperarse en círculo con otro cambio que pide las mismas dos (ADR 0011).
   * `for no key update` no choca con el `for key share` que toma un alta de
   * horas sobre la membresía por su clave foránea.
   */
  async lockForChange(
    tx: Transaction,
    workspaceId: string,
    membershipId: string,
    actorUserId: string,
  ): Promise<readonly LockedMembership[]> {
    return tx
      .select({
        id: membership.id,
        workspaceId: membership.workspaceId,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        linkPending,
        linkValid,
        linkRequestedAt: membership.accountLinkRequestedAt,
      })
      .from(membership)
      .where(
        and(
          eq(membership.workspaceId, workspaceId),
          or(eq(membership.id, membershipId), eq(membership.userId, actorUserId)),
        ),
      )
      .orderBy(asc(membership.id))
      .for("no key update");
  },

  /** El rol de `(workspaceId, membershipId)`. `updated_at` lo pone `$onUpdate`. */
  async updateRole(
    tx: Transaction,
    workspaceId: string,
    membershipId: string,
    role: ChangeableRole,
  ): Promise<void> {
    await tx
      .update(membership)
      .set({ role })
      .where(
        and(eq(membership.workspaceId, workspaceId), eq(membership.id, membershipId)),
      );
  },

  /** El estado de `(workspaceId, membershipId)`. `updated_at` lo pone `$onUpdate`. */
  async updateStatus(
    tx: Transaction,
    workspaceId: string,
    membershipId: string,
    status: MemberStatus,
  ): Promise<void> {
    await tx
      .update(membership)
      .set({ status })
      .where(
        and(eq(membership.workspaceId, workspaceId), eq(membership.id, membershipId)),
      );
  },
  /**
   * D-E2b-3: los `id` de las filas `user` cuyo `lower(btrim(email))` es `email`,
   * sin bloqueo. Parte de `user`, como `entryFacts` de `workspace`. `email` ya
   * normalizado. Sin orden; se pide hasta dos: más de una ya no se vincula.
   */
  async usersByEmail(tx: Transaction, email: string): Promise<readonly string[]> {
    const rows = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(normalizedUserEmail, email))
      .limit(2);
    return rows.map((row) => row.id);
  },

  /**
   * D-E2b-3: la membresía de `userId` en `workspaceId`, `for no key update`;
   * `undefined` si no tiene. La vigencia de la marca la decide `consumeAccountLink`.
   */
  async lockMembershipOf(
    tx: Transaction,
    workspaceId: string,
    userId: string,
  ): Promise<EntryMembership | undefined> {
    const rows = await tx
      .select({
        id: membership.id,
        role: membership.role,
        status: membership.status,
      })
      .from(membership)
      .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)))
      .for("no key update");
    return rows.at(0);
  },

  /**
   * D-E2b-3, D-E2b-11: limpia la marca de `membershipId` si está vigente en el
   * momento de escribir, con `ACCOUNT_LINK_TTL_DAYS` como `linkValid`. `clock_timestamp()` y no `now()`: `now()` es la hora de inicio de
   * la transacción, y una marca que vence mientras el ingreso espera el bloqueo
   * se usaría igual. Devuelve quién la pidió, o `undefined` si no limpió nada.
   */
  async consumeAccountLink(
    tx: Transaction,
    membershipId: string,
  ): Promise<{ readonly requestedById: string | null } | undefined> {
    // `returning` da la fila nueva; el `from` con la misma fila deja leer la anterior.
    const result = await tx.execute<{ requested_by_id: string | null }>(sql`
      update ${membership}
      set account_link_requested_at = null, account_link_requested_by_id = null
      from (
        select id, account_link_requested_by_id as requested_by_id
        from ${membership}
        where id = ${membershipId}
      ) previous
      where ${membership.id} = previous.id
        and ${membership.accountLinkRequestedAt} > clock_timestamp() - make_interval(days => ${ACCOUNT_LINK_TTL_DAYS})
      returning previous.requested_by_id
    `);
    const row = result.rows.at(0);
    return row === undefined ? undefined : { requestedById: row.requested_by_id };
  },

  /**
   * D-E2b-6, D-E2b-7: con un id, la marca con `now()` y quién la pide; con
   * `null`, las dos columnas en nulo. Devuelve la fecha que quedó, o `null`.
   * `updated_at` lo pone `$onUpdate`.
   */
  async updateAccountLink(
    tx: Transaction,
    workspaceId: string,
    membershipId: string,
    requestedById: string | null,
  ): Promise<Date | null> {
    const rows = await tx
      .update(membership)
      .set(
        requestedById === null
          ? { accountLinkRequestedAt: null, accountLinkRequestedById: null }
          : {
              accountLinkRequestedAt: sql`now()`,
              accountLinkRequestedById: requestedById,
            },
      )
      .where(
        and(eq(membership.workspaceId, workspaceId), eq(membership.id, membershipId)),
      )
      .returning({ requestedAt: membership.accountLinkRequestedAt });
    return rows.at(0)?.requestedAt ?? null;
  },
};
