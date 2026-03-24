/**
 * Receptor de webhooks da API Pix (callbacks POST).
 * Mesmo padrão de segurança do proxy de cadastro: HMAC na query + allowlist de IP Efí.
 * @see https://dev.efipay.com.br/docs/api-pix/webhooks
 *
 * Cadastre na Efí com ?hmac=...&ignorar= para evitar sufixo /pix na URL (doc Pix).
 */
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const expectedHmac = process.env.EFI_WEBHOOK_HMAC ?? "";
  const receivedHmac = String(req.query?.hmac ?? "");
  if (!expectedHmac || receivedHmac !== expectedHmac) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const allowedIps = (process.env.EFI_WEBHOOK_ALLOWED_IPS ?? "34.193.116.226")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const forwardedFor = String(req.headers["x-forwarded-for"] ?? "");
  const sourceIp = forwardedFor.split(",")[0]?.trim();
  if (sourceIp && allowedIps.length > 0 && !allowedIps.includes(sourceIp)) {
    res.status(403).json({ error: "forbidden_ip" });
    return;
  }

  // Resposta 2xx conforme doc Pix; corpo pode ser vazio.
  // TODO: encaminhar para Edge Function Supabase quando implementar persistência Pix.
  res.status(200).json({ ok: true });
}
