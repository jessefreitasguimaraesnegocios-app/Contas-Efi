# Secrets e mTLS — API Abertura de Contas Efí

Referência: [Credenciais, Certificado e Autorização](https://dev.efipay.com.br/docs/api-abertura-de-contas/credenciais)

## URLs base

| Ambiente | URL |
|----------|-----|
| Homologação | `https://abrircontas-h.api.efipay.com.br` |
| Produção | `https://abrircontas.api.efipay.com.br` |

## OAuth

- `POST /v1/oauth/token`
- `Authorization: Basic base64(client_id:client_secret)`
- Body: `{"grant_type":"client_credentials"}`
- **Todas** as requisições (incluindo o token) exigem o certificado da aplicação integradora (mTLS).

## Converter .p12 em PEM (OpenSSL)

Senha vazia (como nos exemplos Efí):

```bash
openssl pkcs12 -in certificado.p12 -clcerts -nokeys -out cert.pem
openssl pkcs12 -in certificado.p12 -nocerts -nodes -out key.pem
```

Cole o conteúdo de `cert.pem` e `key.pem` nos secrets do Supabase. Em uma linha só, substitua quebras de linha por `\n` ao colar no painel, ou use `supabase secrets set` com arquivo.

## Escopos da aplicação integradora

Necessários para este projeto:

- `gn.registration.write` — solicitar abertura
- `gn.registration.read` — credenciais e certificado da conta simplificada

A API é **restrita/beta**; a liberação é feita pela Efí comercial.

## Variáveis usadas nas Edge Functions

- `EFI_REGISTRATION_CLIENT_ID_HOMOLOG` / `EFI_REGISTRATION_CLIENT_SECRET_HOMOLOG`
- `EFI_REGISTRATION_CERT_PEM_HOMOLOG` / `EFI_REGISTRATION_KEY_PEM_HOMOLOG`
- `EFI_REGISTRATION_CLIENT_ID_PRODUCTION` / `EFI_REGISTRATION_CLIENT_SECRET_PRODUCTION`
- `EFI_REGISTRATION_CERT_PEM_PRODUCTION` / `EFI_REGISTRATION_KEY_PEM_PRODUCTION`

O código normaliza PEM com `.replace(/\\n/g, '\n')` para secrets colados com `\n` literal.
