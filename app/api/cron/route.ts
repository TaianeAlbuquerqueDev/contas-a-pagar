import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;
    const diaHoje = hoje.getDate();
    const diaAmanha = diaHoje + 1;

    const contasHoje = await sql`
      SELECT * FROM pagamentos
      WHERE status = 'pendente' AND ano = ${ano} AND mes = ${mes}
        AND dia_vencimento = ${diaHoje}
      ORDER BY empresa ASC
    `;

    const contasAmanha = await sql`
      SELECT * FROM pagamentos
      WHERE status = 'pendente' AND ano = ${ano} AND mes = ${mes}
        AND dia_vencimento = ${diaAmanha}
      ORDER BY empresa ASC
    `;

    // Também pega vencidas (atrasadas) para não deixar passar
    const contasAtrasadas = await sql`
      SELECT * FROM pagamentos
      WHERE status = 'pendente' AND ano = ${ano} AND mes = ${mes}
        AND dia_vencimento < ${diaHoje}
      ORDER BY dia_vencimento ASC
    `;

    const temAlgo = contasHoje.length > 0 || contasAmanha.length > 0 || contasAtrasadas.length > 0;

    if (!temAlgo) {
      return NextResponse.json({ mensagem: 'Nenhuma conta para hoje ou amanhã. Nada enviado.' });
    }

    const dataHoje = hoje.toLocaleDateString('pt-BR');
    const amanha = new Date(hoje); amanha.setDate(diaAmanha);
    const dataAmanha = amanha.toLocaleDateString('pt-BR');

    const montarLinhas = (lista: any[], corBorda: string, corFundo: string) =>
      lista.map(p => `
        <tr>
          <td style="padding:9px 12px;border:1px solid ${corBorda};background:${corFundo}">${p.empresa}</td>
          <td style="padding:9px 12px;border:1px solid ${corBorda};background:${corFundo};font-weight:bold">R$ ${parseFloat(p.valor).toFixed(2)}</td>
          <td style="padding:9px 12px;border:1px solid ${corBorda};background:${corFundo}">${p.observacoes || '-'}</td>
        </tr>`).join('');

    const secao = (titulo: string, cor: string, lista: any[], corBorda: string, corFundo: string) =>
      lista.length === 0 ? '' : `
        <div style="margin-bottom:24px">
          <h3 style="margin:0 0 10px;color:${cor};font-size:15px">${titulo}</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr style="background:#f1f5f9">
              <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0">Empresa</th>
              <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0">Valor</th>
              <th style="padding:8px 12px;text-align:left;border:1px solid #e2e8f0">Obs.</th>
            </tr>
            ${montarLinhas(lista, corBorda, corFundo)}
          </table>
          <div style="text-align:right;margin-top:6px;font-size:13px;color:#64748b">
            Subtotal: R$ ${lista.reduce((s: number, p: any) => s + parseFloat(p.valor), 0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
          </div>
        </div>`;

    const totalGeral = [...contasHoje, ...contasAmanha, ...contasAtrasadas]
      .reduce((s: number, p: any) => s + parseFloat(p.valor), 0);

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:620px;margin:0 auto">
        <div style="background:#1e293b;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <h2 style="margin:0 0 4px;font-size:18px">💰 Contas a Pagar</h2>
          <div style="font-size:13px;color:#94a3b8">Resumo do dia — ${dataHoje}</div>
        </div>
        <div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">

          ${secao(`🚨 Atrasadas (${contasAtrasadas.length})`, '#dc2626', contasAtrasadas, '#fecaca', '#fef2f2')}
          ${secao(`📅 Vencem HOJE — ${dataHoje} (${contasHoje.length})`, '#d97706', contasHoje, '#fde68a', '#fefce8')}
          ${secao(`🔔 Vencem AMANHÃ — ${dataAmanha} (${contasAmanha.length})`, '#2563eb', contasAmanha, '#bfdbfe', '#eff6ff')}

          <div style="background:#f8fafc;border-radius:8px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <span style="color:#64748b;font-size:14px">Total em aberto neste resumo</span>
            <strong style="font-size:16px;color:#1e293b">R$ ${totalGeral.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>
          </div>
        </div>
      </div>`;

    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const assuntoPartes = [];
    if (contasAtrasadas.length) assuntoPartes.push(`${contasAtrasadas.length} atrasada(s)`);
    if (contasHoje.length) assuntoPartes.push(`${contasHoje.length} hoje`);
    if (contasAmanha.length) assuntoPartes.push(`${contasAmanha.length} amanhã`);

    await transporter.sendMail({
      from: `"Contas a Pagar" <${process.env.SMTP_USER}>`,
      to: process.env.EMAIL_ALERTA || process.env.SMTP_USER,
      subject: `💰 ${assuntoPartes.join(' · ')} — ${dataHoje}`,
      html,
    });

    return NextResponse.json({
      sucesso: true,
      atrasadas: contasAtrasadas.length,
      hoje: contasHoje.length,
      amanha: contasAmanha.length,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}