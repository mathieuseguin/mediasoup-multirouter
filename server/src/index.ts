
import child_process from 'child_process'
import config from './config'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'fs'
import https from 'https'
import Room from './room'

import { createWorker } from 'mediasoup'
import { Server as SocketIOServer, Socket } from 'socket.io'
import {
  Consumer,
  PipeTransport,
  Producer,
  Router,
  Transport,
} from 'mediasoup/node/lib/types'
import OpenCV from './opencv'

dotenv.config()

const rooms: Map<Number, Room> = new Map()

const app = express()

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

const io = new SocketIOServer(httpsServer, config.socketio.server)

const transportsRouter: Map<string, String> = new Map()
const producersTransport: Map<string, String> = new Map()
const inRouters: Map<string, Router> = new Map()
const outRouters: Map<string, Router> = new Map()
const inOutRouters: Map<string, string> = new Map()
const transports: Map<string, Transport> = new Map()
let inPipeTransport: PipeTransport
let outPipeTransport: PipeTransport
let opencv_process: child_process.ChildProcessWithoutNullStreams

const createRouters = async () => {
  const { mediaCodecs } = config.mediasoup.router

  const inWorker = await createWorker(config.mediasoup.worker)
  const inRouter = await inWorker.createRouter({ mediaCodecs })
  inRouters.set(inRouter.id, inRouter)

  const outWorker = await createWorker(config.mediasoup.worker)
  const outRouter = await outWorker.createRouter({ mediaCodecs })
  outRouters.set(outRouter.id, outRouter)
  inOutRouters.set(inRouter.id, outRouter.id)

  inPipeTransport = await inRouter.createPipeTransport({
    listenIp: '127.0.0.1',
  })

  outPipeTransport = await outRouter.createPipeTransport({
    listenIp: '127.0.0.1',
  })

  await outPipeTransport.connect({
    ip: inPipeTransport.tuple.localIp,
    port: inPipeTransport.tuple.localPort,
  })

  await inPipeTransport.connect({
    ip: outPipeTransport.tuple.localIp,
    port: outPipeTransport.tuple.localPort,
  })

  return inRouter
}

const getProducerOutRouter = (producerId: string) => {
  console.log('getProducerOutRouter', producerId)
  const tId = (producersTransport.get(producerId) || '') as string
  console.log('tId', tId)
  const inRouterId = (transportsRouter.get(tId) || '') as string
  const outRouterId = (inOutRouters.get(inRouterId) || '') as string
  const router = outRouters.get(outRouterId)
  console.log('router', router)
  if (!router) throw 'Could not find router'
  return router
}

io.on('connection', (socket: Socket) => {
  socket.on('disconnect', () => { })

  socket.on(
    'getRouterRtpCapabilities',
    async ({ producerId }: { producerId?: string }, callback) => {
      let router

      try {
        if (producerId) {
          router = getProducerOutRouter(producerId)
        } else {
          router = await createRouters()
        }

        callback({
          status: 'success',
          routerId: router.id,
          routerRtpCapabilities: router.rtpCapabilities,
        })
      } catch (e) {
        console.log(e)
        callback({ status: 'failure' })
      }
    },
  )

  socket.on(
    'createWebRtcTransport',
    async (
      { routerId, type }: { routerId: string; type: 'producer' | 'consumer' },
      callback,
    ) => {
      try {
        const router =
          type == 'producer'
            ? inRouters.get(routerId)
            : outRouters.get(routerId)

        if (!router) throw 'Could not find router'

        // Create WebRtcTransport
        const rtcTrans = config.mediasoup.webRtcTransport
        const transport = await router.createWebRtcTransport(rtcTrans)
        await transport.setMaxIncomingBitrate(rtcTrans.maxIncomingBitrate)
        transportsRouter.set(transport.id, router.id)

        transport.on('dtlsstatechange', (dtlsState) => {
          // RTCPeerConnection is probably closed
          if (dtlsState === 'closed') {
            transport.close()
          }
        })

        transport.on('routerclose', () => {
          transport.close()
          if (opencv_process) opencv_process.kill('SIGINT')
        })

        const transportParams = {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
          sctpParameters: transport.sctpParameters,
        }

        transports.set(transport.id, transport)

        const response: any = {
          status: 'success',
          transportParams: transportParams,
          rtpTransportId: undefined,
        }

        if (type == 'producer') {
          // Create PlainRtpTransport
          const rtpTrans = config.mediasoup.plainRtpTransport
          const rtpTransport = await router.createPlainRtpTransport(rtpTrans)
          // Connect the mediasoup RTP transport to the ports used by GStreamer
          await rtpTransport.connect({
            ip: '127.0.0.1',
            port: 20000,
            rtcpPort: 20001,
          })

          transports.set(rtpTransport.id, rtpTransport)

          response['rtpTransportId'] = rtpTransport.id
        }

        callback(response)
      } catch (e) {
        console.log(e)
        callback({ status: 'failure' })
      }
    },
  )

  socket.on(
    'produce',
    async ({ transportId, rtpTransportId, kind, rtpParameters }, callback) => {
      try {
        const transport = transports.get(transportId)
        const rtpTransport = transports.get(rtpTransportId)

        if (!transport)
          throw new Error(`Transport with id "${transportId}" not found.`)

        if (!rtpTransport)
          throw new Error(`rtpTransport with id "${rtpTransportId}" not found.`)

        const producer = await transport.produce({ kind, rtpParameters })
        const inPipe = await inPipeTransport.consume({
          producerId: producer.id,
        })
        const outPipe = await outPipeTransport.produce({
          id: inPipe.id,
          kind: 'video',
          rtpParameters: inPipe.rtpParameters,
        })
        producersTransport.set(outPipe.id, transport.id)

        // Start the consumer paused
        // Once the gstreamer process is ready to consume resume and send a keyframe

        const codec = config.mediasoup.router.mediaCodecs[1]
        const rtpConsumer = await rtpTransport.consume({
          producerId: producer.id,
          rtpCapabilities: {
            codecs: [codec],
            headerExtensions: [],
          },
          paused: true,
        })

        console.log('starting opencv')
        const opencv = new OpenCV({})
        console.log('opencv started')

        callback({ status: 'success', id: outPipe.id })
      } catch (e) {
        console.log(e)
        callback({ status: 'failure' })
      }
    },
  )

  socket.on(
    'connectWebRtcTransport',
    async ({ transportId, dtlsParameters }, callback) => {
      try {
        const transport = transports.get(transportId)

        if (!transport)
          throw new Error(`Transport with id "${transportId}" not found.`)

        await transport.connect({ dtlsParameters })

        callback({ status: 'success' })
      } catch (e) {
        callback({ status: 'failure' })
      }
    },
  )

  socket.on(
    'addConsumer',
    async ({ transportId, producerId, routerRtpCapabilities }, callback) => {
      try {
        const transport = transports.get(transportId)

        if (!transport)
          throw new Error(`Transport with id "${transportId}" not found.`)

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities: routerRtpCapabilities,
          paused: true,
        })

        callback({
          Status: 'success',
          consumer: {
            id: consumer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            producerId,
          },
        })

        await consumer.resume()
      } catch (e) {
        console.log(e)
        callback({ status: 'failure' })
      }
    },
  )
})

const { listenIp, listenPort } = config
httpsServer.listen(listenPort, listenIp, () => {
  console.log(
    `[server]: Server is running at https://${listenIp}:${listenPort}`,
  )
})
