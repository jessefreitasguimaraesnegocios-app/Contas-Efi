# Webhooks — API Pix Efí

Documentação: [Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)

## mTLS

Por padrão, o PSP exige **mTLS** no seu endpoint. A Efí envia duas requisições (prova sem certificado + envio com certificado).

Cadeias públicas Efí (exemplos da doc):

- Produção: `https://certificados.efipay.com.br/webhooks/certificate-chain-prod.crt`
- Homologação: `https://certificados.efipay.com.br/webhooks/certificate-chain-homolog.crt`

## Cadastro

- `PUT /v2/webhook/:chave` com `{ "webhookUrl": "https://..." }` (escopo `webhook.write`)
- Notificações de Pix recebido costumam ir para `.../pix` no final da URL; dá para usar `?ignorar=` na URL cadastrada para evitar path extra (ver doc).

## skip-mTLS

Opção para hospedagem compartilhada: header `x-skip-mtls-checking`. **Você** fica responsável por validar origem (IP Efí, HMAC na URL, etc.) — ver seção na doc oficial.

## Supabase Edge Functions

Receber webhook Pix com mTLS diretamente na URL `*.supabase.co` costuma ser inviável; use o mesmo padrão de **proxy TLS** descrito em [efi-registration-webhook.md](efi-registration-webhook.md).
