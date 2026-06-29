# Semantia — Web (front)

Plataforma web de acessibilidade em **Libras**: tradução em avatar 3D (VLibras),
ferramentas de apoio e uma área logada com treino gamificado de datilologia.

Vue 3 + Vite + TypeScript. Consome a API ([semantia-api](https://github.com/Semantia-UniSenai/semantia-api))
por um client gerado com **orval** a partir do OpenAPI/Swagger.

## Stack

- **Vue 3** (`<script setup>`) + **Vite** + **TypeScript**
- **vue-router** (com guard de rota para a área logada)
- **@tanstack/vue-query** + **axios** (client gerado pelo orval)
- **orval** — gera o client tipado e os hooks a partir do `/docs-json` da API
- **VLibras** (`@vue-a11y/vlibras`) — tradutor oficial gov.br

## Estrutura

```
src/
├── api/
│   ├── generated/      # client orval (NÃO editar à mão — `pnpm api:gen`)
│   └── mutator.ts      # instância axios + injeção do Bearer token
├── components/
│   └── FingerspellingGame.vue   # jogo: reconhecimento de datilologia
├── data/               # tools, conteúdo livre, mapa letra→segundo do vídeo
├── router/             # rotas + guard (área logada)
├── stores/auth.ts      # sessão (token/usuário em localStorage)
└── views/              # Landing, Login, Signup, AppHome (treino + ranking)
```

## Rodar local

Pré-requisito: a API rodando (ver repo `semantia-api`), por padrão em `http://localhost:3000`.

```bash
pnpm install
cp .env.example .env      # ajuste VITE_API_URL se necessário
pnpm dev                  # http://localhost:5173
```

### Variáveis de ambiente

- `VITE_API_URL` — origin da API (ex.: `http://localhost:3000`). As rotas geradas
  pelo orval já incluem o prefixo `/api`, então aqui vai só a origin.

## Client da API (orval)

```bash
pnpm api:spec   # captura o OpenAPI da API rodando -> openapi.json
pnpm api:gen    # gera o client em src/api/generated
pnpm api:sync   # os dois acima em sequência
```

## Funcionalidades

- **Landing** pública: hero + ferramentas (Ferramentas / Dúvidas e Formação / Jogos).
- **Cadastro/Login** (JWT).
- **Área logada** (`/app`, protegida por guard): **Datilologia Challenge** —
  a mão soletra uma letra (vídeo do alfabeto manual, com o rótulo mascarado),
  o usuário escolhe a letra; pontua por acerto + velocidade; o score vai pro
  **ranking** geral.

## Build

```bash
pnpm build      # vue-tsc + vite build -> dist/
```

## Deploy

Front na **Vercel** (build `pnpm build`, output `dist/`). Defina `VITE_API_URL`
apontando para a API publicada (Render). A API fica no **Render** e o banco no **Neon**.
