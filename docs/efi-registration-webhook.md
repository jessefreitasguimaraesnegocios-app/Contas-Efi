# Webhook — API Abertura de Contas

Documentação oficial: [Webhook | API Abertura de Contas](https://dev.efipay.com.br/docs/api-abertura-de-contas/webhook)

## O que a Efí envia

Callbacks em `POST` na URL cadastrada com **mTLS** (servidor deve validar certificado da Efí).

Exemplo de evento de conta aberta:

```json
{
  "contaSimplificada": { "identificador": "uuid-da-conta" },
  "evento": "conta_aberta"
}
```

## Cadastro do webhook na Efí

- `POST /v1/webhook` com corpo `{ "webhookUrl": "https://seu-dominio/..." }`
- Escopos: `gn.registration.webhook.write` / `read`

## Integração com Supabase Edge Function

A URL pública `.../functions/v1/efi-registration-webhook` **não termina mTLS do lado da Efí sozinha**.

Padrão recomendado:

1. Domínio seu (Nginx, Caddy, Cloudflare) com **mTLS** conforme a doc Efí (cadeia pública da Efí em [Webhooks Pix](https://dev.efipay.com.br/docs/api-pix/webhooks) / mesma ideia para Abertura de Contas).
2. Após validar o cliente TLS, o proxy faz `POST` interno para a Edge Function com header:
   - `x-efi-webhook-secret: <valor do secret EFI_REGISTRATION_WEBHOOK_SECRET>`

A função `efi-registration-webhook` valida esse header se o secret estiver configurado; caso contrário aceita qualquer POST (**apenas para testes**).

## Opção prática com Vercel (proxy + secret)

Se o frontend está na Vercel, você pode usar a rota:

- `POST /api/efi-registration-webhook-proxy`

Implementação no repositório:

- `api/efi-registration-webhook-proxy.ts`

Essa rota:

1. exige `?hmac=...` na URL (valor em `EFI_WEBHOOK_HMAC`);
2. opcionalmente restringe IP de origem (`EFI_WEBHOOK_ALLOWED_IPS`, padrão `34.193.116.226`);
3. encaminha o payload para `SUPABASE_REGISTRATION_WEBHOOK_URL` com header:
   - `x-efi-webhook-secret: EFI_REGISTRATION_WEBHOOK_SECRET`

### Variáveis na Vercel

- `EFI_WEBHOOK_HMAC` (obrigatória)
- `EFI_REGISTRATION_WEBHOOK_SECRET` (obrigatória, igual ao secret no Supabase)
- `SUPABASE_REGISTRATION_WEBHOOK_URL` (opcional, default para este projeto)
- `EFI_WEBHOOK_ALLOWED_IPS` (opcional; lista separada por vírgula)

### URL para cadastrar na Efí

Exemplo:

`https://SEU-DOMINIO.vercel.app/api/efi-registration-webhook-proxy?hmac=SEU_TOKEN`

> Para ambientes que exigem mTLS estrito ponta a ponta, mantenha a recomendação de proxy com terminação mTLS (Nginx/Caddy/Cloudflare) conforme a documentação oficial.

## Atualização no banco

A função atualiza `efi_contas.status` para `conta_aberta` ou `recusada` conforme heurística do campo `evento`.
