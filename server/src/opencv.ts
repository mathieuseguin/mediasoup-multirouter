import child_process from 'child_process'
import path from 'path'


class OpenCV {
  _rtpParameters: any
  _process?: child_process.ChildProcessWithoutNullStreams

  constructor(rtpParameters: any) {
    this._rtpParameters = rtpParameters
    this._process = undefined
    this._createProcess()
  }

  _createProcess() {
    const app = path.join(__dirname, '..', 'opencv', 'app.py')

    this._process = child_process.spawn(`python ${app}`, ['udpsrc port=5000 caps="application/x-rtp, media=(string)video, clock-rate=(int)90000, encoding-name=(string)H264, payload=(int)96" ! rtph264depay ! h264parse ! decodebin ! videoconvert ! appsink sync=false'], {
      detached: false,
      shell: true,
    })

    if (this._process!.stderr) this._process!.stderr.setEncoding('utf-8')
    if (this._process!.stdout) this._process!.stdout.setEncoding('utf-8')

    this._process!.on('message', (message: any) =>
      console.log(
        'opencv::process::message [pid:%d, message:%o]',
        this._process!.pid,
        message,
      ),
    )

    this._process!.on('error', (error: any) =>
      console.error(
        'opencv::process::error [pid:%d, error:%o]',
        this._process!.pid,
        error,
      ),
    )

    this._process!.once('close', () => {
      console.log('opencv::process::close [pid:%d]', this._process!.pid)
    })

    this._process!.stderr.on('data', (data: any) => {
      console.log(typeof (data), data)
      console.log('opencv::process::stderr::data [data:%o]', data)
    })

    this._process!.stdout.on('data', (data: any) => {
      console.log(typeof (data), data)
      console.log('opencv::process::stdout::data [data:%o]', data)
    })
  }

  kill() {
    console.log('kill() [pid:%d]', this._process!.pid)
    this._process!.kill('SIGINT')
  }
}

export default OpenCV
