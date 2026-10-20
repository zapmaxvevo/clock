/**
 * Textos de `/conectar` y de «Asistentes conectados» en `/perfil` (§5.4).
 * Ninguno nombra a un asistente ni a un proveedor: el nombre es el que declaró
 * el cliente y el destino sale de la redirección firmada. Los mensajes de error
 * de las actions no viven acá: salen de `mcpMessages`, en el esquema del módulo.
 */
export const consentLabels = {
  title: (clientName: string) => `Conectar ${clientName} con Clock`,
  /** El título de `forbidden` e `invalid`, que no tienen el nombre del cliente. */
  genericTitle: "Conectar un asistente con Clock",
  body: (clientName: string, email: string) =>
    `${clientName} va a poder ver, cargar, editar y borrar tus horas, y leer tus proyectos, tareas y etiquetas, con tu cuenta (${email}).`,
  /** D-MCP-15: el destino firmado es lo que se puede creer, y por eso va siempre. */
  returnsTo: (host: string) => `Vuelve a: ${host}`,
  revokeLater: "Podés desconectarlo cuando quieras desde tu perfil.",
  invalid:
    "El pedido de conexión venció o no es válido. Volvé a conectar desde el asistente.",
  cancel: "Cancelar",
  connect: "Conectar",
  connecting: "Conectando…",
  /** TT-90: el aviso nombra la operación que no se hizo. */
  connectFailed: "No se pudo conectar.",
  cancelFailed: "No se pudo cancelar.",
} as const;

export const grantsLabels = {
  heading: "Asistentes conectados",
  intro:
    "Los asistentes que conectaste pueden ver y editar tus horas con tu cuenta. Cerrar la sesión no los desconecta.",
  serverUrl: "Dirección para conectar",
  copy: "Copiar",
  copied: "Copiada",
  /** El anuncio de la región `status` al copiar. */
  copiedStatus: "Dirección copiada.",
  copyFailed: "No se pudo copiar. Seleccioná la dirección y copiala a mano.",
  /** Debajo del nombre, en gris. */
  detail: (returnsTo: string, grantedOn: string) =>
    `Vuelve a ${returnsTo} · Conectado el ${grantedOn}`,
  empty: "No conectaste ningún asistente.",
  revoke: "Desconectar",
  /** La misma acción se repite en cada fila, así que el nombre suma el asistente. */
  revokeName: (name: string) => `Desconectar: ${name}`,
  revokeTitle: (name: string) => `¿Desconectar ${name}?`,
  revokeBody:
    "Va a dejar de poder ver y editar tus horas. Para volver a usarlo, conectalo de nuevo desde el asistente.",
  revokeConfirm: "Desconectar",
  cancel: "Cancelar",
  revoked: (name: string) => `Desconectaste ${name}.`,
  revokeFailed: (name: string) => `No se pudo desconectar ${name}.`,
} as const;
