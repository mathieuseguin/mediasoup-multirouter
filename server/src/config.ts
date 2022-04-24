import { cpus } from 'os'
import { ServerOptions } from 'socket.io'
import { RtpCodecCapability } from 'mediasoup/node/lib/RtpParameters'
import { TransportListenIp } from 'mediasoup/node/lib/Transport'
import { WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/Worker'

const config = {
  listenIp: process.env.LISTEN_IP || '127.0.0.1',
  listenPort: Number(process.env.PORT || 4000),
  socketio: {
    server: {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    } as ServerOptions,
  },
  mediasoup: {
    workersCount: Object.keys(cpus()).length,
    worker: {
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
      logLevel: 'debug' as WorkerLogLevel,
      logTags: ['info', 'ice', 'dtls', 'rtp', 'sctp', 'rtcp'] as WorkerLogTag[],
    },
    router: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000,
          },
        },
      ] as RtpCodecCapability[],
    },
    webRtcTransport: {
      listenIps: [{ ip: '127.0.0.1' }] as TransportListenIp[],
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxIncomingBitrate: 1500000,
      maxSctpMessageSize: 262144,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      enableSctp: true,
    },
    plainRtpTransport: {
      listenIp: { ip: '127.0.0.1' },
      rtcpMux: false, // False for GStreamer
      comedia: false,
    },
  },
}

export default config
