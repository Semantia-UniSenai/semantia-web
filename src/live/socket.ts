import { io, type Socket } from 'socket.io-client'
import { getToken } from '../stores/auth'

const configuredApiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'
const socketUrl = import.meta.env.VITE_SOCKET_URL ?? configuredApiUrl.replace(/\/api\/?$/, '')

export type LiveSocket = Socket

export function createLiveSocket(accessToken?: string | null): LiveSocket {
  const token = accessToken ?? getToken()
  return io(`${socketUrl}/live`, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 750,
    reconnectionDelayMax: 5_000,
    auth: { token },
  })
}
