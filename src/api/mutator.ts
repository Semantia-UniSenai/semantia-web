import axios, { type AxiosRequestConfig, type AxiosError } from 'axios'
import { getToken } from '../stores/auth'

// Instância base do axios — usada pelo client gerado pelo orval (custom instance).
// As URLs geradas pelo orval já incluem o prefixo `/api`, então o baseURL é só a origin.
const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const http = axios.create({ baseURL })

// Injeta o Bearer token em toda request.
http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * Mutator do orval. O client gerado chama `customInstance<T>(config)` e espera
 * uma Promise<T> com o body já desembrulhado.
 */
export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  return http({ ...config }).then(({ data }) => data as T)
}

export type ErrorType<Error> = AxiosError<Error>
export type BodyType<BodyData> = BodyData

export default customInstance
