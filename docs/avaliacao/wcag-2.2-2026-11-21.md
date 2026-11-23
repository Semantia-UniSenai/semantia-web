# Avaliação de acessibilidade WCAG 2.2 (níveis A e AA) da interface

Registro da avaliação feita pela equipe do Semantia em 21 de novembro de 2026. É a fonte citada no artigo do TCC como SEMANTIA (2026h) e acompanha o Apêndice F do artigo.

## Escopo e método

- **Critérios:** os 55 critérios de sucesso dos níveis A e AA da WCAG 2.2 (W3C, 2024): <https://www.w3.org/TR/WCAG22/>.
- **Versões:** a avaliação começou na interface `dev` no commit `daefa91`, com a API `dev` no commit `9d5eb03`, PostgreSQL 16 e dados de exemplo. As correções entraram pelo PR #22 (commits `8578ecd`, `e2313e3` e `451b69e`), integrado à `dev` no commit `8251779`.
- **Ferramenta automática:** axe-core 4.12.1 (<https://github.com/dequelabs/axe-core>), com as regras `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` e `wcag22aa`, executado no Google Chrome por Playwright.
- **Verificação manual:** percurso por teclado (Tab), ampliação equivalente a 200%, largura de 320 px, orientação paisagem, espaçamento de texto do critério 1.4.12, os dois temas da sala, medição de contraste por amostragem de pixels e leitura do código para os critérios que não se medem sozinhos.
- **Telas percorridas (25):** as 7 ferramentas da página inicial, login, cadastro, convite válido e inválido, rota inexistente, início do aplicativo, lista de reuniões, convidado entrando, sala com aprovação de entrada (anfitrião e convidado em espera), sala com convidado, chat, mão levantada, lista de pessoas, confirmação de remoção, teste de câmera e microfone, formulário de contexto, sala com legenda literal e adaptada e reunião encerrada.
- **Legenda ao vivo (1.2.4):** o serviço de reconhecimento de fala foi executado (Whisper small) e a sala exibiu legendas a partir de uma gravação sintética de referência em português (`reference-clean.wav`, 21 s).

## Resultado

| Situação | 1ª rodada | Após as correções |
|---|---|---|
| Atende | 26 | 45 |
| Não atende | 8 | 0 |
| Não se aplica | 9 | 9 |
| Não verificado | 12 | 1 |

Ao final, o axe não encontrou violações nas 25 telas. Os testes da interface passaram de 233 para 249 (16 novos), todos aprovados no GitHub Actions: <https://github.com/Semantia-UniSenai/semantia-web/actions/runs/44957967110>.

## Situação de cada critério

| Nº | Critério | Nível | Situação | Evidência |
|---|---|---|---|---|
| 1.1.1 | Conteúdo não textual | A | Atende | axe sem violações de alternativa em texto nas 25 telas; revisão manual da qualidade dos textos não foi exaustiva. |
| 1.2.1 | Somente áudio e somente vídeo (pré-gravado) | A | Não verificado | Vídeo mudo do alfabeto manual; foi acrescentada descrição geral em texto, mas falta descrição letra a letra por quem conheça Libras. |
| 1.2.2 | Legendas (pré-gravadas) | A | Não se aplica | Não há vídeo gravado com áudio; a trilha do vídeo do alfabeto está em silêncio. |
| 1.2.3 | Audiodescrição ou mídia alternativa (pré-gravada) | A | Não se aplica | Mesmo motivo do critério 1.2.2. |
| 1.2.4 | Legendas (ao vivo) | AA | Atende | Com o reconhecimento de fala em execução e gravação sintética de referência, a sala exibiu legendas em cerca de 25 s, com região aria-live; precisão e latência não foram avaliadas. |
| 1.2.5 | Audiodescrição (pré-gravada) | AA | Não se aplica | Mesmo motivo do critério 1.2.2. |
| 1.3.1 | Informações e relações | A | Atende | axe sem violações; ressalva: dois rótulos em contêineres sem papel semântico (aviso do axe). |
| 1.3.2 | Sequência significativa | A | Atende | Ordem de Tab coerente com a ordem de leitura nas 25 telas. |
| 1.3.3 | Características sensoriais | A | Atende | Varredura do texto das telas e do código; corrigida a instrução que dizia "soletrando abaixo". |
| 1.3.4 | Orientação | AA | Atende | Sem bloqueio de orientação; sem rolagem horizontal em paisagem (844 × 390). |
| 1.3.5 | Identificar a finalidade da entrada | AA | Atende | Campos de nome, e-mail e senha com o atributo autocomplete correspondente. |
| 1.4.1 | Uso de cor | A | Atende | Links sublinhados; erros descritos em texto. |
| 1.4.2 | Controle de áudio | A | Atende | Nenhum áudio inicia sozinho. |
| 1.4.3 | Contraste (mínimo) | AA | Atende | Corrigido: texto cinza (3,09:1), legenda do tema claro (até 2,03:1), chat, tela de aprovação e botões; axe sem violações nas 25 telas e medição por amostragem nos dois temas da sala. |
| 1.4.4 | Redimensionar texto | AA | Atende | Zoom equivalente a 200% sem rolagem horizontal nas telas. |
| 1.4.5 | Imagens de texto | AA | Atende | Texto real; imagem apenas no logotipo. |
| 1.4.10 | Reflow | AA | Atende | Sem rolagem horizontal a 320 px nas telas. |
| 1.4.11 | Contraste não textual | AA | Atende | Corrigido: bordas dos campos de formulário passaram de cerca de 1,2:1 para 3,76:1. |
| 1.4.12 | Espaçamento de texto | AA | Atende | Espaçamento ampliado sem corte nem sobreposição de conteúdo. |
| 1.4.13 | Conteúdo em foco ou ao passar o mouse | AA | Atende | Não há conteúdo próprio exibido por foco ou hover; as dicas title são do navegador. |
| 2.1.1 | Teclado | A | Atende | Percurso por Tab nas 25 telas; corrigido: o corpo rolável dos modais de ferramentas não era alcançável. |
| 2.1.2 | Sem bloqueio de teclado | A | Atende | Nenhuma armadilha de foco; Esc fecha os diálogos. |
| 2.1.4 | Atalhos de teclas de caracteres | A | Não se aplica | Não há atalhos de uma tecla; o único é Esc. |
| 2.2.1 | Tempo ajustável | A | Atende | Corrigido: a bandeja de reações fechava sozinha em 6 s; os avisos de 5 s são eventos em tempo real; a sessão dura 7 dias. |
| 2.2.2 | Pausar, parar, ocultar | A | Atende | Corrigido: o fundo animado da página inicial passou a parar após 5 s. |
| 2.3.1 | Três flashes ou abaixo do limite | A | Atende | Revisão do código: sem efeitos piscantes; sem medição instrumental. |
| 2.4.1 | Ignorar blocos | A | Atende | Links "Pular para o conteúdo" e "Ir para a legenda"; regiões de referência. |
| 2.4.2 | Página com título | A | Atende | Corrigido: as 14 telas tinham o mesmo título; agora há título por rota. |
| 2.4.3 | Ordem do foco | A | Atende | Corrigido: o foco saía do formulário de contexto para controles cobertos; o formulário virou diálogo modal com foco preso. |
| 2.4.4 | Finalidade do link (em contexto) | A | Atende | Textos de link descritivos. |
| 2.4.5 | Várias formas | AA | Atende | Corrigido: o cadastro e a lista de reuniões tinham um só caminho; agora há "Início" e "Minhas reuniões" no cabeçalho e "Criar conta" na página inicial. |
| 2.4.6 | Cabeçalhos e rótulos | AA | Atende | Rótulos e títulos descritivos; ressalva: a sala não tem título de nível 1. |
| 2.4.7 | Foco visível | AA | Atende | Corrigido: campos do login, do convite e do contexto não mostravam foco; agora têm contorno de 3 px. |
| 2.4.11 | Foco não obscurecido (mínimo) | AA | Atende | Corrigido: o foco chegava a 18 elementos cobertos pelo formulário de contexto; agora a 0. |
| 2.5.1 | Gestos de ponteiro | A | Não se aplica | Tudo se opera com clique ou toque simples. |
| 2.5.2 | Cancelamento de ponteiro | A | Atende | Ações por clique nativo. |
| 2.5.3 | Rótulo em nome | A | Atende | Corrigido: botões de áudio, vídeo, reações e A−/A+ tinham nome acessível sem o texto visível. |
| 2.5.4 | Atuação por movimento | A | Não se aplica | Nenhuma função usa sensor de movimento. |
| 2.5.7 | Movimentos de arrastar | AA | Não se aplica | Não há arrastar e soltar. |
| 2.5.8 | Tamanho do alvo (mínimo) | AA | Atende | Controles com 40 px ou mais; o menor alvo (68 × 17 px) está a 112 px do vizinho. |
| 3.1.1 | Idioma da página | A | Atende | Atributo lang="pt-BR". |
| 3.1.2 | Idioma das partes | AA | Atende | Corrigido: mensagem de erro do login aparecia em inglês; agora em português. |
| 3.2.1 | Em foco | A | Atende | Nenhuma mudança de contexto ao receber o foco. |
| 3.2.2 | Na entrada | A | Atende | Formulários só mudam de tela ao serem enviados. |
| 3.2.3 | Navegação consistente | AA | Atende | Corrigido: o cabeçalho do aplicativo tem os mesmos links, na mesma ordem, em todas as telas. |
| 3.2.4 | Identificação consistente | AA | Atende | Corrigido: a entrada por convite se chamava "Continuar" e "Entrar na reunião"; agora tem um só rótulo. |
| 3.2.6 | Ajuda consistente | A | Não se aplica | Não há mecanismo de ajuda. |
| 3.3.1 | Identificação do erro | A | Atende | Erros em texto com role="alert"; ressalva: o login não associa o erro ao campo (sem aria-invalid). |
| 3.3.2 | Rótulos ou instruções | A | Atende | Todos os campos têm rótulo. |
| 3.3.3 | Sugestão de erro | AA | Atende | Mensagens indicam como corrigir; o login é genérico de propósito, por segurança. |
| 3.3.4 | Prevenção de erros (legal, financeiro, dados) | AA | Não se aplica | Sem transações legais ou financeiras e sem dados de teste do usuário. |
| 3.3.7 | Entrada redundante | A | Atende | Corrigido: quem tem conta precisava digitar o nome de novo no convite; agora vem preenchido. |
| 3.3.8 | Autenticação acessível (mínimo) | AA | Atende | O login aceita gerenciador de senhas e colagem; sem teste cognitivo. |
| 4.1.2 | Nome, função, valor | A | Atende | Corrigido: o botão "Controlar quem entra na sala" não tinha nome acessível. |
| 4.1.3 | Mensagens de status | AA | Atende | Regiões aria-live na legenda e nos avisos; leitor de tela não foi usado. |

"Atende" inclui os critérios que falharam na primeira rodada e foram corrigidos (indicados por "Corrigido"); "Não se aplica" indica que o sistema não oferece o recurso a que o critério se refere; "Não verificado" indica evidência insuficiente para concluir.

## Limites

- Só Google Chrome, em computador de mesa; não houve teste com leitor de tela nem com celular físico.
- A legenda ao vivo foi observada com fala sintética, sem medir precisão nem latência com falantes reais.
- Parte do contraste (fundos em gradiente) foi medida por amostragem de pixels; a aparência das novas cores e bordas ainda deve ser conferida pela equipe.
- O critério 1.2.1 depende de uma descrição, letra a letra, do vídeo do alfabeto manual, a ser escrita e validada por pessoa com conhecimento de Libras.
- O resultado é uma avaliação técnica do escopo descrito e não constitui declaração de conformidade integral com a WCAG 2.2 AA. Avaliação com usuários surdos continua como trabalho futuro.
