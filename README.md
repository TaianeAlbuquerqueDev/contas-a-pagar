# 💰 Contas a Pagar

Sistema de controle de contas a pagar com alertas por email e WhatsApp. Construído com Next.js e banco de dados PostgreSQL na nuvem (Neon).

## Funcionalidades

- Cadastro de contas com empresa, valor, data de vencimento e observações
- Filtro por mês e ano
- Indicadores visuais de vencimento (atrasado, hoje, em breve, pago)
- Marcar contas como pagas ou reabrir
- Painel de alertas com contas vencidas e vencendo em até 3 dias
- Envio de alertas por email
- Geração de mensagem de resumo para WhatsApp

---

## Pré-requisitos

- [Node.js](https://nodejs.org) 18 ou superior
- Conta no [Neon](https://neon.tech) (banco de dados — grátis)
- Conta no [Vercel](https://vercel.com) para deploy (opcional, grátis)

---

## Configuração local

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar o banco de dados

Crie uma conta grátis em [neon.tech](https://neon.tech), crie um projeto e copie a **Connection String**.

### 3. Configurar variáveis de ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```env
# Banco de dados (Neon)
DATABASE_URL=postgresql://usuario:senha@host.neon.tech/neondb?sslmode=require

# Email para alertas (opcional — use senha de app do Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_USER=seuemail@gmail.com
SMTP_PASS=sua_senha_de_app
```

> Para gerar a senha de app do Gmail: [myaccount.google.com/security](https://myaccount.google.com/security) → Senhas de app

### 4. Rodar o projeto

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000). O banco de dados é criado automaticamente na primeira execução.

---

## Deploy na Vercel

### Via GitHub (recomendado)

1. Suba o projeto no GitHub
2. Acesse [vercel.com](https://vercel.com) e importe o repositório
3. Em **Environment Variables**, adicione as mesmas variáveis do `.env.local`
4. Clique em **Deploy**

A Vercel vai gerar um link público (ex: `https://contas-a-pagar.vercel.app`) acessível de qualquer lugar.

### Via CLI

```bash
npm install -g vercel
vercel
```

---

## Estrutura do projeto

```
app/
├── api/
│   ├── contas/route.ts   # CRUD de contas (GET, POST, PUT, DELETE)
│   └── alertas/route.ts  # Alertas por email e WhatsApp
├── page.tsx              # Interface principal
lib/
└── db.ts                 # Conexão com o banco (Neon)
```

---

## Tecnologias

- [Next.js 15](https://nextjs.org) — framework React com API Routes
- [Neon](https://neon.tech) — PostgreSQL serverless
- [Nodemailer](https://nodemailer.com) — envio de emails
- [TypeScript](https://www.typescriptlang.org)
