import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const em3dias = new Date(hoje);
    em3dias.setDate(em3dias.getDate() + 3);

    const contasVencendo = await sql`
      SELECT * FROM contas
      WHERE status = 'pendente'
      AND data_vencimento <= ${em3dias.toISOString().split('T')[0]}
      AND data_vencimento >= ${hoje.toISOString().split('T')[0]}
      ORDER BY data_vencimento ASC
    `;

    const contasVencidas = await sql`
      SELECT * FROM contas
      WHERE status = 'pendente'
      AND data_vencimento < ${hoje.toISOString().split('T')[0]}
      ORDER BY data_vencimento DESC
    `;

    return NextResponse.json({
      vencendo: contasVencendo,
      vencidas: contasVencidas,
      total: contasVencendo.length + contasVencidas.length
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tipo, contas, email_destino } = body;

    if (tipo === 'email') {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const linhasTabela = contas.map((c: any) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd">${c.empresa}</td>
          <td style="padding:8px;border:1px solid #ddd">R$ ${parseFloat(c.valor).toFixed(2)}</td>
          <td style="padding:8px;border:1px solid #ddd">${new Date(c.data_vencimento).toLocaleDateString('pt-BR')}</td>
          <td style="padding:8px;border:1px solid #ddd">${c.observacoes || '-'}</td>
        </tr>
      `).join('');

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email_destino || process.env.SMTP_USER,
        subject: `⚠️ Contas a Pagar - ${contas.length} conta(s) pendente(s)`,
        html: `
          <h2>Resumo de Contas a Pagar</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr style="background:#f0f0f0">
              <th style="padding:8px;border:1px solid #ddd">Empresa</th>
              <th style="padding:8px;border:1px solid #ddd">Valor</th>
              <th style="padding:8px;border:1px solid #ddd">Vencimento</th>
              <th style="padding:8px;border:1px solid #ddd">Observações</th>
            </tr>
            ${linhasTabela}
          </table>
          <p>Total pendente: R$ ${contas.reduce((s: number, c: any) => s + parseFloat(c.valor), 0).toFixed(2)}</p>
        `,
      });

      return NextResponse.json({ success: true, mensagem: 'Email enviado com sucesso!' });
    }

    if (tipo === 'whatsapp') {
      const total = contas.reduce((s: number, c: any) => s + parseFloat(c.valor), 0);
      const lista = contas.map((c: any) =>
        `• ${c.empresa} - R$ ${parseFloat(c.valor).toFixed(2)} (vence ${new Date(c.data_vencimento).toLocaleDateString('pt-BR')})`
      ).join('\n');

      const mensagem = encodeURIComponent(
        `🔔 *Contas a Pagar*\n\n${lista}\n\n*Total: R$ ${total.toFixed(2)}*`
      );

      return NextResponse.json({
        success: true,
        whatsapp_url: `https://wa.me/?text=${mensagem}`
      });
    }

    return NextResponse.json({ error: 'Tipo de alerta inválido' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
