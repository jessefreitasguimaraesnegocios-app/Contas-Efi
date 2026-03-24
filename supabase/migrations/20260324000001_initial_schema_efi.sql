-- Apps (barbearia, sorveteria, etc.) — mesmo conceito da plataforma Asaas
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz default now()
);

comment on table public.apps is 'Plataformas que usam contas Efí (cadastro simplificado)';
comment on column public.apps.code is 'Código único: BARBEARIA, SORVETERIA, CLUB, etc.';

-- Contas solicitadas via API Abertura de Contas Efí
create table if not exists public.efi_contas (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete restrict,
  environment text not null check (environment in ('homologation', 'production')),

  efi_identificador text,
  status text not null default 'solicitada'
    check (status in (
      'solicitada',
      'aguardando_cliente',
      'conta_aberta',
      'recusada',
      'credenciais_sincronizadas',
      'certificado_emitido',
      'arquivada'
    )),

  person_type text not null default 'PF' check (person_type in ('PF', 'PJ')),

  -- Snapshot formulário / cliente final (PF)
  nome_completo text,
  cpf text,
  nome_mae text,
  data_nascimento text,

  -- PJ (quando person_type = PJ)
  razao_social text,
  cnpj text,

  celular text not null,
  email text not null,
  meio_notificacao text[] default array['sms']::text[],
  escopos_integrados text[] default array[]::text[],
  cupom text,

  endereco_cep text,
  endereco_estado text,
  endereco_cidade text,
  endereco_bairro text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,

  -- Após GET credenciais
  client_id text,
  client_secret text,
  conta_numero text,
  conta_digito text,
  payee_code text,
  credenciais_ativo boolean,
  escopos_concedidos text[] default array[]::text[],

  -- Após POST certificado (pode ser grande; considere Storage em produção)
  certificado_p12_base64 text,

  split_percent numeric(6,3) not null default 0,
  monthly_fee_cents bigint not null default 0,

  raw_registration_response jsonb,
  raw_credentials_response jsonb,
  raw_cert_response jsonb,

  deleted_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_efi_contas_app_id on public.efi_contas(app_id);
create index if not exists idx_efi_contas_environment on public.efi_contas(environment);
create index if not exists idx_efi_contas_email on public.efi_contas(email);
create index if not exists idx_efi_contas_deleted on public.efi_contas(deleted_at) where deleted_at is null;

-- Permite novo cadastro com mesmo identificador Efi após arquivar linha anterior
create unique index if not exists efi_contas_identificador_env_active
  on public.efi_contas (efi_identificador, environment)
  where deleted_at is null and efi_identificador is not null;

alter table public.efi_contas
  add constraint efi_contas_split_percent_range
  check (split_percent >= 0 and split_percent <= 100);

alter table public.efi_contas
  add constraint efi_contas_monthly_fee_non_negative
  check (monthly_fee_cents >= 0);

alter table public.apps enable row level security;
alter table public.efi_contas enable row level security;

-- Service role nas Edge Functions bypassa RLS; políticas permitem leitura via PostgREST se necessário
create policy "Allow all for service apps" on public.apps for all using (true);
create policy "Allow all for service efi_contas" on public.efi_contas for all using (true);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger efi_contas_updated_at
  before update on public.efi_contas
  for each row execute function public.set_updated_at();

insert into public.apps (code, name) values
  ('BARBEARIA', 'Sistema de Barbearias'),
  ('SORVETERIA', 'Sistema de Sorveterias'),
  ('CLUB', 'Sistema de Clubes')
on conflict (code) do nothing;
