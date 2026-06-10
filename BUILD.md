# Build — 3D Manager Pro

## Arquitetura

- **API** (`server/`) — Node + Express + MongoDB Atlas, autenticação JWT
- **Cliente** (`www/`) — Electron, Android e iOS via Capacitor
- Cada **cliente** tem `tenantId` próprio; vendas, estoque e custos ficam isolados
- **Admin** (`super_admin`) — painel para ativar/desativar contas e ver último acesso

## Configuração

1. Copie `.env.example` para `.env` e preencha `MONGODB_URI` e `JWT_SECRET`
2. Admin padrão (primeira execução): `ADMIN_EMAIL` / `ADMIN_PASSWORD` no `.env`

## Desktop (Electron)

```bash
npm install
npm start
```

O Electron inicia a API em `http://127.0.0.1:3847` automaticamente.

Somente API:

```bash
npm run server
```

## Mobile (Android / iOS)

1. A API precisa estar acessível na rede (PC com `npm run server` ou servidor na nuvem)
2. No login do app, informe a **URL da API**, ex: `http://192.168.1.10:3847`
3. Cadastre-se ou entre com a conta do cliente
4. Android: HTTP liberado (`usesCleartextTraffic`) para desenvolvimento local

```bash
npm run cap:sync
npm run build:android
```

## Contas

| Tipo | Uso |
|------|-----|
| Cliente | Cadastro na aba **Cadastrar** — vê só seus dados |
| Admin | Login com e-mail/senha do `.env` — painel de clientes |

## Produção

- Publique a API (Railway, Render, VPS) com HTTPS
- No mobile, use `https://sua-api.com` na URL do servidor
- Altere `JWT_SECRET` e `ADMIN_PASSWORD` em produção

## Dados antigos (sem tenantId)

Documentos criados antes desta versão não têm `tenantId` e não aparecem para clientes novos. Migre manualmente no MongoDB ou recadastre.
