import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS contas (
      id SERIAL PRIMARY KEY,
      empresa VARCHAR(255) NOT NULL,
      observacoes TEXT,
      data_vencimento DATE NOT NULL,
      valor DECIMAL(12, 2) NOT NULL,
      status VARCHAR(20) DEFAULT 'pendente',
      alerta_enviado BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export { sql };
