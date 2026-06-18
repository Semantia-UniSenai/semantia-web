// Conteúdo das ferramentas gratuitas baseadas em texto/curadoria.
// Fontes oficiais/abertas. Sem imagens de sinal de licença duvidosa.

export const faq = [
  {
    q: 'Libras é uma língua de verdade?',
    a: 'Sim. A Língua Brasileira de Sinais é uma língua natural completa, com gramática própria — visual e espacial. Foi reconhecida por lei no Brasil (Lei nº 10.436/2002). Não é o português feito com as mãos.',
  },
  {
    q: 'Libras é universal?',
    a: 'Não. Cada país tem sua própria língua de sinais. A Libras é do Brasil; os Estados Unidos usam a ASL, Portugal a LGP, e assim por diante.',
  },
  {
    q: 'Toda pessoa surda sabe Libras?',
    a: 'Não necessariamente. Depende do acesso que a pessoa teve à língua. Muitas pessoas surdas se comunicam por Libras, outras por leitura labial, escrita ou de forma combinada.',
  },
  {
    q: 'Qual a diferença entre tradução literal e adaptação semântica?',
    a: 'A tradução literal troca palavra por palavra e costuma soar artificial. A adaptação semântica reorganiza o conteúdo na lógica visual da Libras, respeitando sua estrutura — é o foco do Semantia.',
  },
  {
    q: 'O que é datilologia?',
    a: 'É soletrar uma palavra letra por letra usando o alfabeto manual. Serve principalmente para nomes próprios e palavras que ainda não têm um sinal específico.',
  },
  {
    q: 'Como me comunicar com uma pessoa surda sem saber Libras?',
    a: 'Olhe para a pessoa (não para o intérprete), fale com naturalidade, use gestos e expressões, escreva quando precisar e tenha paciência. Ferramentas como o tradutor em Libras desta página também ajudam.',
  },
]

export const guia = {
  intro:
    'Você não precisa ser fluente em Libras para incluir um aluno surdo. Pequenas mudanças de atitude e de método já derrubam boa parte das barreiras.',
  passos: [
    {
      t: 'Garanta o acesso visual',
      d: 'Fale de frente, com boa iluminação no rosto. O aluno surdo precisa ver você (e o intérprete, se houver) o tempo todo.',
    },
    {
      t: 'Use apoio visual sempre',
      d: 'Imagens, vídeos, esquemas e legendas. O conteúdo entra pelos olhos — quanto mais visual, melhor a compreensão.',
    },
    {
      t: 'Antecipe o material',
      d: 'Entregue textos e slides antes da aula. Isso dá tempo de o aluno (e o intérprete) se prepararem com o vocabulário.',
    },
    {
      t: 'Respeite o papel do intérprete',
      d: 'Quando houver intérprete de Libras, fale com o aluno — não com o intérprete. Faça pausas para a tradução acompanhar.',
    },
    {
      t: 'Avalie pelo conteúdo, não pelo português',
      d: 'O português é segunda língua para muitos surdos. Valorize a compreensão da ideia, não a forma escrita perfeita.',
    },
    {
      t: 'Aprenda o básico de Libras',
      d: 'Saber saudações, o alfabeto manual e alguns sinais do dia a dia mostra respeito e aproxima. Use as ferramentas desta página.',
    },
  ],
}

export const recursos = [
  {
    t: 'VLibras',
    d: 'Tradutor oficial do governo que converte texto em Libras com avatar 3D.',
    url: 'https://vlibras.gov.br/',
  },
  {
    t: 'Spread the Sign',
    d: 'Dicionário internacional de sinais com vídeos — inclui Libras (pt.br).',
    url: 'https://www.spreadthesign.com/pt.br/search/',
  },
  {
    t: 'INES — Instituto Nacional de Educação de Surdos',
    d: 'Referência nacional: dicionário de Libras, materiais e cursos.',
    url: 'https://www.ines.gov.br/',
  },
  {
    t: 'Signbank de Libras (UFSC)',
    d: 'Banco aberto de sinais em vídeo com informação linguística.',
    url: 'https://signbank.libras.ufsc.br/',
  },
  {
    t: 'FENEIS',
    d: 'Federação Nacional de Educação e Integração dos Surdos — direitos e comunidade.',
    url: 'https://feneis.org.br/',
  },
  {
    t: 'Dicionário da Língua de Sinais (INES)',
    d: 'Consulta de sinais por verbete, com vídeo.',
    url: 'https://www.ines.gov.br/dicionario-de-libras/',
  },
  {
    t: 'Hand Talk',
    d: 'App popular de tradução para Libras (Hugo). Bom para o dia a dia.',
    url: 'https://www.handtalk.me/',
  },
]

// Sinal do dia: lista curada. Rotaciona pelo dia do ano.
// "verbete" é usado para buscar no Signbank/INES.
export const sinaisDoDia = [
  { palavra: 'Obrigado(a)', dica: 'Mão aberta tocando o queixo e indo para frente.', verbete: 'obrigado' },
  { palavra: 'Amigo(a)', dica: 'Indicadores em gancho que se engancham um no outro.', verbete: 'amigo' },
  { palavra: 'Aprender', dica: 'Mão em garra na testa, fechando — ideia de "captar".', verbete: 'aprender' },
  { palavra: 'Bom dia', dica: 'Sinal de BOM saindo da boca + DIA.', verbete: 'bom dia' },
  { palavra: 'Casa', dica: 'As duas mãos formam o telhado de uma casa.', verbete: 'casa' },
  { palavra: 'Família', dica: 'Mão em F girando em círculo, reunindo o grupo.', verbete: 'família' },
  { palavra: 'Trabalhar', dica: 'Punhos fechados batendo os pulsos, repetidamente.', verbete: 'trabalhar' },
  { palavra: 'Estudar', dica: 'Mãos abertas como um livro à frente do corpo.', verbete: 'estudar' },
]

/** Palavras sugeridas no Dicionário (busca rápida). */
export const sugestoesDicionario = [
  'obrigado', 'amor', 'casa', 'escola', 'amigo', 'água', 'comer', 'feliz',
]

export function sinalDeHoje() {
  const start = new Date(new Date().getFullYear(), 0, 0)
  const diff = Date.now() - start.getTime()
  const day = Math.floor(diff / 86400000)
  return sinaisDoDia[day % sinaisDoDia.length]
}

/** Busca no Spread the Sign (dicionário com vídeos, Libras pt.br). Deep-linkável. */
export function spreadBusca(termo: string) {
  return 'https://www.spreadthesign.com/pt.br/search/?q=' + encodeURIComponent(termo)
}

// ----- Datilologia (alfabeto manual) -----
// Vídeo self-hospedado (player próprio, sem interface do YouTube).
// Crédito: "As letras do alfabeto manual" — Master Link Libras.
export const datilologiaVideo = '/datilologia/libras-alfabeto.mp4'

/**
 * Segundo (meio da janela de exibição) em que cada letra aparece no vídeo.
 * Extraído frame a frame; região U/V refinada a 4 fps para evitar transição.
 */
export const letraSegundo: Record<string, number> = {
  A: 9.5, B: 12.5, C: 16.2, Ç: 18.5, D: 24, E: 32.5, F: 38, G: 48.5, H: 55.5,
  I: 59.5, J: 63.5, K: 69.5, L: 75, M: 82.5, N: 87.5, O: 92.5, P: 98,
  Q: 109.5, R: 116.5, S: 122.5, T: 129, U: 137, V: 140.5, W: 144.5, X: 148,
  Y: 151, Z: 154,
}

/**
 * Converte uma palavra em tokens para soletrar: letras A-Z, Ç e dígitos.
 * Acentos viram a letra base (datilologia soletra a base); espaço vira separador.
 */
export function paraDatilologia(palavra: string): Array<{ ch: string; space: boolean }> {
  const out: Array<{ ch: string; space: boolean }> = []
  for (const raw of palavra) {
    if (/\s/.test(raw)) {
      out.push({ ch: ' ', space: true })
      continue
    }
    if (raw === 'ç' || raw === 'Ç') {
      out.push({ ch: 'Ç', space: false })
      continue
    }
    const base = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    if (/[A-Z0-9]/.test(base)) out.push({ ch: base, space: false })
  }
  return out
}
