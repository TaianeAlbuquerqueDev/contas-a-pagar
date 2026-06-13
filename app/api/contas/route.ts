import { NextRequest, NextResponse } from 'next/server';
import { sql, initDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await initDB();
    const { searchParams } = new URL(request.url);
    const mes = searchParams.get('mes');
    const ano = searchParams.get('ano');

    let contas;
    if (mes && ano) {
      contas = await sql`
        SELECT * FROM contas
        WHERE EXTRACT(MONTH FROM data_vencimento) = ${parseInt(mes)}
        AND EXTRACT(YEAR FROM data_vencimento) = ${parseInt(ano)}
        ORDER BY data_vencimento ASC
      `;
    } else {
      contas = await sql`SELECT * FROM contas ORDER BY data_vencimento ASC`;
    }

    const totalPendente = contas
      .filter((c: any) => c.status === 'pendente')
      .reduce((sum: number, c: any) => sum + parseFloat(c.valor), 0);

    const totalPago = contas
      .filter((c: any) => c.status === 'pago')
      .reduce((sum: number, c: any) => sum + parseFloat(c.valor), 0);

    return NextResponse.json({ contas, totalPendente, totalPago });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDB();
    const body = await request.json();
    const { empresa, observacoes, data_vencimento, valor } = body;

    if (!empresa || !data_vencimento || !valor) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO contas (empresa, observacoes, data_vencimento, valor)
      VALUES (${empresa}, ${observacoes || ''}, ${data_vencimento}, ${parseFloat(valor)})
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
    const { id, empresa, observacoes, data_vencimento, valor, status } = body;

    const result = await sql`
      UPDATE contas
      SET empresa = ${empresa},
          observacoes = ${observacoes || ''},
          data_vencimento = ${data_vencimento},
          valor = ${parseFloat(valor)},
          status = ${status},
          updated_at = NOW()
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

    await sql`DELETE FROM contas WHERE id = ${parseInt(id!)}`;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
