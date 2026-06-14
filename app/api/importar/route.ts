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
    if (date && date.y > 1900)
      return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  const str = String(val).trim();
  if (!str) return null;
  const br = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return `${dash[3]}-${dash[2].padStart(2,'0')}-${dash[1].padStart(2,'0')}`;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

function parseDia(val: any): number | null {
  if (!val) return null;
  const n = parseInt(String(val));
  return isNaN(n) || n < 1 || n > 31 ? null : n;
}

function parseValor(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).replace(/R\$\s?/g,'').replace(/\s/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.').trim();
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function normKey(k: string): string {
  return k.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_]/g,'');
}

const ALIASES: Record<string, string[]> = {
  empresa:         ['empresa','fornecedor','company','nome','credor','razaosocial'],
  valor:           ['valor','value','total','montante','quantia','amount','preco','vl','vlr'],
  data_vencimento: ['datavencimento','data_vencimento','vencimento','dtvencimento','dt_vencimento','dueddate','prazo'],
  dia_vencimento:  ['diavencimento','dia_vencimento','dia','day'],
  data:            ['data','date'],
  observacoes:     ['observacoes','observacao','obs','descricao','notas','notes','detalhes','complemento'],
};

function normalizeRows(rows: any[]): any[] {
  if (!rows.length) return [];
  const sampleKeys = Object.keys(rows[0]);
  const colMap: Record<string, string> = {};
  for (const key of sampleKeys) {
    const norm = normKey(key);
    for (const [campo, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(norm)) { colMap[key] = campo; break; }
    }
  }
  return rows.map(row => {
    const out: any = { empresa: null, valor: null, data_vencimento: null, dia_vencimento: null, data: null, observacoes: '' };
    for (const [origKey, campo] of Object.entries(colMap)) out[campo] = row[origKey] ?? null;
    return out;
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const confirmar = formData.get('confirmar') === 'true';
    // destino: 'fixas' ou 'pagamentos'
    const destino = (formData.get('destino') as string) || 'pagamentos';
    const mes = parseInt(formData.get('mes') as string || '0');
    const ano = parseInt(formData.get('ano') as string || '0');

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
          const empresa = line.replace(dateMatch[0],'').replace(valorMatch[0],'').replace(/[|;\t]+/g,' ').trim();
          if (empresa.length > 1) rawRows.push({ empresa, valor: valorMatch[0], data_vencimento: dateMatch[0], observacoes: '' });
        }
      }
    } else {
      return NextResponse.json({ error: 'Formato não suportado. Use .xlsx, .xls, .csv ou .pdf' }, { status: 400 });
    }

    const normalized = normalizeRows(rawRows);

    // Resolve data de vencimento — aceita data completa OU só dia
    const contas = normalized
      .map(r => {
        const empresa = r.empresa ? String(r.empresa).trim() : null;
        const valor = parseValor(r.valor);

        // Tenta achar a data: campo data_vencimento, ou data, ou monta com dia+mes+ano
        let dataVenc: string | null = parseDate(r.data_vencimento) || parseDate(r.data);
        let diaVenc: number | null = null;

        if (dataVenc) {
          diaVenc = parseInt(dataVenc.split('-')[2]);
        } else if (r.dia_vencimento) {
          diaVenc = parseDia(r.dia_vencimento);
          if (diaVenc && mes && ano) {
            const ultimoDia = new Date(ano, mes, 0).getDate();
            const diaReal = Math.min(diaVenc, ultimoDia);
            dataVenc = `${ano}-${String(mes).padStart(2,'0')}-${String(diaReal).padStart(2,'0')}`;
          }
        }

        return { empresa, valor, data_vencimento: dataVenc, dia_vencimento: diaVenc, observacoes: r.observacoes ? String(r.observacoes).trim() : '' };
      })
      .filter(r => r.empresa && r.valor !== null && (r.data_vencimento || r.dia_vencimento));

    const invalidas = rawRows.length - contas.length;

    if (!confirmar) {
      return NextResponse.json({ preview: contas, invalidas, total: rawRows.length });
    }

    await initDB();

    if (destino === 'fixas') {
      // Salva como contas fixas
      for (const c of contas) {
        if (!c.dia_vencimento) continue;
        await sql`
          INSERT INTO contas_fixas (empresa, dia_vencimento, valor, observacoes)
          VALUES (${c.empresa}, ${c.dia_vencimento}, ${c.valor}, ${c.observacoes})
        `;
      }
    } else {
      // Salva como pagamentos do mês
      const mesAlvo = mes || new Date().getMonth() + 1;
      const anoAlvo = ano || new Date().getFullYear();
      for (const c of contas) {
        const diaVenc = c.dia_vencimento || (c.data_vencimento ? parseInt(c.data_vencimento.split('-')[2]) : null);
        if (!diaVenc) continue;
        await sql`
          INSERT INTO pagamentos (empresa, mes, ano, dia_vencimento, valor, observacoes, avulso)
          VALUES (${c.empresa}, ${mesAlvo}, ${anoAlvo}, ${diaVenc}, ${c.valor}, ${c.observacoes}, TRUE)
        `;
      }
    }

    return NextResponse.json({ success: true, inseridas: contas.length, invalidas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}