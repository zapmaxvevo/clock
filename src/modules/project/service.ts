import type { Actor } from "@/server/permissions";

import type {
  CreateClientResult,
  CreateClientValues,
  CreateProjectResult,
  CreateProjectValues,
  CreateTaskResult,
  CreateTaskValues,
  ProjectCatalog,
} from "./schema";

// Firmas del handshake del slice 9 (§6). La implementación llega en el commit
// siguiente.
function pending(): never {
  throw new Error("Pendiente: slice 9, segundo commit de backend.");
}

export async function createClient(
  actor: Actor,
  input: CreateClientValues,
): Promise<CreateClientResult> {
  void actor;
  void input;
  return pending();
}

export async function createProject(
  actor: Actor,
  input: CreateProjectValues,
): Promise<CreateProjectResult> {
  void actor;
  void input;
  return pending();
}

export async function createTask(
  actor: Actor,
  input: CreateTaskValues,
): Promise<CreateTaskResult> {
  void actor;
  void input;
  return pending();
}

export async function getProjectCatalog(actor: Actor): Promise<ProjectCatalog> {
  void actor;
  return pending();
}
