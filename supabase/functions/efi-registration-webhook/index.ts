// @ts-nocheck
/**
 * Callback da API Abertura de Contas Efi (eventos como conta_aberta).
 * A Efi envia com mTLS no seu domínio; na prática use um proxy (Nginx/Cloudflare) que valide mTLS
 * e encaminhe para esta função com header secreto.
 * @see https://dev.efipay.com.br/docs/api-abertura-de-contas/webhook
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-efi-webhook-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("EFI_REGISTRATION_WEBHOOK_SECRET");
  if (secret) {
    const h = req.headers.get("x-efi-webhook-secret");
    if (h !== secret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const identificador =
      payload?.contaSimplificada?.identificador ?? payload?.identificador ?? null;
    const evento = String(payload?.evento ?? "");

    if (!identificador) {
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no identificador" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let status: string | null = null;
    if (evento === "conta_aberta" || evento.includes("aberta")) {
      status = "conta_aberta";
    } else if (
      evento.includes("recus") ||
      evento.includes("negad") ||
      evento.includes("cancel")
    ) {
      status = "recusada";
    }

    if (!status) {
      return new Response(JSON.stringify({ ok: true, received: true, evento }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase
      .from("efi_contas")
      .update({
        status,
        raw_registration_response: payload,
      })
      .eq("efi_identificador", String(identificador))
      .is("deleted_at", null);

    if (error) {
      console.error("efi-registration-webhook update error", error);
    }

    return new Response(JSON.stringify({ ok: true, identificador, status }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
