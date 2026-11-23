# Evidências da chamada e da avaliação automática de acessibilidade, 23/11/2026

Execuções públicas do GitHub Actions na [PR #24](https://github.com/Semantia-UniSenai/semantia-web/pull/24), a partir da interface `6bb0ba8ff3c705d540208d4e6a951924579ff686`. O runner executou o commit de merge da PR `b9eac83e773a2b332d79389643f57cb7808efbe2`, com a API pública fixada em `f1d07db796f2f4964f652669d0130a9e1ebe9eb9`. Os arquivos desta pasta são os relatórios extraídos dos artefatos das execuções, preservados no repositório para consulta após o vencimento dos ZIPs.

| Ensaio | Execução pública | Resultado |
| --- | --- | --- |
| Fluxo da chamada (Playwright + LiveKit) | [45286526656](https://github.com/Semantia-UniSenai/semantia-web/actions/runs/45286526656) | 6 aprovados, 0 falhas, 0 ignorados, 0 instáveis (25,4 s de testes) |
| Acessibilidade automática (Playwright + axe-core) | [45286526216](https://github.com/Semantia-UniSenai/semantia-web/actions/runs/45286526216) | 3 testes aprovados, 27/27 estados examinados, 0 violações automáticas (16,6 s de testes) |
| Testes unitários e de componentes (Vitest) e checagem de tipos | [45286526287](https://github.com/Semantia-UniSenai/semantia-web/actions/runs/45286526287) | 249 testes em 29 arquivos aprovados e checagem de tipos concluída |

## Chamada

Ambiente Linux (Ubuntu 24.04), Node.js 22, Chromium desktop, Playwright 1.62.1, API NestJS, PostgreSQL 16, Socket.IO e LiveKit 1.9.10. Os serviços foram iniciados no runner com credenciais temporárias. As contas foram criadas pela API e o convidado entrou por convite. A câmera e o microfone usaram mídia sintética do navegador; o transporte de mídia foi real.

| Cenário | Resultado |
| --- | --- |
| Manter configuração de contexto aberta quando o salvamento falha e conseguir repetir | Aprovado |
| Pré-visualizar câmera e monitorar microfone localmente sem publicar mídia | Aprovado |
| Interromper a pré-visualização quando a reunião é encerrada | Aprovado |
| Impedir reabertura da mídia após encerramento com token anterior | Aprovado |
| Conectar anfitrião e convidado admitido com áudio e vídeo | Aprovado |
| Recuperar reprodução de áudio quando o navegador bloqueia o autoplay | Aprovado |

O reconhecimento de fala e a adaptação textual ficaram fora deste ensaio. Firefox, WebKit e dispositivos móveis não foram avaliados nesta rodada. A [execução anterior de 09/11](https://github.com/Semantia-UniSenai/semantia-web/actions/runs/42712237707) foi interrompida antes dos testes pela ausência de um token de checkout. Com a API pública, o novo workflow dispensa esse segredo. Os seletores do formulário de contexto também foram atualizados para a semântica acessível existente.

- [Ambiente e comando](chamada/ambiente.json)
- [Resultado por cenário](chamada/casos.json)
- SHA-256 do ZIP do Actions (artefato 14871498405): `5163bd5ce4311102da84d6c04ebdb7c1a64f50bf3b436f8bac7cc8e4cb480e91`.

## Acessibilidade

O Playwright navegou pela aplicação e seus estados de interação, incluindo autenticação, convite e aprovação, configurações de contexto, temas da sala, chat, lista e remoção de participantes, dispositivos, modos literal e adaptado e reunião encerrada. A auditoria usou Chromium 151.0.7922.34, viewport de 1440 × 900, movimento reduzido e axe-core 4.12.1, com as tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` e `wcag22aa`.

Na rodada local anterior às correções foram observados três estados com violações de contraste, em sete elementos. As correções de código ajustaram a mensagem de espera da legenda no tema claro, os textos da fila de aprovação e o diálogo de remoção de participante. Na execução final do Actions, os 27 estados foram examinados, com 63 identificadores distintos de regras retornados pelo axe, zero violações automáticas e 52 ocorrências de resultados incompletos distribuídas pelos 27 estados. Os resultados incompletos requerem revisão humana e não equivalem a 52 critérios de sucesso da WCAG.

A API, o banco e a comunicação da sala foram reais. Para percorrer a interface das legendas, o reconhecimento foi simulado por uma fixture HTTP determinística e a adaptação pelo provedor de teste da API, sem inferência de modelo de fala ou LLM. Leitores de tela, aparelhos móveis físicos, serviços externos (inclusive VLibras) e avaliação de usuários ficaram fora desta execução.

A auditoria automática de 23/11 complementa o [relatório de avaliação WCAG 2.2 de 21/11/2026](../wcag-2.2-2026-11-21.md), que documenta inspeções manuais e a matriz dos 55 critérios A e AA. O resultado automático isolado não comprova conformidade integral.

- [Resumo original por estado](axe/summary.md)
- [Resultados completos e condições](axe/axe-results.json)
- SHA-256 do ZIP do Actions (artefato 14872161348): `3c39cc55359dd3a7af234147ab634bc8eed90e1578b765ba11714d74fdfab703`.

## Evidência do reconhecimento de fala (WER)

O [registro histórico de 13/08/2026](https://github.com/Semantia-UniSenai/semantia-cerebro/blob/f54a3fe9789d1d981db5c2cd7a3c362cb3101bd8/evidencias/card-08/asr-small-vs-medium-2026-08-13.json) está publicamente acessível. Foram 27 erros para 171 palavras de referência agregadas (57 por rodada, três rodadas, dois áudios sintéticos), resultando em WER de 15,79% tanto para Whisper small como para medium. O registro é agregado, com condições e contagens, e não contém os áudios ou relatórios de alinhamento originais necessários para uma reprodução exata.

O ensaio posterior de 23/11/2026 tem [execução pública no Actions, 45179433566](https://github.com/Semantia-UniSenai/semantia-api/actions/runs/45179433566) e [relatório com os dados brutos versionados](https://github.com/Semantia-UniSenai/semantia-api/blob/f1d07db796f2f4964f652669d0130a9e1ebe9eb9/docs/avaliacao/latencia-asr-2026-11-23.md). Para o Whisper small em CPU, o WER indicativo foi de 14,3% com 30 falas humanas lidas do FLEURS em português brasileiro e 24,5% com as 100 frases sintetizadas. As condições diferem do ensaio de agosto, portanto os resultados devem conservar a identificação de cada corpus e sua data.
