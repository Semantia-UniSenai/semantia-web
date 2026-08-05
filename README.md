# Semantia — Web

Frontend do **Semantia**, plataforma de comunicação acessível em tempo real. O núcleo permite que um comunicador fale e os participantes acompanhem legendas finais produzidas pelo ASR protegido do backend.

O contrato canônico está no [`semantia-cerebro`](https://github.com/Semantia-UniSenai/semantia-cerebro/blob/main/produto/contrato-mvp-transcricao-tempo-real.md).

## Estado funcional

- landing pública e ferramentas de acessibilidade;
- cadastro/login JWT e área autenticada;
- reuniões instantâneas com `HOST`, `MODERATOR`, `PARTICIPANT` e `GUEST`;
- ingresso de convidado por link sem conta;
- legenda literal, chat, presença e mãos levantadas;
- captura do microfone escolhido em PCM, sem reconhecimento textual no navegador;
- fila efêmera com retry, ACK, idempotência e expiração;
- estados visíveis de captura, processamento e indisponibilidade.

Contexto da plateia, versão adaptada por IA, retenção configurável e mídia de conferência continuam fora deste fluxo literal.

## Stack

- Vue 3 com `<script setup>`;
- Vite e TypeScript;
- `vue-router`;
- TanStack Vue Query + Axios;
- client tipado gerado por Orval a partir do OpenAPI da API;
- Socket.IO Client;
- Web Audio API (`AudioWorklet` com fallback `ScriptProcessor`);
- VLibras oficial via `@vue-a11y/vlibras`;
- Vitest + Vue Test Utils.

## Rotas atuais

| Rota | Observação |
|---|---|
| `/` | landing pública e ferramentas |
| `/entrar` | login |
| `/criar-conta` | cadastro |
| `/app` | início autenticado e criação de reunião instantânea |
| `/app/salas` | reuniões do usuário e histórico |
| `/sala/:sessionId` | sala ao vivo ou histórico somente leitura |
| `/convite/reuniao/:token` | ingresso autenticado ou convidado sem conta |

## Estrutura principal

```text
src/
├── api/                       # client Orval e mutator Axios/JWT
├── components/
│   ├── classes/               # componentes escolares legados
│   └── live/                  # legenda, microfone, chat e mãos
├── data/                      # ferramentas e conteúdo público
├── live/                      # captura PCM, fila e Socket.IO
├── router/                    # rotas e guards
├── stores/auth.ts             # sessão JWT persistida
└── views/                     # landing, auth, app, reuniões, convites e sala ao vivo
```

## Fluxo da transcrição

1. O anfitrião liga explicitamente a captura e autoriza o microfone.
2. `getUserMedia` e `AudioWorklet` capturam a entrada escolhida sem transformar áudio em texto.
3. Frames contíguos formam janelas fixas de 5 segundos; não há segmentação por conteúdo, VAD ou hipótese textual.
4. Cada janela é reamostrada para 16 kHz mono e codificada em PCM16 little-endian, sempre em memória.
5. O trecho residual com pelo menos 250 ms é enviado quando o anfitrião pausa, sai ou encerra a reunião.
6. A fila efêmera aceita no máximo oito segmentos por 60 segundos e usa `clientSegmentId` estável para retry/reconexão.
7. A API autoriza `HOST` em sessão `LIVE`, chama o ASR CPU-first e publica somente o texto final canônico.
8. Áudio é descartado após ACK, falha definitiva, expiração, saída ou encerramento; não entra em banco, arquivo, volume, `IndexedDB`, `localStorage` ou logs.

Não existem callbacks ou eventos Socket.IO para publicar texto parcial/final originado no cliente. O navegador apenas captura áudio e renderiza finais recebidos do servidor.

## Rodar local

Pré-requisito: API em `http://localhost:3000` ou `VITE_API_URL` apontando para outro ambiente. A API deve alcançar o serviço ASR interno.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Frontend: `http://localhost:5173`.

`VITE_API_URL` recebe somente a origem da API; as rotas geradas já incluem `/api`.

## Sincronizar o contrato da API

```bash
pnpm api:spec
pnpm api:gen
# ou
pnpm api:sync
```

`src/api/generated` é gerado e não deve ser editado à mão.

## Gates

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm audit --prod
```

Para mudanças na sala, valide também navegador real, microfone, Socket.IO, reconexão, mobile, teclado, contraste, `aria-live`, `prefers-reduced-motion`, fila/expiração e liberação de tracks/`AudioContext`.

## Deploy

O frontend é compilado para `dist/` e pode ser publicado na Vercel. Capacidade, observabilidade e políticas de retenção só devem ser anunciadas após validação dos cards correspondentes.
