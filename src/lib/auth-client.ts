"use client";

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

// D-MCP-15: con la consulta firmada de una autorización en la dirección,
// `signIn.social` la manda como `oauth_query` y el plugin retoma la
// autorización al volver de Google. Sin ella, el ingreso es el de siempre.
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });
export const { signIn, signOut, useSession } = authClient;
