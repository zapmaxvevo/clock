"use server";

import { handle, type ActionResult } from "@/server/action";

import * as service from "./service";
import {
  createClientInput,
  createProjectInput,
  createTaskInput,
  projectMessages,
  type CreateClientInput,
  type CreateClientResult,
  type CreateProjectInput,
  type CreateProjectResult,
  type CreateTaskInput,
  type CreateTaskResult,
} from "./schema";

/**
 * El permiso lo consulta el service antes de `createOnce` (ADR 0007): el de
 * `task.create` necesita el proyecto leído, y las tres altas lo piden en el
 * mismo lugar.
 */
const options = {
  paths: ["/proyectos"],
  messages: {
    forbidden: projectMessages.forbidden,
    unexpected: projectMessages.unexpected,
  },
} as const;

export async function createClient(
  input: CreateClientInput,
): Promise<ActionResult<CreateClientResult>> {
  return handle(
    async (session) =>
      service.createClient(session.actor, createClientInput.parse(input)),
    options,
  );
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ActionResult<CreateProjectResult>> {
  return handle(
    async (session) =>
      service.createProject(session.actor, createProjectInput.parse(input)),
    options,
  );
}

export async function createTask(
  input: CreateTaskInput,
): Promise<ActionResult<CreateTaskResult>> {
  return handle(
    async (session) => service.createTask(session.actor, createTaskInput.parse(input)),
    options,
  );
}
