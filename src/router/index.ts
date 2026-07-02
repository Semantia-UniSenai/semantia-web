import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from '../stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    component: () => import('../views/LandingView.vue'),
  },
  {
    path: '/entrar',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/criar-conta',
    name: 'signup',
    component: () => import('../views/SignupView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/app',
    name: 'app-home',
    component: () => import('../views/AppHomeView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/app/turmas',
    name: 'classes',
    component: () => import('../views/ClassesView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/app/turmas/:id',
    name: 'class-detail',
    component: () => import('../views/ClassDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/app/aula/:id',
    name: 'live-room',
    component: () => import('../views/LiveRoomView.vue'),
    meta: { requiresAuth: true },
  },
  {
    // Link compartilhável de convite para uma aula (token no path).
    path: '/aula/convite/:token',
    name: 'session-invite',
    component: () => import('../views/SessionInviteView.vue'),
    meta: { requiresAuth: true },
  },
  {
    // Link compartilhável de convite para uma turma (código no path).
    path: '/turma/convite/:code',
    name: 'class-invite',
    component: () => import('../views/ClassInviteView.vue'),
    meta: { requiresAuth: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, saved) {
    return saved ?? { top: 0 }
  },
})

// Guarda de navegação: trava rotas autenticadas e desvia quem já está logado das telas guest.
router.beforeEach((to) => {
  const { isAuthenticated } = useAuth()
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && isAuthenticated.value) {
    return { name: 'app-home' }
  }
  return true
})

export default router
