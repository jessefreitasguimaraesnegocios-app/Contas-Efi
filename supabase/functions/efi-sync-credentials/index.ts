// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type EfiRegistrationEnv, registrationFetch } from "../_shared/efi_registration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const path = `/v1/conta-simplificada/${encodeURIComponent(row.efi_identificador)}/credenciais`;
    const efiRes = await registrationFetch(env, path, { method: "GET" });
    const data = await efiRes.json().catch(() => ({}));

    if (!efiRes.ok) {
      return new Response(
        JSON.stringify({
          error: "Erro ao buscar credenciais na Efi",
          details: data,
          hint:
            "412/404 costuma indicar que o cliente ainda não concluiu o fluxo ou credenciais indisponíveis.",
        }),
        { status: efiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const conta = data.conta || {};
    const { error: upErr } = await supabase
      .from("efi_contas")
      .update({
        client_id: data.clientId ?? null,
        client_secret: data.clientSecret ?? null,
        conta_numero: conta.numero != null ? String(conta.numero) : null,
        conta_digito: conta.digito != null ? String(conta.digito) : null,
        payee_code: conta.payeeCode ?? null,
        credenciais_ativo: data.ativo ?? null,
        escopos_concedidos: Array.isArray(data.escopos) ? data.escopos : [],
        status: "credenciais_sincronizadas",
        raw_credentials_response: data,
      })
      .eq("id", id);

    if (upErr) {
      return new Response(JSON.stringify({ error: "Erro ao atualizar banco", details: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, credenciais: data }), {
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
