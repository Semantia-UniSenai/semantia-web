import { createApp } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import './style.css'
import App from './App.vue'
import router from './router'
// @ts-expect-error — pacote sem tipos; componente global tipado em shims.d.ts
import VLibras from '@vue-a11y/vlibras'

createApp(App).use(VLibras).use(router).use(VueQueryPlugin).mount('#app')
