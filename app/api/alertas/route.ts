import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;
    const diaHoje = hoje.getDate();
    const dia3 = diaHoje + 3;

    const vencidas = await sql`
      SELECT * FROM pagamentos
      WHERE status = 'pendente' AND ano = ${ano} AND mes = ${mes}
        AND dia_vencimento < ${diaHoje}
      ORDER BY dia_vencimento ASC
    `;

    const vencendo = await sql`
      SELECT * FROM pagamentos
      WHERE status = 'pendente' AND ano = ${ano} AND mes = ${mes}
        AND dia_vencimento >= ${diaHoje} AND dia_vencimento <= ${dia3}
      ORDER BY dia_vencimento ASC
    `;

    return NextResponse.json({ vencendo, vencidas, total: vencidas.length + vencendo.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tipo, pagamentos: contas, email_destino } = await request.json();

    if (tipo === 'email') {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      const linhas = contas.map((c: any) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd">${c.empresa}</td>
          <td style="padding:8px;border:1px solid #ddd">R$ ${parseFloat(c.valor).toFixed(2)}</td>
          <td style="padding:8px;border:1px solid #ddd">Dia ${c.dia_vencimento}</td>
          <td style="padding:8px;border:1px solid #ddd">${c.observacoes || '-'}</td>
        </tr>`).join('');

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email_destino || process.env.SMTP_USER,
        subject: `⚠️ Contas a Pagar — ${contas.length} pendente(s)`,
        html: `<h2>Contas a Pagar</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr style="background:#f0f0f0">
              <th style="padding:8px;border:1px solid #ddd">Empresa</th>
              <th style="padding:8px;border:1px solid #ddd">Valor</th>
              <th style="padding:8px;border:1px solid #ddd">Vencimento</th>
              <th style="padding:8px;border:1px solid #ddd">Obs.</th>
            </tr>${linhas}
          </table>
          <p>Total: R$ ${contas.reduce((s: number, c: any) => s + parseFloat(c.valor), 0).toFixed(2)}</p>`,
      });
      return NextResponse.json({ success: true });
    }

    if (tipo === 'whatsapp') {
      const total = contas.reduce((s: number, c: any) => s + parseFloat(c.valor), 0);
      const lista = contas.map((c: any) =>
        `• ${c.empresa} — R$ ${parseFloat(c.valor).toFixed(2)} (dia ${c.dia_vencimento})`
      ).join('\n');
      const msg = encodeURIComponent(`🔔 *Contas a Pagar*\n\n${lista}\n\n*Total: R$ ${total.toFixed(2)}*`);
      return NextResponse.json({ success: true, whatsapp_url: `https://wa.me/?text=${msg}` });
    }

    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}