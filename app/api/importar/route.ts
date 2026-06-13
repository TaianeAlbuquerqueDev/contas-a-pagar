import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { sql, initDB } from '@/lib/db';

function parseDate(val: any): string | null {
  if (!val) return null;

  // Already a JS Date object
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2,'0');
    const d = String(val.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  // Excel serial date number
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date && date.y > 1900) {
      return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
    }
  }

  const str = String(val).trim();

  // DD/MM/YYYY
  const br = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;

  // YYYY-MM-DD
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;

  // DD-MM-YYYY
  const dash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return `${dash[3]}-${dash[2].padStart(2,'0')}-${dash[1].padStart(2,'0')}`;

  // Last resort
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return null;
}

function parseValor(val: any): number | null {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') return val;
  const str = String(val)
    .replace(/R\$\s?/g, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3})/g, '')  // remove thousand separators
    .replace(',', '.')
    .trim();
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function normalizeRows(rows: any[]): any[] {
  const CAMPOS: Record<string, string[]> = {
    empresa:         ['empresa', 'fornecedor', 'company', 'nome', 'credor'],
    valor:           ['valor', 'value', 'total', 'montante', 'quantia', 'amount'],
    data_vencimento: ['data_vencimento', 'vencimento', 'data', 'due_date', 'prazo', 'date'],
    observacoes:     ['observacoes', 'observacao', 'obs', 'descricao', 'descricao', 'notas', 'notes', 'detalhes'],
  };

  return rows
    .filter(row => Object.values(row).some(v => v !== null && v !== ''))
    .map(row => {
      const normalized: any = {};
      const keys = Object.keys(row).map(k =>
        k.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      );
      const vals = Object.values(row);

      for (const [campo, aliases] of Object.entries(CAMPOS)) {
        const idx = keys.findIndex(k => aliases.includes(k));
        normalized[campo] = idx >= 0 ? vals[idx] : null;
      }

      return normalized;
    })
    .filter(row => row.empresa && row.valor && row.data_vencimento);
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
      // cellDates:true converts serial numbers to JS Date objects automatically
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
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
          const empresa = line
            .replace(dateMatch[0], '')
            .replace(valorMatch[0], '')
            .replace(/[|;\t]+/g, ' ')
            .trim();
          if (empresa.length > 1) {
            rawRows.push({
              empresa,
              valor: valorMatch[0],
              data_vencimento: dateMatch[0],
              observacoes: '',
            });
          }
        }
      }
    } else {
      return NextResponse.json({ error: 'Formato não suportado. Use .xlsx, .xls, .csv ou .pdf' }, { status: 400 });
    }

    const contas = ext === 'pdf'
      ? rawRows.map(r => ({
          empresa: r.empresa,
          valor: parseValor(r.valor),
          data_vencimento: parseDate(r.data_vencimento),
          observacoes: r.observacoes || '',
        }))
      : normalizeRows(rawRows).map(r => ({
          empresa: String(r.empresa).trim(),
          valor: parseValor(r.valor),
          data_vencimento: parseDate(r.data_vencimento),
          observacoes: r.observacoes ? String(r.observacoes).trim() : '',
        }));

    const validas = contas.filter(c => c.empresa && c.valor !== null && !isNaN(c.valor as number) && c.data_vencimento);
    const invalidas = contas.length - validas.length;

    if (!confirmar) {
      return NextResponse.json({ preview: validas, invalidas, total: contas.length });
    }

    await initDB();
    let inseridas = 0;
    for (const c of validas) {
      await sql`
        INSERT INTO contas (empresa, observacoes, data_vencimento, valor)
        VALUES (${c.empresa}, ${c.observacoes}, ${c.data_vencimento}, ${c.valor})
      `;
      inseridas++;
    }

    return NextResponse.json({ success: true, inseridas, invalidas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}