import config from '../config'
import { io, Socket } from 'socket.io-client'

export interface EnhancedSocket extends Socket {
  asyncEmit: (eventName: string, data?: {}, timeout?: number) => Promise<any>
}

export const initSocket = ({
  host = config.socketio.host,
  port = config.socketio.port,
  options = {
    secure: true,
    reconnect: true,
  },
}: {
  host?: string
  port?: number
  options?: any
} = {}): EnhancedSocket => {

  let socket = io(`${host}:${port}`, options) as EnhancedSocket

  socket.onAny((eventName) => {

  })

  socket.on('disconnecting', () => {

  })

  socket.asyncEmit = (eventName: string, data = {}, timeout = 1000) => {
    return new Promise((resolve, reject) => {

      socket.emit(eventName, data, (result: any) => {

        resolve(result)
      })
      setTimeout(() => reject(`Request timed out: ${eventName}.`), timeout)
    })
  }

  return socket
}
