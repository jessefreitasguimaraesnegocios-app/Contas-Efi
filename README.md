# Plataforma Contas Efí

Espelho da [plataforma Asaas](../plataforma-subcontas), adaptado à **API Abertura de Contas** da Efí: cadastro simplificado assíncrono, OAuth2 + **mTLS**, sincronização de credenciais e certificado `.p12` (base64).

## Pré-requisitos

- Conta **Efí Empresas** com aplicação em **homologação** e **produção**.
- Escopos liberados pela Efí (API em beta): `gn.registration.write`, `gn.registration.read` (+ webhook se usar).
- Certificado **.p12** da aplicação integradora convertido para **cert.pem** + **key.pem** (ver [docs/efi-secrets-e-mtls.md](docs/efi-secrets-e-mtls.md)).
- Projeto **Supabase novo** (isolado do Asaas).

## Setup

### 1. Banco (Supabase)

1. Crie o projeto no [supabase.com](https://supabase.com).
2. SQL Editor: rode o arquivo `supabase/migrations/20260324000001_initial_schema_efi.sql` **ou** use a CLI:
   ```bash
   cd plataforma-subcontas-efi
   npx supabase link --project-ref SEU_REF
   npx supabase db push
   ```
3. **Authentication**: habilite e-mail/senha; crie usuários pelo painel ou fluxo “Criar conta” no app.

### 2. Secrets (Edge Functions)

No Dashboard: **Edge Functions → Secrets** (ou `supabase secrets set`):

| Secret | Descrição |
|--------|-----------|
| `EFI_REGISTRATION_CLIENT_ID_HOMOLOG` | Client Id homologação |
| `EFI_REGISTRATION_CLIENT_SECRET_HOMOLOG` | Client Secret homologação |
| `EFI_REGISTRATION_CERT_PEM_HOMOLOG` | Conteúdo de `cert.pem` (use `\n` para quebras de linha) |
| `EFI_REGISTRATION_KEY_PEM_HOMOLOG` | Conteúdo de `key.pem` |
| `EFI_REGISTRATION_CLIENT_ID_PRODUCTION` | Client Id produção |
| `EFI_REGISTRATION_CLIENT_SECRET_PRODUCTION` | Client Secret produção |
| `EFI_REGISTRATION_CERT_PEM_PRODUCTION` | cert.pem produção |
| `EFI_REGISTRATION_KEY_PEM_PRODUCTION` | key.pem produção |
| `EFI_REGISTRATION_WEBHOOK_SECRET` | (Opcional) segredo para header `x-efi-webhook-secret` no proxy |

### 3. Deploy das functions

```bash
npx supabase functions deploy efi-create-conta-simplificada
npx supabase functions deploy efi-sync-credentials
npx supabase functions deploy efi-sync-certificado
npx supabase functions deploy efi-list-contas
npx supabase functions deploy efi-delete-conta
npx supabase functions deploy efi-registration-webhook
```

Em cada função no painel: **Verify JWT = OFF** (já refletido em `supabase/config.toml` para novos deploys via CLI).

### 4. Frontend

```bash
cd frontend
cp .env.example .env
# Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Porta padrão: **5175**. Deploy (ex.: Vercel) usando `vercel.json` na raiz.

Usuário Auth via CLI (opcional):

```bash
npm run create-user -- seu@email.com suaSenha
```

## PJ (pessoa jurídica)

O payload `clienteFinal` para PJ na API Efí pode exigir campos adicionais além de `cnpj` / `razaoSocial` (consulte **Consultar atributos** na [doc de cadastro simplificado](https://dev.efipay.com.br/docs/api-abertura-de-contas/cadastro-simplificado)). Ajuste o corpo em `supabase/functions/efi-create-conta-simplificada/index.ts` se a Efi retornar erro de schema.

## Fluxo

1. **Nova conta**: Edge chama `POST /v1/conta-simplificada` → salva `efi_identificador` e status `aguardando_cliente`.
2. Cliente final conclui o fluxo na Efí (SMS/link). Opcional: [webhook](docs/efi-registration-webhook.md) atualiza status.
3. **Sincronizar credenciais**: `GET .../credenciais` → grava `client_id`, `client_secret`, dados da conta.
4. **Emitir certificado**: `POST .../certificado` → salva base64 do `.p12` (para API Pix da conta).

## Documentação extra

- [Secrets e mTLS](docs/efi-secrets-e-mtls.md)
- [Webhook cadastro](docs/efi-registration-webhook.md)
- [Split Pix](docs/efi-split-pix.md)
- [Webhooks Pix](docs/efi-webhooks-pix.md)
- [Endpoints exclusivos](docs/efi-endpoints-exclusivos.md)

## Diferenças em relação ao Asaas

| Asaas | Efí |
|-------|-----|
| Subconta síncrona | Cadastro simplificado **assíncrono** |
| `access_token` único | OAuth + **certificado cliente** em toda chamada à API Abertura de Contas |
| Uma base URL sandbox/prod | Abertura: `abrircontas-h` / `abrircontas` — Pix é **outra** API |

## Licença

Uso interno do seu projeto.
