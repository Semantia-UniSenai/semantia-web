export type ToolStatus = 'disponivel' | 'em-construcao' | 'em-breve' | 'fase-2'

export interface Tool {
  id: string
  title: string
  description: string
  status: ToolStatus
  icon: 'semantica' | 'avatar' | 'mao' | 'dicionario' | 'camera'
  featured?: boolean
  /** fonte/credito quando a ferramenta usa base externa */
  source?: string
}

export const statusLabel: Record<ToolStatus, string> = {
  disponivel: 'Disponível',
  'em-construcao': 'Em construção',
  'em-breve': 'Em breve',
  'fase-2': 'Fase 2',
}

export const tools: Tool[] = [
  {
    id: 'semantica',
    title: 'Adaptação Semântica',
    description:
      'O coração do Semantia. Reorganiza o texto na lógica visual da Libras — não palavra por palavra — e aponta os sinais de cada conceito.',
    status: 'em-construcao',
    icon: 'semantica',
    featured: true,
  },
  {
    id: 'tradutor',
    title: 'Tradutor em Libras',
    description: 'Qualquer texto da página traduzido em avatar 3D, na hora.',
    status: 'disponivel',
    icon: 'avatar',
    source: 'VLibras · gov.br',
  },
  {
    id: 'datilologia',
    title: 'Datilologia',
    description: 'Digite uma palavra e veja como soletrá-la no alfabeto manual.',
    status: 'em-construcao',
    icon: 'mao',
  },
  {
    id: 'dicionario',
    title: 'Dicionário de Sinais',
    description: 'Busque sinais por conceito, com vídeo e parâmetros linguísticos.',
    status: 'em-breve',
    icon: 'dicionario',
    source: 'Signbank · UFSC',
  },
  {
    id: 'reconhecer',
    title: 'Reconhecer Sinais',
    description: 'Aponte a webcam e reconheça sinais isolados em Libras.',
    status: 'fase-2',
    icon: 'camera',
  },
]
