export type ToolStatus = 'disponivel' | 'em-construcao' | 'pro' | 'fase-2'
export type ToolOpen = 'vlibras' | 'dicionario' | 'sinal' | 'recursos' | 'faq' | 'guia' | 'datilologia' | null
export type ToolCategory = 'ferramentas' | 'duvidas' | 'jogos'

export interface Tool {
  id: string
  title: string
  description: string
  status: ToolStatus
  icon: 'avatar' | 'dicionario' | 'sinal' | 'recursos' | 'faq' | 'guia' | 'mao' | 'quiz' | 'semantica'
  category: ToolCategory
  open?: ToolOpen
  source?: string
}

export const statusLabel: Record<ToolStatus, string> = {
  disponivel: 'Disponível',
  'em-construcao': 'Em construção',
  pro: 'Pro',
  'fase-2': 'Fase 2',
}

// Seções da vitrine de ferramentas, na ordem de exibição.
export const toolSections: Array<{ key: ToolCategory; title: string; subtitle: string }> = [
  { key: 'ferramentas', title: 'Ferramentas', subtitle: 'Traduza, pesquise e encontre apoio em Libras.' },
  { key: 'duvidas', title: 'Dúvidas e Formação', subtitle: 'Tire dúvidas e aprenda a incluir.' },
  { key: 'jogos', title: 'Jogos', subtitle: 'Aprenda praticando — e dispute pontos.' },
]

export const tools: Tool[] = [
  {
    id: 'tradutor',
    title: 'Tradutor em Libras',
    description: 'Qualquer texto da página traduzido em avatar 3D, na hora.',
    status: 'disponivel',
    icon: 'avatar',
    category: 'ferramentas',
    open: 'vlibras',
    source: 'VLibras · gov.br',
  },
  {
    id: 'dicionario',
    title: 'Dicionário de Sinais',
    description: 'Busque um sinal por palavra e veja o vídeo correspondente.',
    status: 'disponivel',
    icon: 'dicionario',
    category: 'ferramentas',
    open: 'dicionario',
    source: 'Spread the Sign',
  },
  {
    id: 'sinal-do-dia',
    title: 'Sinal do dia',
    description: 'Um sinal novo todo dia pra você aprender no hábito.',
    status: 'disponivel',
    icon: 'sinal',
    category: 'ferramentas',
    open: 'sinal',
  },
  {
    id: 'recursos',
    title: 'Mapa de recursos',
    description: 'Onde aprender, traduzir e encontrar apoio em Libras.',
    status: 'disponivel',
    icon: 'recursos',
    category: 'ferramentas',
    open: 'recursos',
  },
  {
    id: 'faq',
    title: 'Dúvidas sobre Libras',
    description: 'Respostas diretas sobre surdez, Libras e como se comunicar.',
    status: 'disponivel',
    icon: 'faq',
    category: 'duvidas',
    open: 'faq',
  },
  {
    id: 'guia',
    title: 'Incluir um aluno com deficiência auditiva',
    description: 'Guia rápido e prático para professores e famílias.',
    status: 'disponivel',
    icon: 'guia',
    category: 'duvidas',
    open: 'guia',
  },
  {
    id: 'datilologia',
    title: 'Datilologia',
    description: 'Aprenda o alfabeto manual e treine soletrando qualquer palavra.',
    status: 'disponivel',
    icon: 'mao',
    category: 'jogos',
    open: 'datilologia',
    source: 'Vídeo · Master Link Libras',
  },
  {
    id: 'quiz',
    title: 'Quiz: adivinhe o sinal',
    description: 'Veja o sinal e acerte a palavra. Treino que vicia.',
    status: 'em-construcao',
    icon: 'quiz',
    category: 'jogos',
  },
  {
    id: 'semantica',
    title: 'Adaptação Semântica',
    description: 'O coração do Semantia: reorganiza o texto na lógica da Libras. Recurso Pro.',
    status: 'pro',
    icon: 'semantica',
    category: 'ferramentas',
  },
]
