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
- base educacional legada;
- captura via Web Speech API e eventos parciais/finais por Socket.IO.

### Implementado na branch `feat/salas-comunicacao`, ainda em revisão

- reuniões instantâneas no domínio genérico, com `HOST`, `MODERATOR`, `PARTICIPANT` e `GUEST`;
- ingresso de convidado por link sem conta;
- legenda literal, chat, presença e mãos levantadas;
- tratamento do erro recorrente `network` do `SpeechRecognition`;
- fallback Vosk português em WebAssembly, executado localmente no navegador sem API, chave ou custo
  por minuto;
- convite e sala responsivos, com degradação controlada quando WebGL ou reconhecimento nativo não
  estão disponíveis.

### Planejado para o contrato atual

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
- `vosk-browser` para ASR português local em WebAssembly/Web Worker;
- VLibras oficial via `@vue-a11y/vlibras`;
- Vitest + Vue Test Utils.

## Rotas atuais

| Rota | Estado | Observação |
|---|---|---|
| `/` | implementada | landing pública e ferramentas |
| `/entrar` | implementada | login |
| `/criar-conta` | implementada | cadastro |
| `/app` | implementada na branch | início autenticado e criação de reunião instantânea |
| `/app/salas` | implementada na branch | reuniões do usuário e histórico |
| `/sala/:sessionId` | implementada na branch | sala ao vivo ou histórico somente leitura |
| `/convite/reuniao/:token` | implementada na branch | ingresso autenticado ou convidado sem conta |

## Estrutura principal

```text
src/
├── api/                       # client Orval e mutator Axios/JWT
├── components/
│   ├── classes/               # componentes escolares legados
│   └── live/                  # legenda, microfone, chat e mãos
├── data/                      # ferramentas e conteúdo público
├── live/                      # Socket.IO, Vosk local para prévias e fila PCM efêmera
├── router/                    # rotas e guards
├── stores/auth.ts             # sessão JWT persistida
└── views/                     # landing, auth, app, reuniões, convites e sala ao vivo
```

## Fluxo atual da sala

1. O anfitrião entra na reunião e autoriza o microfone.
2. `getUserMedia` e `AudioWorklet` capturam a entrada escolhida; Vosk/WebAssembly produz somente
   hipóteses parciais de baixa latência no navegador.
3. O mesmo fluxo espelha samples em memória. Cada final preliminar Vosk fecha o buffer atual, remove
   silêncio, reamostra para 16 kHz e codifica PCM16 sem criar arquivo.
4. O segmento entra em fila efêmera de no máximo oito itens/60 segundos e segue como binário pelo
   Socket.IO autenticado com um `clientSegmentId` estável para retry/reconexão.
5. A API autoriza `HOST`, valida o segmento e chama o serviço ASR CPU-first. Somente o resultado do
   backend pode virar final canônico persistido e exibido à plateia.
6. O Vosk nunca é publicado como final silencioso no modo backend. Falha/saturação fica visível e a
   aplicação não troca para cloud implicitamente.
7. Áudio pendente é descartado em sucesso, falha definitiva, expiração, saída, stop ou encerramento;
   não entra em storage, banco ou gravação. O teste isolado de microfone continua 100% local.
8. Chat, presença, mãos e texto final usam o namespace `/live`; o serviço Python ASR permanece privado.

A preparação inicial do Vosk pode levar aproximadamente um minuto. Durante esse período o botão
permite cancelar, reunião e chat continuam disponíveis e a interface não afirma que está
transcrevendo. Pausar, cancelar, falhar ou desmontar a sala remove reconhecedor, portas, nós, tracks,
`AudioContext`, buffers e timers.

Vosk e `faster-whisper` são motores de reconhecimento automático de fala (ASR), não a futura IA
generativa de adaptação para a plateia. A precisão precisa ser medida no áudio real pt-BR; não aplicar
correção generativa nem fabricar texto na etapa literal.

A limpeza canônica acontece no backend. O frontend só segmenta áudio, apresenta prévias e renderiza a
experiência; clientes alternativos não podem decidir a regra de negócio.

## Rodar local

Pré-requisito: API em `http://localhost:3000` ou `VITE_API_URL` apontando para outro ambiente. A API
deve alcançar um serviço ASR pronto; no repositório da API use `docker compose up -d postgres asr`.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Frontend: `http://localhost:5173`.

`VITE_API_URL` recebe somente a origin da API; as rotas geradas já incluem `/api`.
`VITE_VOSK_MODEL_URL` é opcional e aponta para o arquivo `tar.gz` do modelo Vosk compatível. Sem a
variável, o frontend usa o modelo português publicado pela demo oficial do `vosk-browser`. Para
produção controlada, prefira hospedar o artefato no próprio domínio e manter cache HTTP longo.

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
mobile, teclado, contraste, `aria-live`, `prefers-reduced-motion`, download/cache do modelo e
liberação das tracks. Testes unitários não provam disponibilidade do Web Speech, desempenho do
Vosk em cada dispositivo nem precisão suficiente para acessibilidade.

## Deploy documentado

O frontend é compilado para `dist/` e pode ser publicado na Vercel. A capacidade, observabilidade
e política de retenção do novo MVP só podem ser anunciadas depois dos cards de produção e
privacidade; o frontend não deve prometer esses itens antecipadamente.
