# Split de pagamento Pix (Efí)

Documentação: [Split de pagamento Pix](https://dev.efipay.com.br/docs/api-pix/split-de-pagamento-pix/)

## Pontos principais

- Split só entre **contas Efí**.
- Até **20** contas nos repasses.
- Configuração reutilizável: `POST /v2/gn/split/config` (escopo `gn.split.write`).
- Vincular cobrança à config: `PUT /v2/gn/split/cob/:txid/vinculo/:splitConfigId`.
- **Não** há devolução de cobrança já repassada por split (ver doc).
- Favorecidos usam **CPF/CNPJ + número da conta** (`favorecido.conta`), alinhado aos dados retornados em `GET /v1/conta-simplificada/:id/credenciais` (`conta.numero`, etc.).

## Relação com esta plataforma

Este MVP grava `conta_numero`, `conta_digito`, `payee_code` e credenciais da conta simplificada. Para montar split na **API Pix**, use o **certificado .p12** emitido por `POST .../certificado` (salvo em base64) + `client_id` / `client_secret` da conta — chamando a API Pix (outra base URL que a de Abertura de Contas).

Próxima fase: Edge Function dedicada com OAuth Pix + mTLS usando o `.p12` da **conta do cliente** (não o da integradora de abertura).
