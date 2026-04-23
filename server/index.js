const express = require('express')
const cors = require('cors')
const { createServer } = require('node:http')
const { Server } = require('socket.io')
const { decryptPayload, encryptPayload } = require('./xorCipher')

const PORT = process.env.PORT || 4000
const HOST = process.env.HOST || '0.0.0.0'
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*'
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_MESSAGE_CHARS = 2000

const app = express()
const httpServer = createServer(app)

app.use(cors({ origin: CLIENT_ORIGIN }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    persistence: 'none',
  })
})

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: MAX_FILE_BYTES * 2,
})

function normalizeFile(file = {}) {
  if (!file || typeof file !== 'object') return null

  // Privacy by Design (art. 25): il server accetta solo i campi strettamente
  // necessari per inoltrare l'allegato in tempo reale e li riduce a una forma
  // minima e validata. Non conserva metadati extra, non persiste il file e
  // scarta input fuori soglia o incoerenti per limitare il trattamento.
  const name = String(file.name || '').trim().slice(0, 160)
  const type = String(file.type || 'application/octet-stream').trim().slice(0, 120)
  const size = Number(file.size)
  const dataUrl = String(file.dataUrl || '')
  const dataUrlMatch = dataUrl.match(/^data:([^;,]*)(;base64)?,/)

  if (!name || !Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
    return null
  }

  if (!dataUrlMatch || dataUrl.length > MAX_FILE_BYTES * 2) {
    return null
  }

  const dataUrlType = dataUrlMatch[1]
  const hasCompatibleType =
    !dataUrlType ||
    dataUrlType === type ||
    type === 'application/octet-stream'

  if (!hasCompatibleType) {
    return null
  }

  return {
    name,
    type,
    size,
    dataUrl,
  }
}

function normalizeMessage(message = '') {
  return String(message || '').trim().slice(0, MAX_MESSAGE_CHARS)
}

function systemMessage(message) {
  return {
    message,
    sent_at: new Date().toISOString(),
  }
}

function emitEncrypted(socket, eventName, payload) {
  socket.emit(eventName, encryptPayload(payload))
}

function broadcastEncrypted(socket, eventName, payload) {
  socket.broadcast.emit(eventName, encryptPayload(payload))
}

function emitToAllEncrypted(eventName, payload) {
  io.emit(eventName, encryptPayload(payload))
}

function announceLeave(socket) {
  const nickname = socket.data.user?.nickname

  if (!nickname || socket.data.left) return

  socket.data.left = true
  socket.broadcast.emit(
    'chat:system',
    encryptPayload(systemMessage(`${nickname} si e' scollegato dalla chat.`)),
  )
}

io.on('connection', (socket) => {
  socket.on('user:join', (payload = {}) => {
    let decryptedPayload

    try {
      decryptedPayload = decryptPayload(payload)
    } catch {
      emitEncrypted(socket, 'chat:error', {
        message: 'Payload cifrato non valido nel join.',
      })
      return
    }

    const pseudoId = socket.id
    // Minimizzazione del dato (art. 5, par. 1, lett. c): nel join il server
    // legge solo il nickname temporaneo strettamente necessario alla sessione.
    // Non richiede nome reale, email, indirizzo o altri identificativi; inoltre
    // genera internamente lo pseudo_id dal socket invece di fidarsi di un
    // valore inviato dal client.
    const nickname = String(decryptedPayload.nickname || '').trim().slice(0, 24)

    if (!nickname) {
      emitEncrypted(socket, 'chat:error', {
        message: 'Payload non valido: nickname e obbligatorio.',
      })
      return
    }

    if (socket.data.user && !socket.data.left) {
      return
    }

    socket.data.user = {
      pseudoId,
      nickname,
    }
    socket.data.left = false

    emitToAllEncrypted('chat:system', systemMessage(`${nickname} si e' connesso alla chat.`))
  })

  socket.on('user:leave', () => {
    announceLeave(socket)
  })

  socket.on('chat:message', (payload = {}) => {
    let decryptedPayload

    try {
      decryptedPayload = decryptPayload(payload)
    } catch {
      emitEncrypted(socket, 'chat:error', {
        message: 'Payload cifrato non valido nel messaggio.',
      })
      return
    }

    const user = socket.data.user
    const messaggio = normalizeMessage(decryptedPayload.messaggio)
    const file = normalizeFile(decryptedPayload.file)

    if (!user || (!messaggio && !file)) {
      emitEncrypted(socket, 'chat:error', {
        message: 'Payload non valido: entra in chat e invia un messaggio o file.',
      })
      return
    }

    // Privacy by Design (art. 25): il payload inoltrato agli altri client e'
    // ridotto ai soli campi necessari al funzionamento della chat. Il server
    // non propaga eventuali dati extra ricevuti, non accetta identita' arbitrarie
    // dal client e aggiunge solo i metadati minimi di sessione che controlla
    // direttamente (pseudo_id, nickname temporaneo e timestamp).
    broadcastEncrypted(socket, 'chat:message', {
      pseudo_id: user.pseudoId,
      nickname: user.nickname,
      messaggio,
      file,
      sent_at: new Date().toISOString(),
    })
  })

  socket.on('disconnect', () => {
    announceLeave(socket)
  })
})

httpServer.listen(PORT, HOST, () => {
  console.log(`Temporary chat server listening on http://${HOST}:${PORT}`)
  console.log('Persistence: none. Messages are only forwarded, never stored.')
})
