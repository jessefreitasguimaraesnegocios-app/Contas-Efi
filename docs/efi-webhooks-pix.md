# Webhooks — API Pix Efí

Documentação: [Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)

## mTLS

Por padrão, o PSP exige **mTLS** no seu endpoint. A Efí envia duas requisições (prova sem certificado + envio com certificado).

Cadeias públicas Efí (exemplos da doc):

- Produção: `https://certificados.efipay.com.br/webhooks/certificate-chain-prod.crt`
- Homologação: `https://certificados.efipay.com.br/webhooks/certificate-chain-homolog.crt`

## Cadastro

- `PUT /v2/webhook/:chave` com `{ "webhookUrl": "https://..." }` (escopo `webhook.write`)
- Base URL da API Pix: homologação `https://pix-h.api.efipay.com.br`, produção `https://pix.api.efipay.com.br` (ver [Credenciais API Pix](https://dev.efipay.com.br/docs/api-pix/credenciais)).
- `:chave` é a **chave Pix** (normalmente UUID da chave EVP) vinculada à conta.
- Notificações de Pix recebido costumam ir para `.../pix` no final da URL; use `?hmac=...&ignorar=` na URL cadastrada conforme a [doc de webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks) (HMAC + `ignorar=` para o sufixo `/pix`).

### Este repositório

- Endpoint na Vercel (exemplo):  
  `https://contas-efi.vercel.app/api/pix-webhook-proxy?hmac=SEU_EFI_WEBHOOK_HMAC&ignorar=`  
  (mesmas variáveis `EFI_WEBHOOK_HMAC` e `EFI_WEBHOOK_ALLOWED_IPS` do proxy de cadastro.)
- Script para registrar via API com `x-skip-mtls-checking: true`:

```bash
python scripts/register-pix-webhook.py --env homolog \
  --chave SUA_CHAVE_PIX_UUID \
  --p12 "caminho/homologacao.p12" \
  --client-id SEU_CLIENT_ID_PIX \
  --client-secret SEU_CLIENT_SECRET_PIX \
  --webhook-url "https://contas-efi.vercel.app/api/pix-webhook-proxy?hmac=SEU_HMAC&ignorar="
```

> Webhook de **cadastro simplificado** (Abertura de Contas) é outro fluxo: `POST /v1/webhook` na API Abertura de Contas — ver [efi-registration-webhook.md](efi-registration-webhook.md).

## skip-mTLS

Opção para hospedagem compartilhada: header `x-skip-mtls-checking`. **Você** fica responsável por validar origem (IP Efí, HMAC na URL, etc.) — ver seção na doc oficial.

## Supabase Edge Functions

Receber webhook Pix com mTLS diretamente na URL `*.supabase.co` costuma ser inviável; use o mesmo padrão de **proxy TLS** descrito em [efi-registration-webhook.md](efi-registration-webhook.md).
