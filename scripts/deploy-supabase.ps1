# Deploy Supabase: migrations + todas as Edge Functions Efi
# Pré-requisito: npx supabase login
# Uso: .\scripts\deploy-supabase.ps1 [-Link] [-SkipDbPush]
param(
    [switch]$Link,
    [switch]$SkipDbPush
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$projectRef = "kxtuxraukhpgyhckqoun"

if ($Link) {
    Write-Host ">> supabase link --project-ref $projectRef"
    npx supabase link --project-ref $projectRef
}

if (-not $SkipDbPush) {
    Write-Host ">> supabase db push"
    npx supabase db push
}

$functions = @(
    "efi-create-conta-simplificada",
    "efi-sync-credentials",
    "efi-sync-certificado",
    "efi-list-contas",
    "efi-delete-conta",
    "efi-registration-webhook",
    "efi-setup-abertura-webhook"
)

foreach ($fn in $functions) {
    Write-Host ">> functions deploy $fn"
    npx supabase functions deploy $fn
}

Write-Host "Done. Configure secrets: docs/SUPABASE-DEPLOY.md"
