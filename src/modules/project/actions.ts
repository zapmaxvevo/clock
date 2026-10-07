"use server";

import { handle, type ActionResult } from "@/server/action";

import * as service from "./service";
import {
  createClientInput,
  createProjectInput,
  createTagInput,
  createTaskInput,
  projectMessages,
  type CreateClientInput,
  type CreateClientResult,
  type CreateProjectInput,
  type CreateProjectResult,
  type CreateTagInput,
  type CreateTagResult,
  type CreateTaskInput,
  type CreateTaskResult,
} from "./schema";

const options = {
  paths: ["/proyectos"],
  messages: {
    forbidden: projectMessages.forbidden,
    unexpected: projectMessages.unexpected,
  },
} as const;

// Las cuatro altas: el permiso lo consulta el service antes de `createOnce`
// (ADR 0007). El de `task.create` necesita el proyecto leído, y las cuatro lo
// piden en el mismo lugar.

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

export async function createTag(
  input: CreateTagInput,
): Promise<ActionResult<CreateTagResult>> {
  return handle(
    async (session) => service.createTag(session.actor, createTagInput.parse(input)),
    options,
  );
}
