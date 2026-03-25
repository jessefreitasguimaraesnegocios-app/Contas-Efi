/**
 * Cliente HTTP para API Abertura de Contas Efí (OAuth2 + mTLS).
 * @see https://dev.efipay.com.br/docs/api-abertura-de-contas/credenciais
 *
 * No Supabase Edge, rustls costuma falhar contra abrircontas-*.api.efipay.com.br.
 * Configure EFI_REGISTRATION_MTLS_PROXY_URL + EFI_REGISTRATION_MTLS_PROXY_SECRET
 * apontando para o proxy Node na Vercel (`api/efi-abertura-mtls-proxy.ts`).
 */

export type EfiRegistrationEnv = "homologation" | "production";

const BASE_URL: Record<EfiRegistrationEnv, string> = {
  homologation: "https://abrircontas-h.api.efipay.com.br",
  production: "https://abrircontas.api.efipay.com.br",
};

/** PEM com \n escapado nos secrets do Supabase */
export function normalizePem(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n").trim();
}

export function getRegistrationBaseUrl(env: EfiRegistrationEnv): string {
  return BASE_URL[env];
}

function getIntegratorCredentials(env: EfiRegistrationEnv) {
  const suffix = env === "production" ? "PRODUCTION" : "HOMOLOG";
  const clientId = Deno.env.get(`EFI_REGISTRATION_CLIENT_ID_${suffix}`);
  const clientSecret = Deno.env.get(`EFI_REGISTRATION_CLIENT_SECRET_${suffix}`);
  const certPem = normalizePem(Deno.env.get(`EFI_REGISTRATION_CERT_PEM_${suffix}`));
  const keyPem = normalizePem(Deno.env.get(`EFI_REGISTRATION_KEY_PEM_${suffix}`));
  return { clientId, clientSecret, certPem, keyPem };
}

function assertMtlsReady(certPem: string, keyPem: string) {
  if (!certPem || !keyPem) {
    throw new Error(
      "Certificado mTLS ausente: defina EFI_REGISTRATION_CERT_PEM_* e EFI_REGISTRATION_KEY_PEM_* (PEM, use \\n para quebras de linha nos secrets), ou use o proxy Vercel (EFI_REGISTRATION_MTLS_PROXY_URL + SECRET)."
    );
  }
}

function proxyConfigured(): boolean {
  const u = Deno.env.get("EFI_REGISTRATION_MTLS_PROXY_URL")?.trim();
  const s = Deno.env.get("EFI_REGISTRATION_MTLS_PROXY_SECRET")?.trim();
  return !!(u && s);
}

async function registrationProxyFetch(
  payload: Record<string, unknown>
): Promise<Response> {
  const url = Deno.env.get("EFI_REGISTRATION_MTLS_PROXY_URL")!.trim();
  const secret = Deno.env.get("EFI_REGISTRATION_MTLS_PROXY_SECRET")!.trim();
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-efi-mtls-proxy-secret": secret,
    },
    body: JSON.stringify(payload),
  });
}

const tokenCache = new Map<string, { accessToken: string; expMs: number }>();

export function createMtlsClient(certPem: string, keyPem: string): Deno.HttpClient {
  assertMtlsReady(certPem, keyPem);
  return Deno.createHttpClient({
    certChain: certPem,
    privateKey: keyPem,
    http2: false,
  });
}

export async function getRegistrationAccessToken(env: EfiRegistrationEnv): Promise<string> {
  const cacheKey = env;
  const now = Date.now();
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.expMs > now + 30_000) {
    return hit.accessToken;
  }

  if (proxyConfigured()) {
    const res = await registrationProxyFetch({ kind: "oauth", env });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        `OAuth Efi Abertura de Contas falhou (${res.status}): ${JSON.stringify(data)}`
      );
    }
    const accessToken = (data as { access_token?: string }).access_token;
    const expiresIn = Number((data as { expires_in?: number }).expires_in ?? 3600);
    if (!accessToken) {
      throw new Error(`Resposta OAuth sem access_token: ${JSON.stringify(data)}`);
    }
    tokenCache.set(cacheKey, {
      accessToken,
      expMs: now + Math.max(60, expiresIn - 120) * 1000,
    });
    return accessToken;
  }

  const { clientId, clientSecret, certPem, keyPem } = getIntegratorCredentials(env);
  if (!clientId || !clientSecret) {
    throw new Error(
      `Credenciais integradora ausentes para ${env}: EFI_REGISTRATION_CLIENT_ID_* e EFI_REGISTRATION_CLIENT_SECRET_*`
    );
  }

  const client = createMtlsClient(certPem, keyPem);
  const basic = btoa(`${clientId}:${clientSecret}`);
  const url = `${getRegistrationBaseUrl(env)}/v1/oauth/token`;

  const res = await fetch(url, {
    method: "POST",
    client,
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });

  try {
    client.close();
  } catch {
    /* ignore */
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `OAuth Efi Abertura de Contas falhou (${res.status}): ${JSON.stringify(data)}`
    );
  }

  const accessToken = (data as { access_token?: string }).access_token;
  const expiresIn = Number((data as { expires_in?: number }).expires_in ?? 3600);
  if (!accessToken) {
    throw new Error(`Resposta OAuth sem access_token: ${JSON.stringify(data)}`);
  }

  tokenCache.set(cacheKey, {
    accessToken,
    expMs: now + Math.max(60, expiresIn - 120) * 1000,
  });

  return accessToken;
}

export async function registrationFetch(
  env: EfiRegistrationEnv,
  path: string,
  init: RequestInit & { skipAuth?: boolean } = {}
): Promise<Response> {
  const pathOnly = path.startsWith("/") ? path : `/${path}`;

  if (proxyConfigured()) {
    const headers = new Headers(init.headers);
    if (!init.skipAuth) {
      const token = await getRegistrationAccessToken(env);
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const headerObj: Record<string, string> = {};
    headers.forEach((v, k) => {
      headerObj[k] = v;
    });
    const method = (init.method || "GET").toString().toUpperCase();
    const bodyStr =
      typeof init.body === "string"
        ? init.body
        : init.body == null
          ? undefined
          : String(init.body);

    return registrationProxyFetch({
      kind: "fetch",
      env,
      path: pathOnly,
      method,
      headers: headerObj,
      body: bodyStr,
    });
  }

  const { certPem, keyPem } = getIntegratorCredentials(env);
  const client = createMtlsClient(certPem, keyPem);
  const url = `${getRegistrationBaseUrl(env)}${pathOnly}`;

  const headers = new Headers(init.headers);
  if (!init.skipAuth) {
    const token = await getRegistrationAccessToken(env);
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers, client });
  try {
    client.close();
  } catch {
    /* ignore */
  }
  return res;
}

/** Escopos padrão (exemplo oficial Efi; habilite extras no app Efí se precisar de split, etc.) */
export const DEFAULT_ESCOPOS_INTEGRADOS = [
  "gn.registration.write",
  "gn.registration.read",
  "cob.write",
  "cob.read",
  "pix.write",
  "pix.read",
  "webhook.write",
  "webhook.read",
  "payloadlocation.write",
  "payloadlocation.read",
  "gn.pix.send.read",
  "gn.pix.evp.write",
  "gn.pix.evp.read",
  "gn.balance.read",
  "gn.settings.write",
  "gn.settings.read",
] as const;
