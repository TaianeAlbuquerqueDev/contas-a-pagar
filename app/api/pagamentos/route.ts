import { NextRequest, NextResponse } from 'next/server';
import { sql, initDB } from '@/lib/db';

// Gera a data de vencimento correta para o mês/ano, respeitando dias inválidos (ex: dia 31 em fevereiro)
function dataVencimento(ano: number, mes: number, dia: number): string {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const diaReal = Math.min(dia, ultimoDia);
  return `${ano}-${String(mes).padStart(2,'0')}-${String(diaReal).padStart(2,'0')}`;
}

export async function GET(request: NextRequest) {
  try {
    await initDB();
    const { searchParams } = new URL(request.url);
    const mes = parseInt(searchParams.get('mes') || '');
    const ano = parseInt(searchParams.get('ano') || '');

    const pagamentos = await sql`
      SELECT * FROM pagamentos
      WHERE mes = ${mes} AND ano = ${ano}
      ORDER BY dia_vencimento ASC, empresa ASC
    `;

    const totalPendente = pagamentos
      .filter((p: any) => p.status === 'pendente')
      .reduce((s: number, p: any) => s + parseFloat(p.valor), 0);

    const totalPago = pagamentos
      .filter((p: any) => p.status === 'pago')
      .reduce((s: number, p: any) => s + parseFloat(p.valor), 0);

    return NextResponse.json({ pagamentos, totalPendente, totalPago });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDB();
    const body = await request.json();

    // Gerar mês a partir das contas fixas
    if (body.acao === 'gerar_mes') {
      const { mes, ano } = body;

      // Verifica se já foi gerado
      const existentes = await sql`
        SELECT COUNT(*) as total FROM pagamentos
        WHERE mes = ${mes} AND ano = ${ano} AND avulso = FALSE
      `;
      if (parseInt(existentes[0].total) > 0) {
        return NextResponse.json({ error: 'Este mês já foi gerado.' }, { status: 400 });
      }

      const fixas = await sql`SELECT * FROM contas_fixas WHERE ativa = TRUE ORDER BY dia_vencimento ASC`;
      let inseridos = 0;
      for (const f of fixas) {
        const data = dataVencimento(ano, mes, f.dia_vencimento);
        const dia = parseInt(data.split('-')[2]);
        await sql`
          INSERT INTO pagamentos (conta_fixa_id, empresa, mes, ano, dia_vencimento, valor, observacoes, avulso)
          VALUES (${f.id}, ${f.empresa}, ${mes}, ${ano}, ${dia}, ${f.valor}, ${f.observacoes}, FALSE)
        `;
        inseridos++;
      }
      return NextResponse.json({ success: true, inseridos });
    }

    // Inserir pagamento avulso
    const { empresa, mes, ano, dia_vencimento, valor, observacoes } = body;
    if (!empresa || !mes || !ano || !dia_vencimento || !valor)
      return NextResponse.json({ error: 'Campos obrigatórios faltando.' }, { status: 400 });

    const result = await sql`
      INSERT INTO pagamentos (empresa, mes, ano, dia_vencimento, valor, observacoes, avulso)
      VALUES (${empresa}, ${mes}, ${ano}, ${dia_vencimento}, ${parseFloat(valor)}, ${observacoes || ''}, TRUE)
      RETURNING *
    `;
    return NextResponse.json(result[0], { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, empresa, dia_vencimento, valor, observacoes, status } = body;

    const result = await sql`
      UPDATE pagamentos
      SET empresa = ${empresa},
          dia_vencimento = ${dia_vencimento},
          valor = ${parseFloat(valor)},
          observacoes = ${observacoes || ''},
          status = ${status},
          data_pagamento = ${status === 'pago' ? new Date().toISOString().split('T')[0] : null}
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json(result[0]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    await sql`DELETE FROM pagamentos WHERE id = ${parseInt(id!)}`;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}