/**
 * Proxy mTLS para API Abertura de Contas Efí (Node.js / OpenSSL).
 *
 * O runtime Deno (Supabase Edge) usa rustls e costuma falhar com
 * `peer closed connection without sending TLS close_notify` contra
 * abrircontas-*.api.efipay.com.br. Este handler repassa OAuth e chamadas REST
 * com certificado cliente via `https` nativo.
 *
 * Chamadas apenas server-side (Edge Functions) com header secreto.
 *
 * Vercel: defina EFI_REGISTRATION_MTLS_PROXY_SECRET e os mesmos
 * EFI_REGISTRATION_CLIENT_ID_*, SECRET_*, CERT_PEM_*, KEY_PEM_* usados no Supabase.
 */
import https from "https";

function normalizePem(raw: string | undefined): string {
  if (!raw) return "";
  return String(raw).replace(/\\n/g, "\n").trim();
}

const BASE_HOST: Record<string, string> = {
  homologation: "abrircontas-h.api.efipay.com.br",
  production: "abrircontas.api.efipay.com.br",
};

function getCreds(env: string) {
  const suffix = env === "production" ? "PRODUCTION" : "HOMOLOG";
  return {
    clientId: process.env[`EFI_REGISTRATION_CLIENT_ID_${suffix}`],
    clientSecret: process.env[`EFI_REGISTRATION_CLIENT_SECRET_${suffix}`],
    certPem: normalizePem(process.env[`EFI_REGISTRATION_CERT_PEM_${suffix}`]),
    keyPem: normalizePem(process.env[`EFI_REGISTRATION_KEY_PEM_${suffix}`]),
  };
}

function mtlsRequest(opts: {
  hostname: string;
  path: string;
  method: string;
  cert: string;
  key: string;
  headers: Record<string, string>;
  body?: string;
}): Promise<{ statusCode: number; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({
      cert: opts.cert,
      key: opts.key,
      rejectUnauthorized: true,
    });

    const req = https.request(
      {
        hostname: opts.hostname,
        port: 443,
        path: opts.path,
        method: opts.method,
        agent,
        headers: opts.headers,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (c: Buffer) => chunks.push(c));
        incoming.on("end", () => {
          resolve({
            statusCode: incoming.statusCode ?? 0,
            rawBody: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function responseContentType(rawBody: string): string {
  const t = rawBody.trim();
  if (t.startsWith("{") || t.startsWith("[")) return "application/json";
  return "text/plain; charset=utf-8";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const expected = process.env.EFI_REGISTRATION_MTLS_PROXY_SECRET ?? "";
  const received = String(req.headers["x-efi-mtls-proxy-secret"] ?? "");
  if (!expected || received !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const body = req.body ?? {};
  const env = body.env as string;
  if (env !== "homologation" && env !== "production") {
    res.status(400).json({ error: "invalid env" });
    return;
  }

  const hostname = BASE_HOST[env];
  const { clientId, clientSecret, certPem, keyPem } = getCreds(env);

  if (!certPem || !keyPem) {
    res.status(500).json({
      error: "missing_mtls_pem_on_vercel",
      hint: "Copie EFI_REGISTRATION_CERT_PEM_* e KEY_PEM_* para as env vars do projeto Vercel.",
    });
    return;
  }

  try {
    if (body.kind === "oauth") {
      if (!clientId || !clientSecret) {
        res.status(500).json({
          error: "missing_oauth_credentials_on_vercel",
          hint: "Defina EFI_REGISTRATION_CLIENT_ID_* e SECRET_* na Vercel.",
        });
        return;
      }
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const { statusCode, rawBody } = await mtlsRequest({
        hostname,
        path: "/v1/oauth/token",
        method: "POST",
        cert: certPem,
        key: keyPem,
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ grant_type: "client_credentials" }),
      });

      res.status(statusCode);
      res.setHeader("Content-Type", responseContentType(rawBody));
      res.send(rawBody);
      return;
    }

    if (body.kind === "fetch") {
      const path = typeof body.path === "string" ? body.path : "";
      if (!path.startsWith("/")) {
        res.status(400).json({ error: "invalid path" });
        return;
      }
      const method = String(body.method || "GET").toUpperCase();
      const hdrs: Record<string, string> = {};
      if (body.headers && typeof body.headers === "object") {
        for (const [k, v] of Object.entries(body.headers as Record<string, string>)) {
          if (typeof v === "string") hdrs[k] = v;
        }
      }
      const rawIn = typeof body.body === "string" ? body.body : undefined;

      const { statusCode, rawBody } = await mtlsRequest({
        hostname,
        path,
        method,
        cert: certPem,
        key: keyPem,
        headers: hdrs,
        body: rawIn,
      });

      res.status(statusCode);
      res.setHeader("Content-Type", responseContentType(rawBody));
      res.send(rawBody);
      return;
    }

    res.status(400).json({ error: "invalid kind", expected: "oauth | fetch" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      error: "efi_mtls_proxy_failed",
      detail: msg,
    });
  }
}
