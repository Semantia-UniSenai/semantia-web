import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
// @ts-expect-error — pacote sem tipos; componente global tipado em shims.d.ts
import VLibras from '@vue-a11y/vlibras'

createApp(App).use(VLibras).mount('#app')
