import { NextRequest, NextResponse } from 'next/server';
import { sql, initDB } from '@/lib/db';

export async function GET() {
  try {
    await initDB();
    const fixas = await sql`SELECT * FROM contas_fixas ORDER BY dia_vencimento ASC, empresa ASC`;
    return NextResponse.json(fixas);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDB();
    const { empresa, dia_vencimento, valor, observacoes } = await request.json();
    if (!empresa || !dia_vencimento || !valor)
      return NextResponse.json({ error: 'Campos obrigatórios: empresa, dia_vencimento, valor' }, { status: 400 });

    const result = await sql`
      INSERT INTO contas_fixas (empresa, dia_vencimento, valor, observacoes)
      VALUES (${empresa}, ${dia_vencimento}, ${parseFloat(valor)}, ${observacoes || ''})
      RETURNING *
    `;
    return NextResponse.json(result[0], { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, empresa, dia_vencimento, valor, observacoes, ativa } = await request.json();
    const result = await sql`
      UPDATE contas_fixas
      SET empresa = ${empresa}, dia_vencimento = ${dia_vencimento},
          valor = ${parseFloat(valor)}, observacoes = ${observacoes || ''},
          ativa = ${ativa ?? true}
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
    await sql`DELETE FROM contas_fixas WHERE id = ${parseInt(id!)}`;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}