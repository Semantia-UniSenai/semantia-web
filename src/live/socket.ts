import { io, type Socket } from 'socket.io-client'
import { getToken } from '../stores/auth'
import type { ClientToServerEvents, ServerToClientEvents } from './types'

export type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Mesma origin da API REST (o namespace vai no path da conexão).
const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * Abre uma conexão autenticada com o namespace `/live`.
 * O JWT vai no handshake (`auth.token`) — inclusive nas reconexões,
 * por isso `auth` é uma função (relê o token a cada tentativa).
 */
export function createLiveSocket(): LiveSocket {
  return io(`${baseURL}/live`, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: getToken() }),
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  })
}
