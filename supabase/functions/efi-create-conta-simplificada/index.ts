// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_ESCOPOS_INTEGRADOS,
  type EfiRegistrationEnv,
  registrationFetch,
} from "../_shared/efi_registration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function onlyDigits(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      app_id,
      environment,
      person_type = "PF",
      nomeCompleto,
      cpf,
      nomeMae,
      dataNascimento,
      razaoSocial,
      cnpj,
      celular,
      email,
      meioDeNotificacao = ["sms"],
      escoposIntegrados,
      cupom,
      endereco,
      splitPercent = 0,
      monthlyFeeCents = 0,
    } = body;

    if (!app_id || !["homologation", "production"].includes(environment)) {
      return new Response(
        JSON.stringify({ error: "app_id e environment (homologation|production) são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!celular || !email) {
      return new Response(JSON.stringify({ error: "celular e email são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const env = environment as EfiRegistrationEnv;

    let clienteFinal: Record<string, unknown>;
    if (person_type === "PJ") {
      if (!razaoSocial || !cnpj) {
        return new Response(JSON.stringify({ error: "PJ: razaoSocial e cnpj são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      clienteFinal = {
        cnpj: onlyDigits(cnpj),
        razaoSocial,
        celular: onlyDigits(celular),
        email: String(email).trim(),
        endereco: {
          cep: onlyDigits(endereco?.cep || ""),
          estado: endereco?.estado || "",
          cidade: endereco?.cidade || "",
          bairro: endereco?.bairro || "",
          logradouro: endereco?.logradouro || "",
          numero: endereco?.numero || "",
          complemento: endereco?.complemento || "",
        },
      };
    } else {
      if (!nomeCompleto || !cpf || !nomeMae || !dataNascimento) {
        return new Response(
          JSON.stringify({
            error: "PF: nomeCompleto, cpf, nomeMae e dataNascimento (DD/MM/AAAA) são obrigatórios",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      clienteFinal = {
        cpf: onlyDigits(cpf),
        nomeCompleto,
        dataNascimento: String(dataNascimento),
        nomeMae,
        celular: onlyDigits(celular),
        email: String(email).trim(),
        endereco: {
          cep: onlyDigits(endereco?.cep || ""),
          estado: endereco?.estado || "",
          cidade: endereco?.cidade || "",
          bairro: endereco?.bairro || "",
          logradouro: endereco?.logradouro || "",
          numero: endereco?.numero || "",
          complemento: endereco?.complemento || "",
        },
      };
    }

    const scopes = Array.isArray(escoposIntegrados) && escoposIntegrados.length > 0
      ? escoposIntegrados
      : [...DEFAULT_ESCOPOS_INTEGRADOS];

    const payload = {
      clienteFinal,
      meioDeNotificacao: Array.isArray(meioDeNotificacao) ? meioDeNotificacao : ["sms"],
      escoposIntegrados: scopes,
      ...(cupom ? { cupom: String(cupom) } : {}),
    };

    const efiRes = await registrationFetch(env, "/v1/conta-simplificada", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const efiData = await efiRes.json().catch(() => ({}));
    if (!efiRes.ok) {
      return new Response(
        JSON.stringify({ error: "Erro ao solicitar conta simplificada Efi", details: efiData }),
        { status: efiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const identificador =
      efiData?.contaSimplificada?.identificador ?? efiData?.identificador ?? null;
    if (!identificador) {
      return new Response(
        JSON.stringify({
          error: "Resposta Efi sem identificador",
          details: efiData,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: row, error: insErr } = await supabase
      .from("efi_contas")
      .insert({
        app_id,
        environment: env,
        efi_identificador: String(identificador),
        status: "aguardando_cliente",
        person_type: person_type === "PJ" ? "PJ" : "PF",
        nome_completo: person_type === "PF" ? nomeCompleto : null,
        cpf: person_type === "PF" ? onlyDigits(cpf) : null,
        nome_mae: person_type === "PF" ? nomeMae : null,
        data_nascimento: person_type === "PF" ? String(dataNascimento) : null,
        razao_social: person_type === "PJ" ? razaoSocial : null,
        cnpj: person_type === "PJ" ? onlyDigits(cnpj) : null,
        celular: onlyDigits(celular),
        email: String(email).trim(),
        meio_notificacao: Array.isArray(meioDeNotificacao) ? meioDeNotificacao : ["sms"],
        escopos_integrados: scopes,
        cupom: cupom ? String(cupom) : null,
        endereco_cep: onlyDigits(endereco?.cep || ""),
        endereco_estado: endereco?.estado || null,
        endereco_cidade: endereco?.cidade || null,
        endereco_bairro: endereco?.bairro || null,
        endereco_logradouro: endereco?.logradouro || null,
        endereco_numero: endereco?.numero || null,
        endereco_complemento: endereco?.complemento || null,
        split_percent: splitPercent,
        monthly_fee_cents: monthlyFeeCents,
        raw_registration_response: efiData,
      })
      .select("id, efi_identificador, status, email, created_at")
      .single();

    if (insErr) {
      return new Response(
        JSON.stringify({ error: "Erro ao salvar no banco", details: insErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, conta: row }), {
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
