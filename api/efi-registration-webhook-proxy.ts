/**
 * Proxy de webhook Efí -> Supabase Edge Function.
 *
 * Uso recomendado quando não há terminação mTLS própria no app frontend.
 * A Efí chama esta rota e ela repassa para o Supabase com header secreto.
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

  // Opcional: valida origem por IP para reduzir tráfego indevido.
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

  const supabaseWebhookUrl =
    process.env.SUPABASE_REGISTRATION_WEBHOOK_URL ??
    "https://kxtuxraukhpgyhckqoun.supabase.co/functions/v1/efi-registration-webhook";
  const secret = process.env.EFI_REGISTRATION_WEBHOOK_SECRET ?? "";
  if (!secret) {
    res.status(500).json({ error: "missing_webhook_secret" });
    return;
  }

  const payload = req.body ?? {};

  try {
    const r = await fetch(supabaseWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-efi-webhook-secret": secret,
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) {
      res.status(502).json({
        error: "upstream_error",
        status: r.status,
        body: text.slice(0, 1000),
      });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "proxy_error", detail: String(err?.message ?? err) });
  }
}
