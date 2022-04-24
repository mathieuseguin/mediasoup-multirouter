import { useCallback, useEffect, useState } from 'react'
import { initSocket, EnhancedSocket } from './lib/Socket'
import { Device } from 'mediasoup-client'

import './App.css'
import { Transport } from 'mediasoup-client/lib/Transport'

const App = () => {
  const [socket, setSocket] = useState<EnhancedSocket>()
  const [producerId, setProducerId] = useState<String>('')

  useEffect(() => {
    const socket: EnhancedSocket = initSocket()
    setSocket(socket)
  }, [])

  const create = useCallback(async () => {
    if (!socket) return

    const res = await socket.asyncEmit('getRouterRtpCapabilities')
    console.log(res)
    const { routerId, routerRtpCapabilities } = res
    const device = new Device()
    await device.load({ routerRtpCapabilities })
    const transport = await createProducerTransport(device, routerId)

    if (!device.canProduce('video')) console.warn('cannot produce video')

    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    const track = stream.getVideoTracks()[0]
    track.enabled = true

    await transport?.produce({ track })
  }, [socket])

  const createProducerTransport = useCallback(
    async (device: Device, routerId: string) => {
      if (!socket) return
      const { transportParams, rtpTransportId } = await socket.asyncEmit(
        'createWebRtcTransport',
        { routerId, type: 'producer' },
      )

      console.log('transportParams', transportParams)

      const transport = device.createSendTransport(transportParams)

      transport.observer.on('close', () => transport.close())

      transport.on('connectionstatechange', (state: string) => {
        if (state === 'failed') transport.close()
      })

      transport.on(
        'connect',
        async ({ dtlsParameters }, callback: any, errback: any) => {
          try {
            const response = await socket.asyncEmit('connectWebRtcTransport', {
              transportId: transport.id,
              dtlsParameters,
            })

            if (response.status !== 'success')
              throw new Error('Transport failed to connect.')

            callback()
          } catch (error) {
            errback(error)
          }
        },
      )

      transport.on(
        'produce',
        ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            socket.emit(
              'produce',
              {
                transportId: transport.id,
                rtpTransportId,
                kind,
                rtpParameters,
                appData,
              },
              ({
                id,
                status,
              }: {
                id: string
                status: 'success' | 'failure'
              }) => {
                setProducerId(id)
                if (status !== 'success') throw new Error('Could not produce')
                callback({ id })
              },
            )
          } catch (error) {
            errback(error)
          }
        },
      )

      return transport
    },
    [setProducerId, socket],
  )

  const createConsumerTransport = useCallback(
    async (device: Device, routerId: string) => {
      if (!socket) return
      const { transportParams } = await socket.asyncEmit(
        'createWebRtcTransport',
        { routerId, type: 'consumer' },
      )

      const transport = device.createRecvTransport(transportParams)

      transport.observer.on('close', () => transport.close())

      transport.on('connectionstatechange', (state: string) => {
        if (state === 'failed') transport.close()
      })

      transport.on(
        'connect',
        async ({ dtlsParameters }, callback: any, errback: any) => {
          try {
            const response = await socket.asyncEmit('connectWebRtcTransport', {
              transportId: transport.id,
              dtlsParameters,
            })

            if (response.status !== 'success')
              throw new Error('Transport failed to connect.')

            callback()
          } catch (error) {
            errback(error)
          }
        },
      )

      return transport
    },
    [setProducerId, socket],
  )

  const display = useCallback(async () => {
    if (!socket) return

    const urlParams = new URLSearchParams(window.location.search)
    const pId = urlParams.get('producerId')

    const res = await socket.asyncEmit('getRouterRtpCapabilities', {
      producerId,
    })
    console.log('display routerRtpCapabilities', res)
    const { routerId, routerRtpCapabilities } = res
    const device = new Device()
    await device.load({ routerRtpCapabilities })

    const transport = await createConsumerTransport(device, routerId)
    if (!transport) {
      return
    }

    socket.emit(
      'addConsumer',
      {
        transportId: transport.id,
        producerId,
        routerRtpCapabilities,
      },
      async (response: any) => {
        console.log(response)
        if (response.Status !== 'success') return

        const { kind } = response.consumer
        const consumer = await transport.consume(response.consumer)

        const stream: MediaStream = await new MediaStream([consumer.track])

        // const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        // const track = stream.getVideoTracks()[0]
        // track.enabled = true

        const mediaStreamTrack =
          kind === 'video'
            ? stream.getVideoTracks()[0]
            : stream.getAudioTracks()[0]

        mediaStreamTrack.enabled = true

        const containerEl = document.getElementsByClassName('App')[0]

        const mstream = new MediaStream()
        mstream.addTrack(mediaStreamTrack)
        const vidEl = document.createElement(kind)
        vidEl.id = 'video'
        vidEl.srcObject = mstream
        // vidEl.srcObject = stream
        vidEl.autoplay = true
        console.log(containerEl, vidEl)
        containerEl.appendChild(vidEl)
      },
    )
  }, [producerId, socket])

  return (
    <div className="App">
      <button onClick={() => create()}>Create</button>
      <button onClick={() => display()}>Show</button>
    </div>
  )
}

export default App
