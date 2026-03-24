# Endpoints exclusivos Efí (API Pix)

Documentação: [Endpoints exclusivos Efí](https://dev.efipay.com.br/docs/api-pix/endpoints-exclusivos-efi)

Úteis para evolução após ter credenciais + certificado da **conta** (não só da integradora de abertura):

- `POST /v2/gn/evp` — criar chave Pix aleatória
- `GET /v2/gn/saldo/` — saldo
- `PUT /v2/gn/config` — configurações da conta / chaves (webhook por chave, etc.)
- Relatórios, infrações MED, etc.

SDK Java (opcional para serviços JVM): [SDK Java](https://dev.efipay.com.br/docs/sdk/java) — requer `.p12` e credenciais por ambiente.

Este repositório usa **Deno + fetch + PEM** nas Edge Functions, alinhado aos exemplos Node/PHP da Efí.
