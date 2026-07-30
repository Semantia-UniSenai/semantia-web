import { createRouter, createWebHistory } from 'vue-router'
import { readGuestAccess } from '../live/guestAccess'
import { useAuth } from '../stores/auth'
import LandingView from '../views/LandingView.vue'
import LoginView from '../views/LoginView.vue'
import SignupView from '../views/SignupView.vue'
import AppHomeView from '../views/AppHomeView.vue'
import RoomsView from '../views/RoomsView.vue'
import SessionInviteView from '../views/SessionInviteView.vue'
import LiveRoomView from '../views/LiveRoomView.vue'


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: LandingView },
    { path: '/entrar', component: LoginView, meta: { guestOnly: true } },
    { path: '/criar-conta', component: SignupView, meta: { guestOnly: true } },
    { path: '/convite/reuniao/:token', component: SessionInviteView },
    { path: '/sala/:sessionId', component: LiveRoomView, meta: { liveAccess: true } },
    { path: '/app', component: AppHomeView, meta: { requiresAuth: true } },
    { path: '/app/salas', component: RoomsView, meta: { requiresAuth: true } },


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

export default router
