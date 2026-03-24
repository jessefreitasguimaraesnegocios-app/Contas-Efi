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

## Atualização no banco

A função atualiza `efi_contas.status` para `conta_aberta` ou `recusada` conforme heurística do campo `evento`.
