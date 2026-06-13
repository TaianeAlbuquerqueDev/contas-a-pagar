import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { sql, initDB } from '@/lib/db';

function parseDate(val: any): string | null {
  if (!val) return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date && date.y > 1900) {
      return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
    }
  }

  const str = String(val).trim();
  if (!str) return null;

  // DD/MM/YYYY
  const br = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;

  // YYYY-MM-DD (com ou sem hora)
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  // DD-MM-YYYY
  const dash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return `${dash[3]}-${dash[2].padStart(2,'0')}-${dash[1].padStart(2,'0')}`;

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return null;
}

function parseValor(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val)
    .replace(/R\$\s?/g, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // remove separador de milhar
    .replace(',', '.')
    .trim();
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

// Normaliza o nome da coluna para comparação
function normKey(k: string): string {
  return k.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '');
}

const ALIASES: Record<string, string[]> = {
  empresa:         ['empresa', 'fornecedor', 'company', 'nome', 'credor', 'razaosocial'],
  valor:           ['valor', 'value', 'total', 'montante', 'quantia', 'amount', 'preco', 'vl', 'vlr'],
  data_vencimento: ['data_vencimento', 'vencimento', 'data', 'duedDate', 'prazo', 'date', 'datavencimento', 'dt_vencimento', 'dtvencimento'],
  observacoes:     ['observacoes', 'observacao', 'obs', 'descricao', 'descricoes', 'notas', 'notes', 'detalhes', 'complemento'],
};

function normalizeRows(rows: any[]): any[] {
  if (!rows.length) return [];

  // Mapeia nomes de colunas reais para campos do sistema
  const sampleKeys = Object.keys(rows[0]);
  const colMap: Record<string, string> = {};

  for (const key of sampleKeys) {
    const norm = normKey(key);
    for (const [campo, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(norm)) {
        colMap[key] = campo;
        break;
      }
    }
  }

  return rows
    .map(row => {
      const out: any = { empresa: null, valor: null, data_vencimento: null, observacoes: '' };
      for (const [origKey, campo] of Object.entries(colMap)) {
        out[campo] = row[origKey] ?? null;
      }
      return out;
    })
    .filter(row => {
      const empresa = row.empresa && String(row.empresa).trim();
      const valor = parseValor(row.valor);
      const data = parseDate(row.data_vencimento);
      return empresa && valor !== null && data !== null;
    });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const confirmar = formData.get('confirmar') === 'true';

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let rawRows: any[] = [];

    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
    } else if (ext === 'pdf') {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
      const pdfData = await pdfParse(buffer);
      const lines = pdfData.text.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/;
      const valorPattern = /R?\$?\s?[\d.,]+/;
      for (const line of lines) {
        const dateMatch = line.match(datePattern);
        const valorMatch = line.match(valorPattern);
        if (dateMatch && valorMatch) {
          const empresa = line.replace(dateMatch[0], '').replace(valorMatch[0], '').replace(/[|;\t]+/g, ' ').trim();
          if (empresa.length > 1) rawRows.push({ empresa, valor: valorMatch[0], data_vencimento: dateMatch[0], observacoes: '' });
        }
      }
    } else {
      return NextResponse.json({ error: 'Formato não suportado. Use .xlsx, .xls, .csv ou .pdf' }, { status: 400 });
    }

    const normalized = normalizeRows(rawRows);

    const contas = normalized.map(r => ({
      empresa: String(r.empresa).trim(),
      valor: parseValor(r.valor)!,
      data_vencimento: parseDate(r.data_vencimento)!,
      observacoes: r.observacoes ? String(r.observacoes).trim() : '',
    }));

    const invalidas = rawRows.length - contas.length;

    if (!confirmar) {
      return NextResponse.json({ preview: contas, invalidas, total: rawRows.length });
    }

    await initDB();
    for (const c of contas) {
      await sql`
        INSERT INTO contas (empresa, observacoes, data_vencimento, valor)
        VALUES (${c.empresa}, ${c.observacoes}, ${c.data_vencimento}, ${c.valor})
      `;
    }

    return NextResponse.json({ success: true, inseridas: contas.length, invalidas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}