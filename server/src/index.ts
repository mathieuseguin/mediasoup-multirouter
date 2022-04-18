import dotenv from 'dotenv'
import express from 'express'
import fs from 'fs'
import https from 'https'

import Room from './room'

dotenv.config()

const rooms: Map<Number, Room> = new Map()

const app = express()
const port = Number(process.env.PORT || 3000)
const listenIp = process.env.LISTEN_IP || '0.0.0.0'

/**
 * For every API request, verify that the room exists.
 */
app.param('roomId', (req, res, next, roomId) => {
  if (!rooms.has(roomId)) throw new Error(`room with id "${roomId}" not found`)
  res.locals.room = rooms.get(roomId)
  next()
})

app.get('/', (req, res) => {
  res.send('Express + TypeScript Server')
})

const tls = {
  cert: fs.readFileSync(process.env.CERT as string),
  key: fs.readFileSync(process.env.KEY as string),
}

const httpsServer = https.createServer(tls, app)

httpsServer.listen(port, listenIp, () => {
  console.log(`[server]: Server is running at https://${listenIp}:${port}`)
})
