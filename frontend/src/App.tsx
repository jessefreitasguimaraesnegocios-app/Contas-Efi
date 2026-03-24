import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import {
  maskCpf,
  maskCnpj,
  maskMobile,
  maskCep,
  maskDateBr,
  fetchByCep,
  onlyDigits,
  brDateKeep,
} from './lib/masks';

type AppRow = { id: string; code: string; name: string };

type EfiConta = {
  id: string;
  app_id: string;
  environment: string;
  efi_identificador: string | null;
  status: string;
  person_type: string;
  email: string;
  celular: string | null;
  nome_completo: string | null;
  cpf: string | null;
  razao_social: string | null;
  cnpj: string | null;
  conta_numero: string | null;
  conta_digito: string | null;
  payee_code: string | null;
  client_id: string | null;
  client_secret: string | null;
  credenciais_ativo: boolean | null;
  split_percent: number | string | null;
  monthly_fee_cents: number | string | null;
  created_at: string;
  apps?: { code: string; name: string } | null;
};

/** Corpo JSON da Edge Function (ex.: { error, details }) quando status ≠ 2xx. */
async function messageFromEdgeFunction(
  error: unknown,
  invokeResponse?: Response | null
): Promise<string> {
  const fallback = error instanceof Error ? error.message : 'Erro ao chamar função';
  if (!invokeResponse) return fallback;
  try {
    const ct = (invokeResponse.headers.get('Content-Type') || '').toLowerCase();
    if (!ct.includes('application/json')) return fallback;
    const j = (await invokeResponse.json()) as { error?: string; details?: unknown };
    if (j?.error && typeof j.error === 'string') {
      if (j.details === undefined || j.details === null) return j.error;
      const extra = typeof j.details === 'string' ? j.details : JSON.stringify(j.details);
      return `${j.error} — ${extra.slice(0, 600)}`;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'create' | 'apps'>('list');
  const [apps, setApps] = useState<AppRow[]>([]);
  const [contas, setContas] = useState<EfiConta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [signUpMode, setSignUpMode] = useState(false);

  const [form, setForm] = useState({
    app_id: '',
    environment: 'homologation' as 'homologation' | 'production',
    person_type: 'PF' as 'PF' | 'PJ',
    nomeCompleto: '',
    cpf: '',
    nomeMae: '',
    dataNascimento: '',
    razaoSocial: '',
    cnpj: '',
    celular: '',
    email: '',
    meioSms: true,
    meioWhatsapp: false,
    cupom: '',
    postalCode: '',
    address: '',
    addressNumber: '',
    complement: '',
    province: '',
    city: '',
    state: '',
    splitPercent: 10,
    monthlyFee: 50,
  });

  async function loadApps() {
    const { data } = await supabase.from('apps').select('id, code, name').order('code');
    setApps((data as AppRow[]) || []);
  }

  async function loadContas() {
    const { data, error } = await supabase
      .from('efi_contas')
      .select(
        'id, app_id, environment, efi_identificador, status, person_type, email, celular, nome_completo, cpf, razao_social, cnpj, conta_numero, conta_digito, payee_code, client_id, client_secret, credenciais_ativo, split_percent, monthly_fee_cents, created_at, apps(code, name)'
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setContas(((data ?? []) as unknown) as EfiConta[]);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      await loadApps();
      await loadContas();
      setLoading(false);
    })();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    if (tab !== 'list') return;
    void loadContas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, session]);

  async function handleCepBlur() {
    const digits = onlyDigits(form.postalCode);
    if (digits.length !== 8) return;
    setLoadingCep(true);
    try {
      const data = await fetchByCep(form.postalCode);
      if (data) {
        setForm((f) => ({
          ...f,
          address: data.logradouro || f.address,
          province: data.bairro || f.province,
          city: data.localidade || f.city,
          state: data.uf || f.state,
        }));
      }
    } finally {
      setLoadingCep(false);
    }
  }

  function maskKey(key: string | null | undefined) {
    if (!key || key.length < 12) return '••••••••';
    return key.slice(0, 12) + '…' + key.slice(-6);
  }

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function formatMoneyCents(value: string | number | null | undefined) {
    const cents =
      value == null ? 0 : typeof value === 'string' ? parseInt(value, 10) || 0 : Number(value) || 0;
    return brl.format(cents / 100);
  }
  function formatSplitPercent(value: string | number | null | undefined) {
    const p = value == null ? 0 : typeof value === 'string' ? parseFloat(value) || 0 : Number(value) || 0;
    return `${p}%`;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setMessage({ type: 'ok', text: 'Copiado!' });
    setTimeout(() => setMessage(null), 1500);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.app_id) {
      setMessage({ type: 'err', text: 'Selecione um app.' });
      return;
    }
    const meioDeNotificacao: string[] = [];
    if (form.meioSms) meioDeNotificacao.push('sms');
    if (form.meioWhatsapp) meioDeNotificacao.push('whatsapp');
    if (meioDeNotificacao.length === 0) {
      setMessage({ type: 'err', text: 'Selecione ao menos um meio de notificação (SMS ou WhatsApp).' });
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const endereco = {
        cep: onlyDigits(form.postalCode),
        estado: form.state,
        cidade: form.city,
        bairro: form.province,
        logradouro: form.address,
        numero: form.addressNumber,
        complemento: form.complement || '',
      };

      const body =
        form.person_type === 'PJ'
          ? {
              app_id: form.app_id,
              environment: form.environment,
              person_type: 'PJ',
              razaoSocial: form.razaoSocial,
              cnpj: form.cnpj,
              celular: form.celular,
              email: form.email,
              meioDeNotificacao,
              cupom: form.cupom || undefined,
              endereco,
              splitPercent: form.splitPercent,
              monthlyFeeCents: Math.round(Number(form.monthlyFee) * 100),
            }
          : {
              app_id: form.app_id,
              environment: form.environment,
              person_type: 'PF',
              nomeCompleto: form.nomeCompleto,
              cpf: form.cpf,
              nomeMae: form.nomeMae,
              dataNascimento: brDateKeep(form.dataNascimento),
              celular: form.celular,
              email: form.email,
              meioDeNotificacao,
              cupom: form.cupom || undefined,
              endereco,
              splitPercent: form.splitPercent,
              monthlyFeeCents: Math.round(Number(form.monthlyFee) * 100),
            };

      const { data: fnData, error: fnError, response: fnRes } =
        await supabase.functions.invoke('efi-create-conta-simplificada', {
          body,
          headers: { 'x-client-info': 'plataforma-subcontas-efi' },
        });

      if (fnError) {
        throw new Error(await messageFromEdgeFunction(fnError, fnRes));
      }
      const data = fnData as { error?: string; details?: unknown; success?: boolean };
      if (data?.error) {
        throw new Error(
          `${data.error}${data.details ? ` — ${JSON.stringify(data.details).slice(0, 500)}` : ''}`
        );
      }

      setMessage({
        type: 'ok',
        text: 'Solicitação enviada à Efi. O cliente deve concluir o fluxo (link/SMS). Depois use “Sincronizar credenciais”.',
      });
      setForm((f) => ({
        ...f,
        nomeCompleto: '',
        cpf: '',
        nomeMae: '',
        dataNascimento: '',
        razaoSocial: '',
        cnpj: '',
        celular: '',
        email: '',
        cupom: '',
      }));
      await loadContas();
      setTab('list');
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao criar.' });
    } finally {
      setCreating(false);
    }
  }

  async function handleSyncCredentials(id: string) {
    setSyncingId(id);
    setMessage(null);
    try {
      const { data, error, response: fnRes } = await supabase.functions.invoke('efi-sync-credentials', {
        body: { id },
        headers: { 'x-client-info': 'plataforma-subcontas-efi' },
      });
      if (error) throw new Error(await messageFromEdgeFunction(error, fnRes));
      const d = data as { error?: string; details?: unknown };
      if (d?.error) throw new Error(`${d.error} ${d.details ? JSON.stringify(d.details).slice(0, 400) : ''}`);
      setMessage({ type: 'ok', text: 'Credenciais sincronizadas.' });
      await loadContas();
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao sincronizar credenciais.' });
    } finally {
      setSyncingId(null);
    }
  }

  async function handleSyncCert(id: string) {
    setSyncingId(id);
    setMessage(null);
    try {
      const { data, error, response: fnRes } = await supabase.functions.invoke('efi-sync-certificado', {
        body: { id },
        headers: { 'x-client-info': 'plataforma-subcontas-efi' },
      });
      if (error) throw new Error(await messageFromEdgeFunction(error, fnRes));
      const d = data as { error?: string };
      if (d?.error) throw new Error(d.error);
      setMessage({ type: 'ok', text: 'Certificado .p12 (base64) salvo no banco.' });
      await loadContas();
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao emitir certificado.' });
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDeleteConta(id: string) {
    const ok = confirm(
      'Arquivar esta conta no painel?\n\n- Soft delete no Supabase (credenciais sensíveis apagadas)\n- A conta na Efi não é removida automaticamente por esta ação.'
    );
    if (!ok) return;
    setMessage(null);
    try {
      const { data, error, response: fnRes } = await supabase.functions.invoke('efi-delete-conta', {
        body: { id },
        headers: { 'x-client-info': 'plataforma-subcontas-efi' },
      });
      if (error) throw new Error(await messageFromEdgeFunction(error, fnRes));
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setMessage({ type: 'ok', text: 'Conta arquivada.' });
      await loadContas();
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao excluir.' });
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setMessage({ type: 'err', text: 'E-mail e senha são obrigatórios.' });
      return;
    }
    setLoginLoading(true);
    setMessage(null);
    try {
      if (signUpMode) {
        const { error } = await supabase.auth.signUp({ email: loginEmail.trim(), password: loginPassword });
        if (error) throw error;
        setMessage({ type: 'ok', text: 'Conta criada. Confirme o e-mail se necessário, ou faça login.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: loginEmail.trim(),
          password: loginPassword,
        });
        if (error) throw error;
      }
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao entrar.' });
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  function displayName(c: EfiConta) {
    if (c.person_type === 'PJ') return c.razao_social || '-';
    return c.nome_completo || '-';
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-surface-500">Carregando…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
        <div className="card p-6 w-full max-w-md">
          <h1 className="text-xl font-bold text-surface-900 mb-2">Plataforma Contas Efí</h1>
          <p className="text-surface-600 text-sm mb-6">Entre para gerenciar cadastros simplificados (API Abertura de Contas).</p>
          {message && (
            <div
              className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
            >
              {message.text}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                className="input"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Senha</label>
              <input
                type="password"
                className="input"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={signUpMode ? 'new-password' : 'current-password'}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loginLoading}>
              {loginLoading ? 'Aguarde…' : signUpMode ? 'Criar conta' : 'Entrar'}
            </button>
            <button
              type="button"
              className="text-sm text-brand-600 hover:underline"
              onClick={() => {
                setSignUpMode(!signUpMode);
                setMessage(null);
              }}
            >
              {signUpMode ? 'Já tenho conta, entrar' : 'Criar conta'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-surface-500">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="bg-surface-900 text-white px-4 md:px-6 py-4 shadow">
        <div className="max-w-6xl mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-xl font-bold leading-tight">Plataforma Contas Efí</h1>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="flex items-center justify-between gap-3 md:justify-end">
              <span className="text-surface-300 text-sm truncate max-w-[60vw] md:max-w-none">{session.user?.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-2 rounded-lg border border-surface-600 text-sm hover:bg-surface-800"
              >
                Sair
              </button>
            </div>
            <nav className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 md:overflow-visible md:pb-0 md:mx-0 md:px-0">
              <button
                type="button"
                onClick={() => setTab('list')}
                className={`shrink-0 px-3 py-2 rounded-lg transition text-sm ${tab === 'list' ? 'bg-brand-500 text-white' : 'hover:bg-surface-800'}`}
              >
                Contas
              </button>
              <button
                type="button"
                onClick={() => setTab('create')}
                className={`shrink-0 px-3 py-2 rounded-lg transition text-sm ${tab === 'create' ? 'bg-brand-500 text-white' : 'hover:bg-surface-800'}`}
              >
                Nova conta
              </button>
              <button
                type="button"
                onClick={() => setTab('apps')}
                className={`shrink-0 px-3 py-2 rounded-lg transition text-sm ${tab === 'apps' ? 'bg-brand-500 text-white' : 'hover:bg-surface-800'}`}
              >
                Apps
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg ${message.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
          >
            {message.text}
          </div>
        )}

        {tab === 'apps' && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Apps / Plataformas</h2>
            <p className="text-surface-600 text-sm mb-4">
              Código para vincular contas Efi (BARBEARIA, SORVETERIA, CLUB). Insira novos registros em <code className="bg-surface-100 px-1 rounded">public.apps</code>.
            </p>
            <ul className="space-y-2">
              {apps.map((a) => (
                <li key={a.id} className="flex items-center gap-4 py-2 border-b border-surface-100 last:border-0">
                  <span className="font-mono font-medium text-brand-600">{a.code}</span>
                  <span>{a.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'create' && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-2">Nova conta simplificada (Efí)</h2>
            <p className="text-sm text-surface-600 mb-6">
              Fluxo assíncrono: após enviar, o cliente final conclui na Efi. Depois sincronize credenciais e certificado.
            </p>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">App *</label>
                <select
                  className="input"
                  value={form.app_id}
                  onChange={(e) => setForm({ ...form, app_id: e.target.value })}
                  required
                >
                  <option value="">Selecione</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Ambiente *</label>
                <select
                  className="input"
                  value={form.environment}
                  onChange={(e) =>
                    setForm({ ...form, environment: e.target.value as 'homologation' | 'production' })
                  }
                >
                  <option value="homologation">Homologação</option>
                  <option value="production">Produção</option>
                </select>
              </div>
              <div>
                <label className="label">Tipo *</label>
                <select
                  className="input"
                  value={form.person_type}
                  onChange={(e) => setForm({ ...form, person_type: e.target.value as 'PF' | 'PJ' })}
                >
                  <option value="PF">Pessoa física</option>
                  <option value="PJ">Pessoa jurídica</option>
                </select>
              </div>
              <div>
                <label className="label">E-mail *</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Celular *</label>
                <input
                  className="input"
                  value={form.celular}
                  onChange={(e) => setForm({ ...form, celular: maskMobile(e.target.value) })}
                  placeholder="(00) 00000-0000"
                  maxLength={16}
                  required
                />
              </div>

              {form.person_type === 'PF' ? (
                <>
                  <div>
                    <label className="label">Nome completo *</label>
                    <input
                      className="input"
                      value={form.nomeCompleto}
                      onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">CPF *</label>
                    <input
                      className="input"
                      value={form.cpf}
                      onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
                      maxLength={14}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Nome da mãe *</label>
                    <input
                      className="input"
                      value={form.nomeMae}
                      onChange={(e) => setForm({ ...form, nomeMae: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Data de nascimento *</label>
                    <input
                      className="input"
                      value={form.dataNascimento}
                      onChange={(e) => setForm({ ...form, dataNascimento: maskDateBr(e.target.value) })}
                      placeholder="DD/MM/AAAA"
                      maxLength={10}
                      required
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="label">Razão social *</label>
                    <input
                      className="input"
                      value={form.razaoSocial}
                      onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">CNPJ *</label>
                    <input
                      className="input"
                      value={form.cnpj}
                      onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })}
                      maxLength={18}
                      required
                    />
                  </div>
                </>
              )}

              <div className="md:col-span-2 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.meioSms}
                    onChange={(e) => setForm({ ...form, meioSms: e.target.checked })}
                  />
                  SMS
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.meioWhatsapp}
                    onChange={(e) => setForm({ ...form, meioWhatsapp: e.target.checked })}
                  />
                  WhatsApp
                </label>
              </div>
              <div>
                <label className="label">Cupom (opcional)</label>
                <input className="input" value={form.cupom} onChange={(e) => setForm({ ...form, cupom: e.target.value })} />
              </div>

              <div>
                <label className="label">CEP *</label>
                <input
                  className="input"
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: maskCep(e.target.value) })}
                  onBlur={handleCepBlur}
                  maxLength={9}
                  required
                />
                {loadingCep && <span className="text-xs text-surface-500 ml-2">Buscando…</span>}
              </div>
              <div>
                <label className="label">UF *</label>
                <input
                  className="input"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })}
                  maxLength={2}
                  required
                />
              </div>
              <div>
                <label className="label">Cidade *</label>
                <input
                  className="input"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Logradouro *</label>
                <input
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Número *</label>
                <input
                  className="input"
                  value={form.addressNumber}
                  onChange={(e) => setForm({ ...form, addressNumber: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Bairro *</label>
                <input
                  className="input"
                  value={form.province}
                  onChange={(e) => setForm({ ...form, province: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Complemento</label>
                <input
                  className="input"
                  value={form.complement}
                  onChange={(e) => setForm({ ...form, complement: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Split (%)</label>
                <input
                  type="number"
                  className="input"
                  value={form.splitPercent}
                  min={0}
                  max={100}
                  step={0.1}
                  onChange={(e) => setForm({ ...form, splitPercent: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Mensalidade (R$)</label>
                <input
                  type="number"
                  className="input"
                  value={form.monthlyFee}
                  min={0}
                  step={0.01}
                  onChange={(e) => setForm({ ...form, monthlyFee: Number(e.target.value) })}
                />
              </div>
              <div className="md:col-span-2 flex justify-end pt-4">
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Enviando…' : 'Solicitar abertura na Efi'}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === 'list' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-200">
              <h2 className="text-lg font-semibold">Contas Efi</h2>
              <p className="text-sm text-surface-500">Identificador Efi, status, credenciais e certificado (base64).</p>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    <th className="text-left px-4 py-3 font-medium">App</th>
                    <th className="text-left px-4 py-3 font-medium">Ambiente</th>
                    <th className="text-left px-4 py-3 font-medium">Nome / E-mail</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">ID Efi</th>
                    <th className="text-left px-4 py-3 font-medium">Conta</th>
                    <th className="text-left px-4 py-3 font-medium">Split</th>
                    <th className="text-left px-4 py-3 font-medium">Mensalidade</th>
                    <th className="text-left px-4 py-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contas.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-surface-500">
                        Nenhuma conta. Use &quot;Nova conta&quot;.
                      </td>
                    </tr>
                  ) : (
                    contas.map((c) => (
                      <tr key={c.id} className="border-b border-surface-100 hover:bg-surface-50">
                        <td className="px-4 py-3 font-mono text-brand-600">{c.apps?.code ?? '-'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${c.environment === 'production' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}
                          >
                            {c.environment === 'production' ? 'prod' : 'homolog'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{displayName(c)}</div>
                          <div className="text-surface-500 text-xs">{c.email}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">{c.status}</td>
                        <td className="px-4 py-3">
                          {c.efi_identificador ? (
                            <button
                              type="button"
                              className="font-mono text-brand-600 hover:underline text-xs"
                              onClick={() => copyToClipboard(c.efi_identificador!)}
                            >
                              {c.efi_identificador.slice(0, 8)}…
                            </button>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">
                          {c.conta_numero ? `${c.conta_numero}-${c.conta_digito ?? ''}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs">{formatSplitPercent(c.split_percent)}</td>
                        <td className="px-4 py-3 text-xs">{formatMoneyCents(c.monthly_fee_cents)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              className="text-xs text-brand-700 hover:underline text-left"
                              disabled={syncingId === c.id}
                              onClick={() => handleSyncCredentials(c.id)}
                            >
                              {syncingId === c.id ? '…' : 'Sincronizar credenciais'}
                            </button>
                            <button
                              type="button"
                              className="text-xs text-brand-700 hover:underline text-left"
                              disabled={syncingId === c.id}
                              onClick={() => handleSyncCert(c.id)}
                            >
                              Emitir certificado
                            </button>
                            {c.client_id && (
                              <button
                                type="button"
                                className="text-xs text-brand-700 hover:underline text-left"
                                onClick={() => copyToClipboard(c.client_id!)}
                              >
                                Copiar client_id
                              </button>
                            )}
                            {c.client_secret && (
                              <button
                                type="button"
                                className="text-xs text-brand-700 hover:underline text-left"
                                onClick={() => copyToClipboard(c.client_secret!)}
                              >
                                Copiar secret ({maskKey(c.client_secret)})
                              </button>
                            )}
                            <button
                              type="button"
                              className="text-xs text-red-700 hover:underline text-left"
                              onClick={() => handleDeleteConta(c.id)}
                            >
                              Arquivar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-surface-100">
              {contas.map((c) => (
                <div key={c.id} className="px-6 py-4">
                  <div className="flex justify-between gap-2">
                    <div>
                      <span className="font-mono text-brand-600 text-sm">{c.apps?.code}</span>
                      <div className="font-medium">{displayName(c)}</div>
                      <div className="text-xs text-surface-500">{c.status}</div>
                    </div>
                    <button type="button" className="text-xs text-red-700" onClick={() => handleDeleteConta(c.id)}>
                      Arquivar
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs text-brand-700 underline"
                      onClick={() => handleSyncCredentials(c.id)}
                      disabled={syncingId === c.id}
                    >
                      Credenciais
                    </button>
                    <button
                      type="button"
                      className="text-xs text-brand-700 underline"
                      onClick={() => handleSyncCert(c.id)}
                      disabled={syncingId === c.id}
                    >
                      Certificado
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
