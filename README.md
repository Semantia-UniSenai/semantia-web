# Semantia — Web

Frontend do **Semantia**, plataforma de comunicação acessível em tempo real. O núcleo atual em
evolução permite que uma pessoa fale e participantes acompanhem legendas acessíveis; as
ferramentas de Libras, datilologia e ranking continuam disponíveis sem definir sozinhas o MVP.

O contrato canônico está no
[`semantia-cerebro`](https://github.com/Semantia-UniSenai/semantia-cerebro/blob/main/produto/contrato-mvp-transcricao-tempo-real.md).
As rotas e copys de turma/professor/aluno são **fundação educacional legada a generalizar**.

## Estado funcional

### Implementado em `dev`

- landing pública e ferramentas de acessibilidade;
- VLibras global;
- cadastro/login JWT e área autenticada;
- datilologia com score e ranking;
- turmas, convites e sessões ao vivo no domínio escolar atual;
- captura via Web Speech API;
- eventos parciais/finais por Socket.IO;
- legenda karaokê literal, chat, presença e mãos levantadas;
- tratamento do erro recorrente `network` do SpeechRecognition.

### Planejado para o contrato atual

- sala, anfitrião/comunicador e participante genéricos;
- ingresso de convidado por link sem conta;
- configuração do contexto da plateia;
- preferência individual literal/adaptada;
- apresentação da versão adaptada com fallback literal;
- UX completa responsiva/acessível da sala;
- exclusão e retenção de conteúdo/metadados identificáveis por 30 dias, com logs técnicos mínimos
  sem identidade por no máximo 90 dias;
- mídia de conferência, VLibras na sala e outros complementos após o núcleo.

Não trate o domínio escolar atual nem uma tela existente como prova dessas entregas planejadas.

## Stack

- Vue 3 com `<script setup>`;
- Vite e TypeScript;
- `vue-router`;
- TanStack Vue Query + Axios;
- client tipado gerado por Orval a partir do OpenAPI da API;
- Socket.IO Client;
- VLibras oficial via `@vue-a11y/vlibras`;
- Vitest + Vue Test Utils.

## Rotas atuais

| Rota | Estado | Observação |
|---|---|---|
| `/` | implementada | landing pública e ferramentas |
| `/entrar` | implementada | login |
| `/criar-conta` | implementada | cadastro |
| `/app` | implementada | área autenticada/datilo/ranking |
| `/app/turmas` | legado implementado | lista escolar a generalizar |
| `/app/turmas/:id` | legado implementado | detalhe escolar a generalizar |
| `/app/aula/:id` | legado implementado | sala ao vivo atual |
| `/aula/convite/:token` | parcial | convite existe, mas ainda exige conta |
| `/turma/convite/:code` | legado implementado | associação escolar |

## Estrutura principal

```text
src/
├── api/                       # client Orval e mutator Axios/JWT
├── components/
│   ├── classes/               # componentes escolares legados
│   └── live/                  # legenda, microfone, chat e mãos
├── data/                      # ferramentas e conteúdo público
├── live/                      # Socket.IO, SpeechRecognition e caption lines
├── router/                    # rotas e guards
├── stores/auth.ts             # sessão JWT persistida
└── views/                     # landing, auth, app, turmas, convites e sala ao vivo
```

## Fluxo atual da sala

1. Usuário autenticado abre a aula/sessão.
2. Comunicador autoriza o microfone.
3. Web Speech API produz parciais e finais.
4. Socket.IO transmite os eventos à API.
5. O frontend apresenta parciais e o transcript literal final no palco karaokê.
6. Chat, presença e mãos usam o mesmo namespace `/live`.

A limpeza canônica acontece no backend. O frontend só quebra texto em linhas e apresenta a
experiência; clientes alternativos não podem decidir a regra de negócio.

## Rodar local

Pré-requisito: API em `http://localhost:3000` ou `VITE_API_URL` apontando para outro ambiente.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Frontend: `http://localhost:5173`.

`VITE_API_URL` recebe somente a origin da API; as rotas geradas já incluem `/api`.

## Sincronizar o contrato da API

```bash
pnpm api:spec
pnpm api:gen
# ou
pnpm api:sync
```

`src/api/generated` é gerado e não deve ser editado à mão. Alterações locais de host/base URL não
devem entrar em PRs de produto.

## Gates

```bash
pnpm test
pnpm build
```

Para mudanças na sala, os gates adicionais são navegador real, microfone, Socket.IO, reconexão,
mobile, teclado, contraste, `aria-live` e `prefers-reduced-motion`. Testes unitários não provam
a disponibilidade do Web Speech API ou do VLibras.

## Deploy documentado

O frontend é compilado para `dist/` e pode ser publicado na Vercel. A capacidade, observabilidade
e política de retenção do novo MVP só podem ser anunciadas depois dos cards de produção e
privacidade; o frontend não deve prometer esses itens antecipadamente.
