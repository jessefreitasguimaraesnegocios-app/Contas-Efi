# Deploy no Supabase (`kxtuxraukhpgyhckqoun`)

O `npx supabase link` retorna **Forbidden** se você **não estiver logado** na CLI ou se o projeto não pertencer à sua conta/organização.

## 1. Login e link

```powershell
cd c:\Users\jesse\Desktop\asaas\plataforma-subcontas-efi
npx supabase login
npx supabase link --project-ref kxtuxraukhpgyhckqoun
```

Na primeira vez, a CLI pede a **senha do banco** (Dashboard → **Project Settings** → **Database** → *Database password*).

## 2. Aplicar schema (migrations)

```powershell
npx supabase db push
```

Alternativa: copiar o SQL de `supabase/migrations/` e executar no **SQL Editor** do painel.

## 3. Publicar Edge Functions

```powershell
npx supabase functions deploy efi-create-conta-simplificada
npx supabase functions deploy efi-sync-credentials
npx supabase functions deploy efi-sync-certificado
npx supabase functions deploy efi-list-contas
npx supabase functions deploy efi-delete-conta
npx supabase functions deploy efi-registration-webhook
```

Ou use `.\scripts\deploy-supabase.ps1` (faz link opcional + db push + deploy de todas).

## 4. Secrets (valores reais da Efi — não commitar)

Defina no painel (**Edge Functions** → **Secrets**) ou via CLI:

```powershell
# Homologação
npx supabase secrets set EFI_REGISTRATION_CLIENT_ID_HOMOLOG="..."
npx supabase secrets set EFI_REGISTRATION_CLIENT_SECRET_HOMOLOG="..."
npx supabase secrets set EFI_REGISTRATION_CERT_PEM_HOMOLOG="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
npx supabase secrets set EFI_REGISTRATION_KEY_PEM_HOMOLOG="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Produção (quando for usar)
npx supabase secrets set EFI_REGISTRATION_CLIENT_ID_PRODUCTION="..."
npx supabase secrets set EFI_REGISTRATION_CLIENT_SECRET_PRODUCTION="..."
npx supabase secrets set EFI_REGISTRATION_CERT_PEM_PRODUCTION="..."
npx supabase secrets set EFI_REGISTRATION_KEY_PEM_PRODUCTION="..."

# Opcional: validação do webhook de cadastro Efi
npx supabase secrets set EFI_REGISTRATION_WEBHOOK_SECRET="..."
```

**PEM em uma linha:** use `\n` onde haveria quebra de linha, ou rode várias vezes `secrets set` lendo de arquivo (veja script).

## 5. Frontend `.env`

Em `frontend/.env` (não versionar):

```env
VITE_SUPABASE_URL=https://kxtuxraukhpgyhckqoun.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key do Dashboard → API>
```

## 6. Webhook Efi (cadastro)

URL da function após deploy:

`https://kxtuxraukhpgyhckqoun.supabase.co/functions/v1/efi-registration-webhook`

Cadastre na Efi conforme `docs/webhook-cadastro-efi.md` (se existir) ou doc oficial de webhooks.
