'use client';

import { useState, useEffect, useCallback } from 'react';

type Conta = {
  id: number;
  empresa: string;
  observacoes: string;
  data_vencimento: string;
  valor: number;
  status: 'pendente' | 'pago';
};

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

export default function Home() {
  const hoje = new Date();
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1);
  const [anoSel, setAnoSel] = useState(hoje.getFullYear());
  const [contas, setContas] = useState<Conta[]>([]);
  const [totalPendente, setTotalPendente] = useState(0);
  const [totalPago, setTotalPago] = useState(0);
  const [alertas, setAlertas] = useState<{ vencendo: Conta[]; vencidas: Conta[] }>({ vencendo: [], vencidas: [] });
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Conta | null>(null);
  const [form, setForm] = useState({ empresa: '', observacoes: '', data_vencimento: '', valor: '' });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [toast, setToast] = useState('');
  const [abaAtiva, setAbaAtiva] = useState<'contas' | 'alertas'>('contas');
  const [emailAlerta, setEmailAlerta] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const carregarContas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contas?mes=${mesSel}&ano=${anoSel}`);
      const data = await res.json();
      setContas(data.contas || []);
      setTotalPendente(data.totalPendente || 0);
      setTotalPago(data.totalPago || 0);
    } catch {
      setErro('Erro ao carregar contas. Verifique a conexão com o banco.');
    } finally {
      setLoading(false);
    }
  }, [mesSel, anoSel]);

  const carregarAlertas = useCallback(async () => {
    try {
      const res = await fetch('/api/alertas');
      const data = await res.json();
      setAlertas({ vencendo: data.vencendo || [], vencidas: data.vencidas || [] });
    } catch {}
  }, []);

  useEffect(() => { carregarContas(); carregarAlertas(); }, [carregarContas, carregarAlertas]);

  const abrirModal = (conta?: Conta) => {
    if (conta) {
      setEditando(conta);
      setForm({
        empresa: conta.empresa,
        observacoes: conta.observacoes || '',
        data_vencimento: conta.data_vencimento.split('T')[0],
        valor: conta.valor.toString(),
      });
    } else {
      setEditando(null);
      setForm({ empresa: '', observacoes: '', data_vencimento: '', valor: '' });
    }
    setErro('');
    setModal(true);
  };

  const salvar = async () => {
    if (!form.empresa || !form.data_vencimento || !form.valor) {
      setErro('Preencha empresa, data e valor.');
      return;
    }
    setLoading(true);
    setErro('');
    try {
      if (editando) {
        await fetch('/api/contas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, id: editando.id, status: editando.status }),
        });
        showToast('Conta atualizada!');
      } else {
        await fetch('/api/contas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        showToast('Conta adicionada!');
      }
      setModal(false);
      carregarContas();
      carregarAlertas();
    } catch {
      setErro('Erro ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  const marcarPago = async (conta: Conta) => {
    const novoStatus = conta.status === 'pago' ? 'pendente' : 'pago';
    await fetch('/api/contas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...conta, data_vencimento: conta.data_vencimento.split('T')[0], status: novoStatus }),
    });
    showToast(novoStatus === 'pago' ? 'Marcado como pago!' : 'Reaberto!');
    carregarContas();
    carregarAlertas();
  };

  const excluir = async (id: number) => {
    if (!confirm('Excluir esta conta?')) return;
    await fetch(`/api/contas?id=${id}`, { method: 'DELETE' });
    showToast('Conta excluída!');
    carregarContas();
    carregarAlertas();
  };

  const enviarEmail = async () => {
    if (!emailAlerta) { setErro('Informe um email.'); return; }
    const contasAlerta = [...alertas.vencidas, ...alertas.vencendo];
    if (!contasAlerta.length) { showToast('Nenhuma conta crítica para alertar.'); return; }
    setLoading(true);
    const res = await fetch('/api/alertas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'email', contas: contasAlerta, email_destino: emailAlerta }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) showToast('Email enviado!');
    else setErro('Erro no email. Configure SMTP_HOST, SMTP_USER, SMTP_PASS no .env.');
  };

  const enviarWhatsApp = async () => {
    const contasAlerta = [...alertas.vencidas, ...alertas.vencendo];
    if (!contasAlerta.length) { showToast('Nenhuma conta crítica.'); return; }
    const res = await fetch('/api/alertas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'whatsapp', contas: contasAlerta }),
    });
    const data = await res.json();
    if (data.whatsapp_url) window.open(data.whatsapp_url, '_blank');
  };

  const diasParaVencer = (data: string) => {
    return Math.ceil((new Date(data + 'T12:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000);
  };

  const badgeVencimento = (conta: Conta) => {
    if (conta.status === 'pago') return { cor: '#16a34a', bg: '#dcfce7', label: 'Pago' };
    const dias = diasParaVencer(conta.data_vencimento);
    if (dias < 0) return { cor: '#dc2626', bg: '#fee2e2', label: `${Math.abs(dias)}d atraso` };
    if (dias === 0) return { cor: '#d97706', bg: '#fef3c7', label: 'Hoje!' };
    if (dias <= 3) return { cor: '#d97706', bg: '#fef3c7', label: `${dias}d` };
    return { cor: '#2563eb', bg: '#dbeafe', label: `${dias}d` };
  };

  const totalAlertas = alertas.vencidas.length + alertas.vencendo.length;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: '#1e293b', color: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>💰</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Contas a Pagar</span>
        </div>
        <button onClick={() => abrirModal()} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
          + Nova Conta
        </button>
      </header>

      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: '#1e293b', color: '#fff', padding: '12px 24px', borderRadius: 10, zIndex: 9999 }}>
          ✅ {toast}
        </div>
      )}

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        {totalAlertas > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ color: '#92400e', fontWeight: 600 }}>
              ⚠️ {alertas.vencidas.length} vencida(s) · {alertas.vencendo.length} vencendo em até 3 dias
            </span>
            <button onClick={() => setAbaAtiva('alertas')} style={{ background: '#f59e0b', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, color: '#fff', fontSize: 13 }}>
              Ver alertas
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total Pendente', valor: totalPendente, cor: '#dc2626' },
            { label: 'Total Pago', valor: totalPago, cor: '#16a34a' },
            { label: 'Total do Mês', valor: parseFloat(totalPendente.toString()) + parseFloat(totalPago.toString()), cor: '#1e293b' },
            { label: 'Qtd. Contas', valor: null, numero: contas.length, cor: '#1e293b' },
          ].map(({ label, valor, numero, cor }) => (
            <div key={label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: cor }}>
                {valor !== null && valor !== undefined
                  ? `R$ ${parseFloat(valor.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : numero}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['contas', 'alertas'] as const).map(aba => (
            <button key={aba} onClick={() => setAbaAtiva(aba)} style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
              background: abaAtiva === aba ? '#1e293b' : '#fff',
              color: abaAtiva === aba ? '#fff' : '#64748b',
            }}>
              {aba === 'contas' ? '📋 Contas' : `🔔 Alertas${totalAlertas > 0 ? ` (${totalAlertas})` : ''}`}
            </button>
          ))}
        </div>

        {abaAtiva === 'contas' && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={mesSel} onChange={e => setMesSel(+e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14 }}>
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={anoSel} onChange={e => setAnoSel(+e.target.value)} style={{ width: 90, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
              <button onClick={carregarContas} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14 }}>🔄</button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Carregando...</div>
            ) : contas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 48 }}>📭</div>
                <div style={{ marginTop: 8 }}>Nenhuma conta neste período</div>
                <button onClick={() => abrirModal()} style={{ marginTop: 16, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}>
                  + Adicionar conta
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {contas.map(conta => {
                  const badge = badgeVencimento(conta);
                  return (
                    <div key={conta.id} style={{
                      background: '#fff', borderRadius: 12,
                      border: `1px solid ${conta.status === 'pago' ? '#bbf7d0' : '#e2e8f0'}`,
                      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                      opacity: conta.status === 'pago' ? 0.72 : 1,
                    }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{conta.empresa}</div>
                        {conta.observacoes && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{conta.observacoes}</div>}
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          {new Date(conta.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 18, color: conta.status === 'pago' ? '#16a34a' : '#dc2626' }}>
                        R$ {parseFloat(conta.valor.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                      <span style={{ background: badge.bg, color: badge.cor, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                        {badge.label}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => marcarPago(conta)} title={conta.status === 'pago' ? 'Reabrir' : 'Marcar pago'}
                          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}>
                          {conta.status === 'pago' ? '↩️' : '✅'}
                        </button>
                        <button onClick={() => abrirModal(conta)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}>✏️</button>
                        <button onClick={() => excluir(conta.id)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer' }}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {abaAtiva === 'alertas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>📨 Enviar Alertas</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input type="email" placeholder="Email de destino" value={emailAlerta}
                  onChange={e => setEmailAlerta(e.target.value)}
                  style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
                <button onClick={enviarEmail} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  📧 Enviar Email
                </button>
                <button onClick={enviarWhatsApp} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#25d366', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  💬 WhatsApp
                </button>
              </div>
              {erro && <div style={{ marginTop: 10, color: '#dc2626', fontSize: 13 }}>⚠️ {erro}</div>}
            </div>

            {alertas.vencidas.length > 0 && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#dc2626', marginBottom: 10 }}>🚨 Vencidas</h3>
                {alertas.vencidas.map(c => (
                  <div key={c.id} style={{ background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', padding: '14px 18px', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{c.empresa}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>Venceu {new Date(c.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: '#dc2626' }}>R$ {parseFloat(c.valor.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  </div>
                ))}
              </div>
            )}

            {alertas.vencendo.length > 0 && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#d97706', marginBottom: 10 }}>⏰ Vencendo em breve</h3>
                {alertas.vencendo.map(c => (
                  <div key={c.id} style={{ background: '#fef9c3', borderRadius: 10, border: '1px solid #fde68a', padding: '14px 18px', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{c.empresa}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>Vence {new Date(c.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: '#d97706' }}>R$ {parseFloat(c.valor.toString()).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                  </div>
                ))}
              </div>
            )}

            {totalAlertas === 0 && (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 48 }}>🎉</div>
                <div style={{ marginTop: 12 }}>Tudo em dia! Nenhuma conta crítica.</div>
              </div>
            )}
          </div>
        )}
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editando ? 'Editar Conta' : 'Nova Conta'}</h2>
              <button onClick={() => setModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            {[
              { label: 'Empresa *', key: 'empresa', type: 'text', placeholder: 'Nome da empresa/fornecedor' },
              { label: 'Data de Vencimento *', key: 'data_vencimento', type: 'date', placeholder: '' },
              { label: 'Valor (R$) *', key: 'valor', type: 'number', placeholder: '0.00' },
              { label: 'Observações', key: 'observacoes', type: 'text', placeholder: 'Detalhes, NF, referência...' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#374151' }}>{label}</label>
                <input type={type} placeholder={placeholder} value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 15, boxSizing: 'border-box' }} />
              </div>
            ))}
            {erro && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>⚠️ {erro}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(false)} style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} disabled={loading} style={{ flex: 2, padding: 12, borderRadius: 8, border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
                {loading ? 'Salvando...' : editando ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
