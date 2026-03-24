// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type EfiRegistrationEnv, registrationFetch } from "../_shared/efi_registration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Resposta pode ser JSON string com base64 do .p12 */
function parseCertBody(text: string): string {
  const t = text.trim();
  try {
    const parsed = JSON.parse(t);
    if (typeof parsed === "string") return parsed;
  } catch {
    /* raw string */
  }
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { id } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: row, error: loadErr } = await supabase
      .from("efi_contas")
      .select("id, environment, efi_identificador, deleted_at")
      .eq("id", id)
      .single();

    if (loadErr || !row || row.deleted_at) {
      return new Response(JSON.stringify({ error: "Conta não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!row.efi_identificador) {
      return new Response(JSON.stringify({ error: "efi_identificador ausente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const env = row.environment as EfiRegistrationEnv;
    const path = `/v1/conta-simplificada/${encodeURIComponent(row.efi_identificador)}/certificado`;
    const efiRes = await registrationFetch(env, path, {
      method: "POST",
      body: "{}",
    });

    const text = await efiRes.text();
    if (!efiRes.ok) {
      let details: unknown = text;
      try {
        details = JSON.parse(text);
      } catch {
        /* keep text */
      }
      return new Response(
        JSON.stringify({ error: "Erro ao emitir certificado na Efi", details }),
        { status: efiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const certB64 = parseCertBody(text);
    if (!certB64 || certB64.length < 32) {
      return new Response(
        JSON.stringify({ error: "Resposta de certificado vazia ou inválida", preview: text.slice(0, 200) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: upErr } = await supabase
      .from("efi_contas")
      .update({
        certificado_p12_base64: certB64,
        status: "certificado_emitido",
        raw_cert_response: { length: certB64.length, receivedAt: new Date().toISOString() },
      })
      .eq("id", id);

    if (upErr) {
      return new Response(JSON.stringify({ error: "Erro ao atualizar banco", details: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Certificado salvo (base64). Use Storage para arquivos muito grandes em produção.",
        certLength: certB64.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
