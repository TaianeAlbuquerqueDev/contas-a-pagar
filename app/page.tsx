'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

type ContaFixa = {
  id: number; empresa: string; dia_vencimento: number;
  valor: number; observacoes: string; ativa: boolean;
};
type Pagamento = {
  id: number; conta_fixa_id: number | null; empresa: string;
  mes: number; ano: number; dia_vencimento: number;
  valor: number; observacoes: string; status: 'pendente' | 'pago'; avulso: boolean;
};
type PreviewConta = { empresa: string; valor: number | null; data_vencimento: string | null; observacoes: string };

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export default function Home() {
  const hoje = new Date();
  const [aba, setAba] = useState<'pagamentos'|'fixas'|'alertas'>('pagamentos');
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1);
  const [anoSel, setAnoSel] = useState(hoje.getFullYear());

  // Pagamentos
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [totalPendente, setTotalPendente] = useState(0);
  const [totalPago, setTotalPago] = useState(0);
  const [mesGerado, setMesGerado] = useState(false);

  // Contas fixas
  const [fixas, setFixas] = useState<ContaFixa[]>([]);

  // Alertas
  const [alertas, setAlertas] = useState<{vencendo: Pagamento[]; vencidas: Pagamento[]}>({vencendo:[], vencidas:[]});
  const [emailAlerta, setEmailAlerta] = useState('');

  // Modais
  const [modalPag, setModalPag] = useState(false);
  const [modalFixa, setModalFixa] = useState(false);
  const [editPag, setEditPag] = useState<Pagamento|null>(null);
  const [editFixa, setEditFixa] = useState<ContaFixa|null>(null);
  const [formPag, setFormPag] = useState({empresa:'', dia_vencimento:'', valor:'', observacoes:''});
  const [formFixa, setFormFixa] = useState({empresa:'', dia_vencimento:'', valor:'', observacoes:''});

  // Import
  const [modalImport, setModalImport] = useState(false);
  const [importFile, setImportFile] = useState<File|null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<PreviewConta[]|null>(null);
  const [importStats, setImportStats] = useState<{total:number; invalidas:number}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const carregarPagamentos = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/pagamentos?mes=${mesSel}&ano=${anoSel}`);
      const d = await r.json();
      setPagamentos(d.pagamentos || []);
      setTotalPendente(d.totalPendente || 0);
      setTotalPago(d.totalPago || 0);
      setMesGerado((d.pagamentos || []).some((p: Pagamento) => !p.avulso));
    } catch { setErro('Erro ao carregar pagamentos.'); }
    finally { setLoading(false); }
  }, [mesSel, anoSel]);

  const carregarFixas = useCallback(async () => {
    const r = await fetch('/api/contas-fixas');
    const d = await r.json();
    setFixas(Array.isArray(d) ? d : []);
  }, []);

  const carregarAlertas = useCallback(async () => {
    const r = await fetch('/api/alertas');
    const d = await r.json();
    setAlertas({ vencendo: d.vencendo || [], vencidas: d.vencidas || [] });
  }, []);

  useEffect(() => { carregarPagamentos(); carregarAlertas(); }, [carregarPagamentos, carregarAlertas]);
  useEffect(() => { if (aba === 'fixas') carregarFixas(); }, [aba, carregarFixas]);

  const gerarMes = async () => {
    if (!confirm(`Gerar pagamentos de ${MESES[mesSel-1]} ${anoSel} a partir das contas fixas?`)) return;
    setLoading(true);
    const r = await fetch('/api/pagamentos', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ acao: 'gerar_mes', mes: mesSel, ano: anoSel }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.error) { setErro(d.error); return; }
    showToast(`${d.inseridos} contas geradas para ${MESES[mesSel-1]}!`);
    carregarPagamentos();
  };

  const marcarPago = async (p: Pagamento) => {
    const novoStatus = p.status === 'pago' ? 'pendente' : 'pago';
    await fetch('/api/pagamentos', {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({...p, status: novoStatus}),
    });
    showToast(novoStatus === 'pago' ? 'Marcado como pago!' : 'Reaberto!');
    carregarPagamentos(); carregarAlertas();
  };

  const excluirPag = async (id: number) => {
    if (!confirm('Excluir este pagamento?')) return;
    await fetch(`/api/pagamentos?id=${id}`, {method:'DELETE'});
    showToast('Excluído!'); carregarPagamentos(); carregarAlertas();
  };

  const abrirModalPag = (p?: Pagamento) => {
    setEditPag(p || null);
    setFormPag(p ? {empresa:p.empresa, dia_vencimento:String(p.dia_vencimento), valor:String(p.valor), observacoes:p.observacoes||''} : {empresa:'',dia_vencimento:'',valor:'',observacoes:''});
    setErro(''); setModalPag(true);
  };

  const salvarPag = async () => {
    if (!formPag.empresa || !formPag.dia_vencimento || !formPag.valor) { setErro('Preencha empresa, dia e valor.'); return; }
    setLoading(true); setErro('');
    if (editPag) {
      await fetch('/api/pagamentos', { method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({...editPag, ...formPag, dia_vencimento: parseInt(formPag.dia_vencimento)}),
      });
      showToast('Atualizado!');
    } else {
      await fetch('/api/pagamentos', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({...formPag, dia_vencimento: parseInt(formPag.dia_vencimento), mes: mesSel, ano: anoSel}),
      });
      showToast('Adicionado!');
    }
    setModalPag(false); setLoading(false); carregarPagamentos(); carregarAlertas();
  };

  const excluirFixa = async (id: number) => {
    if (!confirm('Excluir esta conta fixa?')) return;
    await fetch(`/api/contas-fixas?id=${id}`, {method:'DELETE'});
    showToast('Excluída!'); carregarFixas();
  };

  const abrirModalFixa = (f?: ContaFixa) => {
    setEditFixa(f || null);
    setFormFixa(f ? {empresa:f.empresa, dia_vencimento:String(f.dia_vencimento), valor:String(f.valor), observacoes:f.observacoes||''} : {empresa:'',dia_vencimento:'',valor:'',observacoes:''});
    setErro(''); setModalFixa(true);
  };

  const salvarFixa = async () => {
    if (!formFixa.empresa || !formFixa.dia_vencimento || !formFixa.valor) { setErro('Preencha todos os campos.'); return; }
    setLoading(true); setErro('');
    if (editFixa) {
      await fetch('/api/contas-fixas', { method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({...editFixa, ...formFixa, dia_vencimento: parseInt(formFixa.dia_vencimento)}),
      });
      showToast('Atualizado!');
    } else {
      await fetch('/api/contas-fixas', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({...formFixa, dia_vencimento: parseInt(formFixa.dia_vencimento)}),
      });
      showToast('Conta fixa criada!');
    }
    setModalFixa(false); setLoading(false); carregarFixas();
  };

  const toggleAtiva = async (f: ContaFixa) => {
    await fetch('/api/contas-fixas', { method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({...f, ativa: !f.ativa}),
    });
    showToast(f.ativa ? 'Conta desativada.' : 'Conta ativada!'); carregarFixas();
  };

  const enviarEmail = async () => {
    const lista = [...alertas.vencidas, ...alertas.vencendo];
    if (!emailAlerta) { setErro('Informe um email.'); return; }
    if (!lista.length) { showToast('Nenhuma conta crítica.'); return; }
    const r = await fetch('/api/alertas', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({tipo:'email', pagamentos: lista, email_destino: emailAlerta}),
    });
    const d = await r.json();
    if (d.success) showToast('Email enviado!'); else setErro('Erro ao enviar email.');
  };

  const enviarWhatsApp = async () => {
    const lista = [...alertas.vencidas, ...alertas.vencendo];
    if (!lista.length) { showToast('Nenhuma conta crítica.'); return; }
    const r = await fetch('/api/alertas', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({tipo:'whatsapp', pagamentos: lista}),
    });
    const d = await r.json();
    if (d.whatsapp_url) window.open(d.whatsapp_url, '_blank');
  };

  // Import
  const abrirImport = () => { setImportFile(null); setImportPreview(null); setImportStats(null); setErro(''); setModalImport(true); };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setImportFile(f); setImportPreview(null); setImportStats(null); setErro('');
  };
  const previewImport = async () => {
    if (!importFile) return;
    setImportLoading(true); setErro('');
    const fd = new FormData(); fd.append('file', importFile); fd.append('confirmar','false');
    const r = await fetch('/api/importar', {method:'POST', body: fd});
    const d = await r.json();
    setImportLoading(false);
    if (d.error) { setErro(d.error); return; }
    setImportPreview(d.preview); setImportStats({total: d.total, invalidas: d.invalidas});
  };
  const confirmarImport = async () => {
    if (!importFile || !importPreview?.length) return;
    setImportLoading(true);
    const fd = new FormData(); fd.append('file', importFile); fd.append('confirmar','true');
    const r = await fetch('/api/importar', {method:'POST', body: fd});
    const d = await r.json();
    setImportLoading(false);
    if (d.error) { setErro(d.error); return; }
    setModalImport(false); showToast(`${d.inseridas} conta(s) importada(s)!`);
    carregarFixas();
  };

  const badgeDia = (p: Pagamento) => {
    if (p.status === 'pago') return { cor:'#16a34a', bg:'#dcfce7', label:'Pago' };
    const diaHoje = new Date().getDate();
    const mesAtual = new Date().getMonth() + 1;
    const anoAtual = new Date().getFullYear();
    if (p.ano !== anoAtual || p.mes !== mesAtual) return { cor:'#2563eb', bg:'#dbeafe', label:`Dia ${p.dia_vencimento}` };
    const diff = p.dia_vencimento - diaHoje;
    if (diff < 0) return { cor:'#dc2626', bg:'#fee2e2', label:`${Math.abs(diff)}d atraso` };
    if (diff === 0) return { cor:'#d97706', bg:'#fef3c7', label:'Hoje!' };
    if (diff <= 3) return { cor:'#d97706', bg:'#fef3c7', label:`${diff}d` };
    return { cor:'#2563eb', bg:'#dbeafe', label:`Dia ${p.dia_vencimento}` };
  };

  const totalAlertas = alertas.vencidas.length + alertas.vencendo.length;
  const s = { input: { width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid #d1d5db', fontSize:15, boxSizing:'border-box' as const } };

  return (
    <div style={{minHeight:'100vh', background:'#f8fafc', fontFamily:'system-ui, sans-serif'}}>
      {/* Header */}
      <header style={{background:'#1e293b', color:'#fff', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:64}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <span style={{fontSize:22}}>💰</span>
          <span style={{fontWeight:700, fontSize:18}}>Contas a Pagar</span>
        </div>
        <div style={{display:'flex', gap:10}}>
          <button onClick={abrirImport} style={{background:'transparent', color:'#94a3b8', border:'1px solid #334155', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontWeight:600, fontSize:13}}>
            📂 Importar
          </button>
          <button onClick={() => aba === 'fixas' ? abrirModalFixa() : abrirModalPag()} style={{background:'#3b82f6', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontWeight:600, fontSize:14}}>
            + {aba === 'fixas' ? 'Nova Conta Fixa' : 'Lançamento Avulso'}
          </button>
        </div>
      </header>

      {toast && <div style={{position:'fixed', top:20, right:20, background:'#1e293b', color:'#fff', padding:'12px 24px', borderRadius:10, zIndex:9999}}>✅ {toast}</div>}

      <div style={{maxWidth:980, margin:'0 auto', padding:'24px 16px'}}>

        {/* Banner alertas */}
        {totalAlertas > 0 && (
          <div style={{background:'#fef3c7', border:'1px solid #f59e0b', borderRadius:10, padding:'12px 18px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10}}>
            <span style={{color:'#92400e', fontWeight:600}}>⚠️ {alertas.vencidas.length} vencida(s) · {alertas.vencendo.length} vencendo em até 3 dias</span>
            <button onClick={() => setAba('alertas')} style={{background:'#f59e0b', border:'none', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontWeight:600, color:'#fff', fontSize:13}}>Ver alertas</button>
          </div>
        )}

        {/* Cards */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px,1fr))', gap:16, marginBottom:28}}>
          {[
            {label:'Pendente', valor:`R$ ${parseFloat(String(totalPendente)).toLocaleString('pt-BR',{minimumFractionDigits:2})}`, cor:'#dc2626'},
            {label:'Pago', valor:`R$ ${parseFloat(String(totalPago)).toLocaleString('pt-BR',{minimumFractionDigits:2})}`, cor:'#16a34a'},
            {label:'Total do Mês', valor:`R$ ${(parseFloat(String(totalPendente))+parseFloat(String(totalPago))).toLocaleString('pt-BR',{minimumFractionDigits:2})}`, cor:'#1e293b'},
            {label:'Contas Fixas', valor:`${fixas.filter(f=>f.ativa).length} ativas`, cor:'#2563eb'},
          ].map(c => (
            <div key={c.label} style={{background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'18px 20px'}}>
              <div style={{fontSize:12, color:'#64748b', marginBottom:4}}>{c.label}</div>
              <div style={{fontSize:20, fontWeight:700, color:c.cor}}>{c.valor}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{display:'flex', gap:8, marginBottom:20}}>
          {([['pagamentos','📋 Pagamentos'],['fixas','🔒 Contas Fixas'],['alertas',`🔔 Alertas${totalAlertas>0?` (${totalAlertas})`:''}`]] as const).map(([id,label]) => (
            <button key={id} onClick={() => setAba(id)} style={{padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:600, fontSize:14, background: aba===id ? '#1e293b' : '#fff', color: aba===id ? '#fff' : '#64748b'}}>
              {label}
            </button>
          ))}
        </div>

        {/* ABA: PAGAMENTOS */}
        {aba === 'pagamentos' && (
          <>
            <div style={{display:'flex', gap:12, marginBottom:20, alignItems:'center', flexWrap:'wrap'}}>
              <select value={mesSel} onChange={e => setMesSel(+e.target.value)} style={{padding:'8px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', fontSize:14}}>
                {MESES.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <input type="number" value={anoSel} onChange={e => setAnoSel(+e.target.value)} style={{width:90, padding:'8px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:14}} />
              <button onClick={carregarPagamentos} style={{padding:'8px 14px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontSize:14}}>🔄</button>
              {!mesGerado && fixas.length > 0 && (
                <button onClick={gerarMes} style={{padding:'8px 18px', borderRadius:8, border:'none', background:'#7c3aed', color:'#fff', cursor:'pointer', fontWeight:600, fontSize:14}}>
                  ⚡ Gerar {MESES[mesSel-1]}
                </button>
              )}
            </div>

            {loading ? (
              <div style={{textAlign:'center', padding:40, color:'#64748b'}}>Carregando...</div>
            ) : pagamentos.length === 0 ? (
              <div style={{textAlign:'center', padding:60, color:'#94a3b8'}}>
                <div style={{fontSize:48}}>📭</div>
                <div style={{marginTop:8, marginBottom:16}}>Nenhum pagamento neste período</div>
                {fixas.length > 0 ? (
                  <button onClick={gerarMes} style={{background:'#7c3aed', color:'#fff', border:'none', borderRadius:8, padding:'12px 24px', cursor:'pointer', fontWeight:700, fontSize:15}}>
                    ⚡ Gerar pagamentos de {MESES[mesSel-1]}
                  </button>
                ) : (
                  <div style={{fontSize:13, color:'#94a3b8'}}>Cadastre contas fixas primeiro, ou adicione um lançamento avulso.</div>
                )}
              </div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:10}}>
                {pagamentos.map(p => {
                  const badge = badgeDia(p);
                  return (
                    <div key={p.id} style={{background:'#fff', borderRadius:12, border:`1px solid ${p.status==='pago'?'#bbf7d0':'#e2e8f0'}`, padding:'14px 20px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', opacity: p.status==='pago' ? 0.72 : 1}}>
                      <div style={{flex:1, minWidth:180}}>
                        <div style={{display:'flex', alignItems:'center', gap:8}}>
                          <span style={{fontWeight:700, fontSize:15, color:'#1e293b'}}>{p.empresa}</span>
                          {p.avulso && <span style={{fontSize:11, background:'#fef3c7', color:'#92400e', padding:'1px 7px', borderRadius:20, fontWeight:600}}>avulso</span>}
                        </div>
                        {p.observacoes && <div style={{fontSize:13, color:'#64748b', marginTop:2}}>{p.observacoes}</div>}
                      </div>
                      <div style={{fontWeight:700, fontSize:18, color: p.status==='pago'?'#16a34a':'#dc2626'}}>
                        R$ {parseFloat(String(p.valor)).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                      </div>
                      <span style={{background:badge.bg, color:badge.cor, padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:700}}>{badge.label}</span>
                      <div style={{display:'flex', gap:6}}>
                        <button onClick={() => marcarPago(p)} style={{padding:'7px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer'}}>{p.status==='pago'?'↩️':'✅'}</button>
                        <button onClick={() => abrirModalPag(p)} style={{padding:'7px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer'}}>✏️</button>
                        <button onClick={() => excluirPag(p.id)} style={{padding:'7px 12px', borderRadius:8, border:'1px solid #fee2e2', background:'#fef2f2', cursor:'pointer'}}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ABA: CONTAS FIXAS */}
        {aba === 'fixas' && (
          <div>
            <div style={{fontSize:13, color:'#64748b', marginBottom:16}}>
              Contas fixas são geradas automaticamente todo mês. Desative as que não se aplicam temporariamente.
            </div>
            {fixas.length === 0 ? (
              <div style={{textAlign:'center', padding:60, color:'#94a3b8'}}>
                <div style={{fontSize:48}}>🔒</div>
                <div style={{marginTop:8, marginBottom:16}}>Nenhuma conta fixa cadastrada</div>
                <button onClick={() => abrirModalFixa()} style={{background:'#1e293b', color:'#fff', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer'}}>+ Cadastrar primeira conta fixa</button>
              </div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:10}}>
                {fixas.map(f => (
                  <div key={f.id} style={{background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'14px 20px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', opacity: f.ativa ? 1 : 0.5}}>
                    <div style={{flex:1, minWidth:180}}>
                      <div style={{fontWeight:700, fontSize:15, color:'#1e293b'}}>{f.empresa}</div>
                      {f.observacoes && <div style={{fontSize:13, color:'#64748b', marginTop:2}}>{f.observacoes}</div>}
                    </div>
                    <div style={{fontWeight:700, fontSize:18, color:'#1e293b'}}>
                      R$ {parseFloat(String(f.valor)).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </div>
                    <span style={{background:'#f1f5f9', color:'#475569', padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600}}>
                      Todo dia {f.dia_vencimento}
                    </span>
                    <div style={{display:'flex', gap:6}}>
                      <button onClick={() => toggleAtiva(f)} title={f.ativa?'Desativar':'Ativar'} style={{padding:'7px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer'}}>{f.ativa?'⏸️':'▶️'}</button>
                      <button onClick={() => abrirModalFixa(f)} style={{padding:'7px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer'}}>✏️</button>
                      <button onClick={() => excluirFixa(f.id)} style={{padding:'7px 12px', borderRadius:8, border:'1px solid #fee2e2', background:'#fef2f2', cursor:'pointer'}}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: ALERTAS */}
        {aba === 'alertas' && (
          <div style={{display:'flex', flexDirection:'column', gap:20}}>
            <div style={{background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'20px 24px'}}>
              <h3 style={{margin:'0 0 14px', fontSize:16, fontWeight:700}}>📨 Enviar Alertas</h3>
              <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
                <input type="email" placeholder="Email de destino" value={emailAlerta} onChange={e => setEmailAlerta(e.target.value)} style={{flex:1, minWidth:200, padding:'10px 14px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:14}} />
                <button onClick={enviarEmail} style={{padding:'10px 18px', borderRadius:8, border:'none', background:'#3b82f6', color:'#fff', cursor:'pointer', fontWeight:600}}>📧 Email</button>
                <button onClick={enviarWhatsApp} style={{padding:'10px 18px', borderRadius:8, border:'none', background:'#25d366', color:'#fff', cursor:'pointer', fontWeight:600}}>💬 WhatsApp</button>
              </div>
              {erro && <div style={{marginTop:10, color:'#dc2626', fontSize:13}}>⚠️ {erro}</div>}
            </div>
            {alertas.vencidas.length > 0 && (
              <div>
                <h3 style={{fontSize:15, fontWeight:700, color:'#dc2626', marginBottom:10}}>🚨 Vencidas</h3>
                {alertas.vencidas.map(p => (
                  <div key={p.id} style={{background:'#fef2f2', borderRadius:10, border:'1px solid #fecaca', padding:'14px 18px', marginBottom:8, display:'flex', justifyContent:'space-between'}}>
                    <div><div style={{fontWeight:700}}>{p.empresa}</div><div style={{fontSize:13, color:'#64748b'}}>Venceu dia {p.dia_vencimento}</div></div>
                    <div style={{fontWeight:700, color:'#dc2626'}}>R$ {parseFloat(String(p.valor)).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                  </div>
                ))}
              </div>
            )}
            {alertas.vencendo.length > 0 && (
              <div>
                <h3 style={{fontSize:15, fontWeight:700, color:'#d97706', marginBottom:10}}>⏰ Vencendo em breve</h3>
                {alertas.vencendo.map(p => (
                  <div key={p.id} style={{background:'#fef9c3', borderRadius:10, border:'1px solid #fde68a', padding:'14px 18px', marginBottom:8, display:'flex', justifyContent:'space-between'}}>
                    <div><div style={{fontWeight:700}}>{p.empresa}</div><div style={{fontSize:13, color:'#64748b'}}>Vence dia {p.dia_vencimento}</div></div>
                    <div style={{fontWeight:700, color:'#d97706'}}>R$ {parseFloat(String(p.valor)).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                  </div>
                ))}
              </div>
            )}
            {totalAlertas === 0 && <div style={{textAlign:'center', padding:60, color:'#94a3b8'}}><div style={{fontSize:48}}>🎉</div><div style={{marginTop:12}}>Tudo em dia!</div></div>}
          </div>
        )}
      </div>

      {/* Modal Pagamento */}
      {modalPag && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20}}>
          <div style={{background:'#fff', borderRadius:16, padding:28, width:'100%', maxWidth:460}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22}}>
              <h2 style={{margin:0, fontSize:18, fontWeight:700}}>{editPag ? 'Editar Lançamento' : 'Lançamento Avulso'}</h2>
              <button onClick={() => setModalPag(false)} style={{border:'none', background:'none', cursor:'pointer', fontSize:20}}>✕</button>
            </div>
            {[
              {label:'Empresa *', key:'empresa', type:'text', placeholder:'Nome da empresa'},
              {label:'Dia de Vencimento *', key:'dia_vencimento', type:'number', placeholder:'Ex: 10'},
              {label:'Valor (R$) *', key:'valor', type:'number', placeholder:'0.00'},
              {label:'Observações', key:'observacoes', type:'text', placeholder:'Opcional'},
            ].map(({label,key,type,placeholder}) => (
              <div key={key} style={{marginBottom:14}}>
                <label style={{display:'block', fontSize:13, fontWeight:600, marginBottom:5, color:'#374151'}}>{label}</label>
                <input type={type} placeholder={placeholder} value={(formPag as any)[key]}
                  onChange={e => setFormPag(f => ({...f, [key]: e.target.value}))} style={s.input} />
              </div>
            ))}
            {erro && <div style={{color:'#dc2626', fontSize:13, marginBottom:12}}>⚠️ {erro}</div>}
            <div style={{display:'flex', gap:10}}>
              <button onClick={() => setModalPag(false)} style={{flex:1, padding:12, borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', fontWeight:600}}>Cancelar</button>
              <button onClick={salvarPag} disabled={loading} style={{flex:2, padding:12, borderRadius:8, border:'none', background:'#1e293b', color:'#fff', cursor:'pointer', fontWeight:700}}>
                {loading ? 'Salvando...' : editPag ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Conta Fixa */}
      {modalFixa && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20}}>
          <div style={{background:'#fff', borderRadius:16, padding:28, width:'100%', maxWidth:460}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22}}>
              <h2 style={{margin:0, fontSize:18, fontWeight:700}}>{editFixa ? 'Editar Conta Fixa' : 'Nova Conta Fixa'}</h2>
              <button onClick={() => setModalFixa(false)} style={{border:'none', background:'none', cursor:'pointer', fontSize:20}}>✕</button>
            </div>
            {[
              {label:'Empresa *', key:'empresa', type:'text', placeholder:'Nome da empresa'},
              {label:'Dia de Vencimento *', key:'dia_vencimento', type:'number', placeholder:'Ex: 5 (todo mês)'},
              {label:'Valor (R$) *', key:'valor', type:'number', placeholder:'0.00'},
              {label:'Observações', key:'observacoes', type:'text', placeholder:'Opcional'},
            ].map(({label,key,type,placeholder}) => (
              <div key={key} style={{marginBottom:14}}>
                <label style={{display:'block', fontSize:13, fontWeight:600, marginBottom:5, color:'#374151'}}>{label}</label>
                <input type={type} placeholder={placeholder} value={(formFixa as any)[key]}
                  onChange={e => setFormFixa(f => ({...f, [key]: e.target.value}))} style={s.input} />
              </div>
            ))}
            {erro && <div style={{color:'#dc2626', fontSize:13, marginBottom:12}}>⚠️ {erro}</div>}
            <div style={{display:'flex', gap:10}}>
              <button onClick={() => setModalFixa(false)} style={{flex:1, padding:12, borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', fontWeight:600}}>Cancelar</button>
              <button onClick={salvarFixa} disabled={loading} style={{flex:2, padding:12, borderRadius:8, border:'none', background:'#1e293b', color:'#fff', cursor:'pointer', fontWeight:700}}>
                {loading ? 'Salvando...' : editFixa ? 'Salvar' : 'Criar Conta Fixa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar */}
      {modalImport && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20}}>
          <div style={{background:'#fff', borderRadius:16, padding:28, width:'100%', maxWidth:580, maxHeight:'85vh', overflowY:'auto'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
              <h2 style={{margin:0, fontSize:18, fontWeight:700}}>📂 Importar Contas Fixas</h2>
              <button onClick={() => setModalImport(false)} style={{border:'none', background:'none', cursor:'pointer', fontSize:20}}>✕</button>
            </div>
            <div style={{background:'#f8fafc', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'#64748b'}}>
              A importação adiciona as contas como <strong>contas fixas</strong>. Use colunas: <code>empresa</code>, <code>dia_vencimento</code>, <code>valor</code>, <code>observacoes</code> (opcional).
            </div>
            <div style={{marginBottom:16, overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                <thead><tr style={{background:'#1e293b', color:'#fff'}}>
                  {['empresa','dia_vencimento','valor','observacoes'].map(h => <th key={h} style={{padding:'8px 12px', textAlign:'left'}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[['Aluguel','5','3200',''],['Energia','10','450',''],['Internet','15','199.90','Fibra 500MB']].map((r,i) => (
                    <tr key={i} style={{background: i%2===0?'#f8fafc':'#fff'}}>
                      {r.map((c,j) => <td key={j} style={{padding:'7px 12px', borderBottom:'1px solid #e2e8f0'}}>{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div onClick={() => fileRef.current?.click()} style={{border:`2px dashed ${importFile?'#3b82f6':'#cbd5e1'}`, borderRadius:12, padding:24, textAlign:'center', cursor:'pointer', background: importFile?'#eff6ff':'#f8fafc', marginBottom:14}}>
              <div style={{fontSize:32, marginBottom:6}}>{importFile?'📄':'📁'}</div>
              <div style={{fontWeight:600, color:'#1e293b'}}>{importFile ? importFile.name : 'Clique para selecionar'}</div>
              <div style={{fontSize:13, color:'#64748b'}}>.xlsx, .xls, .csv</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{display:'none'}} />
            </div>
            {erro && <div style={{background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 14px', color:'#dc2626', fontSize:13, marginBottom:14}}>⚠️ {erro}</div>}
            {importPreview && (
              <div style={{marginBottom:14}}>
                <div style={{fontWeight:600, fontSize:14, marginBottom:8}}>{importPreview.length} conta(s) encontrada(s){importStats?.invalidas ? ` · ${importStats.invalidas} ignorada(s)`:''}</div>
                <div style={{maxHeight:180, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:8}}>
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                    <thead style={{position:'sticky', top:0, background:'#f1f5f9'}}>
                      <tr>{['Empresa','Dia','Valor','Obs.'].map(h=><th key={h} style={{padding:'8px 12px', textAlign:'left', fontWeight:600}}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {importPreview.map((c,i) => (
                        <tr key={i} style={{background:i%2===0?'#fff':'#f8fafc'}}>
                          <td style={{padding:'7px 12px', borderBottom:'1px solid #f1f5f9'}}>{c.empresa}</td>
                          <td style={{padding:'7px 12px', borderBottom:'1px solid #f1f5f9'}}>{c.data_vencimento}</td>
                          <td style={{padding:'7px 12px', borderBottom:'1px solid #f1f5f9', color:'#dc2626', fontWeight:600}}>R$ {c.valor?.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                          <td style={{padding:'7px 12px', borderBottom:'1px solid #f1f5f9', color:'#64748b'}}>{c.observacoes||'-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div style={{display:'flex', gap:10}}>
              <button onClick={() => setModalImport(false)} style={{flex:1, padding:12, borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', fontWeight:600}}>Cancelar</button>
              {!importPreview
                ? <button onClick={previewImport} disabled={!importFile||importLoading} style={{flex:2, padding:12, borderRadius:8, border:'none', background:importFile?'#3b82f6':'#94a3b8', color:'#fff', cursor:importFile?'pointer':'default', fontWeight:700}}>
                    {importLoading?'Analisando...':'🔍 Analisar'}
                  </button>
                : <button onClick={confirmarImport} disabled={importLoading||!importPreview.length} style={{flex:2, padding:12, borderRadius:8, border:'none', background:'#16a34a', color:'#fff', cursor:'pointer', fontWeight:700}}>
                    {importLoading?'Importando...':`✅ Importar ${importPreview.length} conta(s)`}
                  </button>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}