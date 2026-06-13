import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function initDB() {
  // Tabela de contas fixas (cadastro permanente)
  await sql`
    CREATE TABLE IF NOT EXISTS contas_fixas (
      id SERIAL PRIMARY KEY,
      empresa VARCHAR(255) NOT NULL,
      dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
      valor DECIMAL(12,2) NOT NULL,
      observacoes TEXT DEFAULT '',
      ativa BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Tabela de pagamentos mensais (gerados ou avulsos)
  await sql`
    CREATE TABLE IF NOT EXISTS pagamentos (
      id SERIAL PRIMARY KEY,
      conta_fixa_id INTEGER REFERENCES contas_fixas(id) ON DELETE SET NULL,
      empresa VARCHAR(255) NOT NULL,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      ano INTEGER NOT NULL,
      dia_vencimento INTEGER NOT NULL,
      valor DECIMAL(12,2) NOT NULL,
      observacoes TEXT DEFAULT '',
      status VARCHAR(20) DEFAULT 'pendente',
      data_pagamento DATE,
      avulso BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export { sql };