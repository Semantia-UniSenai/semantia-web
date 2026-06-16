declare module '@vue-a11y/vlibras' {
  import type { Plugin } from 'vue'
  const VLibras: Plugin
  export default VLibras
}

// Componente global registrado pelo plugin VLibras
import '@vue/runtime-core'
declare module 'vue' {
  export interface GlobalComponents {
    VLibras: import('vue').DefineComponent<{
      avatar?: string
      position?: string
      opacity?: number
      src?: string
      urlWidget?: string
    }>
  }
}
