# Build — 3D Manager Pro

## Arquitetura

- **API** (`server/`) — Node + Express + MongoDB Atlas, autenticação JWT
- **Cliente** (`www/`) — Electron, Android e iOS via Capacitor
- Cada **cliente** tem `tenantId` próprio; vendas, estoque e custos ficam isolados
- **Admin** (`super_admin`) — painel para ativar/desativar contas e ver último acesso

## Configuração

1. Instale as dependências da API: `npm run server:install`
2. Copie `server/.env.example` para `server/.env` e preencha `MONGODB_URI` e `JWT_SECRET`
3. Admin padrão (primeira execução): `ADMIN_EMAIL` / `ADMIN_PASSWORD` no `server/.env`

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

## Produção (Render)

A pasta `server/` é um pacote Node independente — pode ser publicada sozinha.

1. Crie um **Web Service** no Render apontando para este repositório
2. **Root Directory:** `server`
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. Variáveis de ambiente no painel do Render:
   - `MONGODB_URI` — connection string do MongoDB Atlas
   - `JWT_SECRET` — segredo forte para tokens
   - `ADMIN_EMAIL` e `ADMIN_PASSWORD` — conta admin inicial
6. O Render define `PORT` automaticamente; não é necessário configurar

No mobile/desktop, use `https://sua-api.onrender.com` na URL do servidor.

## Dados antigos (sem tenantId)

Documentos criados antes desta versão não têm `tenantId` e não aparecem para clientes novos. Migre manualmente no MongoDB ou recadastre.
