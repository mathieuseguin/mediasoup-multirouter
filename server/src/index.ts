import express from 'express'
import dotenv from 'dotenv'
import Room from './room'

dotenv.config()

const rooms: Map<Number, Room> = new Map()

const app = express()
const port = process.env.PORT

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

app.listen(port, () => {
  console.log(`[server]: Server is running at https://localhost:${port}`)
})
