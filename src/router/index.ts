import { createRouter, createWebHistory } from 'vue-router'
import { readGuestAccess } from '../live/guestAccess'
import { useAuth } from '../stores/auth'
import LandingView from '../views/LandingView.vue'
import LoginView from '../views/LoginView.vue'
import SignupView from '../views/SignupView.vue'
import AppHomeView from '../views/AppHomeView.vue'
import RoomsView from '../views/RoomsView.vue'
import SessionInviteView from '../views/SessionInviteView.vue'


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: LandingView, meta: { title: 'Semantia — Inclusão é o padrão' } },
    { path: '/entrar', component: LoginView, meta: { guestOnly: true, title: 'Entrar' } },
    { path: '/criar-conta', component: SignupView, meta: { guestOnly: true, title: 'Criar conta' } },
    { path: '/convite/reuniao/:token', component: SessionInviteView, meta: { title: 'Convite para reunião' } },
    {
      path: '/sala/:sessionId',
      component: () => import('../views/LiveRoomView.vue'),
      meta: { liveAccess: true, title: 'Sala ao vivo' },
    },
    { path: '/app', component: AppHomeView, meta: { requiresAuth: true, title: 'Início' } },
    { path: '/app/salas', component: RoomsView, meta: { requiresAuth: true, title: 'Minhas reuniões' } },


    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const { isAuthenticated } = useAuth()
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return { path: '/entrar', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && isAuthenticated.value) return '/app'
  if (to.meta.liveAccess && !isAuthenticated.value) {
    const sessionId = String(to.params.sessionId ?? '')
    if (!readGuestAccess(sessionId)) return '/'
  }
  return true
})

// WCAG 2.4.2: cada rota tem um título próprio.
router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? 'Semantia'
  document.title = title.startsWith('Semantia') ? title : `${title} — Semantia`
})

export default router
