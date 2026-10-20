/**
 * Las reglas puras de las direcciones y las consultas de una autorización OAuth
 * (D-MCP-2, D-MCP-15). Sin dependencias: las usan el servidor de autorización,
 * `/login` y `/conectar`.
 */

/** RFC 8252, §7.3: una redirección de loopback, de cualquier puerto. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Esquema `http`, `localhost` o `127.0.0.1`, cualquier puerto y camino; sin credenciales ni fragmento. */
export function isLoopbackRedirect(uri: string): boolean {
  const url = parseUrl(uri);
  if (url === null) {
    return false;
  }
  return (
    url.protocol === "http:" &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    url.username === "" &&
    url.password === "" &&
    url.hash === ""
  );
}

/** D-MCP-2: loopback de cualquier puerto, o una de `allowed`, exacta. Pura. */
export function isAllowedRedirect(uri: string, allowed: readonly string[]): boolean {
  return allowed.includes(uri) || isLoopbackRedirect(uri);
}

type SearchParams = Record<string, string | string[] | undefined>;

function hasParam(searchParams: SearchParams, name: string): boolean {
  const value = searchParams[name];
  return value !== undefined && value.length > 0;
}

/** D-MCP-15: si `/login` llegó con la consulta firmada de una autorización (`sig` y `client_id`). Pura. */
export function isOAuthLoginQuery(searchParams: SearchParams): boolean {
  return hasParam(searchParams, "sig") && hasParam(searchParams, "client_id");
}

/**
 * D-MCP-15: la consulta firmada como la recibió la página, con los parámetros
 * repetidos en su orden, para verificarla y mandarla como `oauth_query`. Pura.
 */
export function oauthQueryOf(searchParams: SearchParams): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams)) {
    for (const item of typeof value === "string" ? [value] : (value ?? [])) {
      query.append(name, item);
    }
  }
  return query.toString();
}
