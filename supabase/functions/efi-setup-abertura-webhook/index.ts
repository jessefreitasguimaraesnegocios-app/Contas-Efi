// @ts-nocheck
/**
 * One-shot: POST /v1/webhook na API Abertura de Contas (Efí) usando credenciais dos secrets.
 * Protegida: header x-efi-setup-token deve ser igual ao secret EFI_SETUP_ABERTURA_WEBHOOK.
 * (O gateway Supabase continua exigindo apikey/Authorization com anon ou JWT válido.)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  registrationFetch,
  type EfiRegistrationEnv,
} from "../_shared/efi_registration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-efi-setup-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("EFI_SETUP_ABERTURA_WEBHOOK") ?? "";
  const token = req.headers.get("x-efi-setup-token") ?? "";
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const environment = (body?.environment ?? "homologation") as EfiRegistrationEnv;
    if (environment !== "homologation" && environment !== "production") {
      return new Response(JSON.stringify({ error: "environment must be homologation or production" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl =
      typeof body?.webhookUrl === "string" && body.webhookUrl.startsWith("https://")
        ? body.webhookUrl
        : "https://contas-efi.vercel.app/api/efi-registration-webhook-proxy?hmac=webhook";

    const res = await registrationFetch(environment, "/v1/webhook", {
      method: "POST",
      body: JSON.stringify({ webhookUrl }),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return new Response(JSON.stringify({ ok: res.ok, efiStatus: res.status, efiBody: data }), {
      status: res.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
