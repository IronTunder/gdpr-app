import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'
import { decryptPayload, encryptPayload } from './xorCipher'

const SERVER_URL =
  import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:4000`
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_MESSAGES = 200
const DEFAULT_TITLE = 'Chat Temporanea'
const URL_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
const TRAILING_URL_PUNCTUATION = /[.,!?;:]+$/

function appendLimitedMessage(current, nextMessage) {
  return [...current, nextMessage].slice(-MAX_MESSAGES)
}

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function splitMessageText(text = '') {
  const parts = []
  let lastIndex = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0]
    const startIndex = match.index

    if (startIndex > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, startIndex),
        type: 'text',
      })
    }

    const linkText = rawUrl.replace(TRAILING_URL_PUNCTUATION, '')
    const trailingText = rawUrl.slice(linkText.length)
    const href = linkText.startsWith('www.') ? `https://${linkText}` : linkText

    parts.push({
      href,
      text: linkText,
      type: 'link',
    })

    if (trailingText) {
      parts.push({
        text: trailingText,
        type: 'text',
      })
    }

    lastIndex = startIndex + rawUrl.length
  }

  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      type: 'text',
    })
  }

  return parts.length > 0 ? parts : [{ text, type: 'text' }]
}

function MessageText({ text }) {
  return splitMessageText(text).map((part, index) => {
    if (part.type === 'link') {
      return (
        <a
          href={part.href}
          key={`${part.href}-${index}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {part.text}
        </a>
      )
    }

    return <span key={`${part.text}-${index}`}>{part.text}</span>
  })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener('load', () => resolve(reader.result))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

function updateFaviconBadge(count, fallbackHref) {
  const favicon = document.querySelector('link[rel="icon"]')

  if (!favicon) return

  if (count <= 0) {
    favicon.href = fallbackHref
    return
  }

  const canvas = document.createElement('canvas')
  const size = 64
  const ctx = canvas.getContext('2d')

  canvas.width = size
  canvas.height = size

  ctx.fillStyle = '#0f766e'
  ctx.beginPath()
  ctx.roundRect(8, 8, 48, 48, 12)
  ctx.fill()

  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(46, 18, 16, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(count > 9 ? '9+' : String(count), 46, 18)

  favicon.href = canvas.toDataURL('image/png')
}

function App() {
  const [nickname, setNickname] = useState('')
  const [draftName, setDraftName] = useState('')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [status, setStatus] = useState('disconnected')
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false)
  const fileInputRef = useRef(null)
  const messagesRef = useRef(null)
  const originalFaviconRef = useRef(null)
  const privacyPopupRef = useRef(null)
  const socketRef = useRef(null)

  function emitEncrypted(eventName, payload = {}) {
    socketRef.current?.emit(eventName, encryptPayload(payload))
  }

  useEffect(() => {
    document.title = DEFAULT_TITLE
    originalFaviconRef.current =
      document.querySelector('link[rel="icon"]')?.href || '/favicon.svg'

    const socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => setStatus('connected'))
    socket.on('disconnect', () => setStatus('disconnected'))
    socket.on('chat:message', (payload) => {
      try {
        const decryptedPayload = decryptPayload(payload)

        setMessages((current) => appendLimitedMessage(current, decryptedPayload))

        if (document.hidden) {
          setUnreadCount((current) => current + 1)
        }
      } catch {
        setMessages((current) =>
          appendLimitedMessage(current, {
            pseudo_id: 'SYSTEM',
            nickname: 'Sistema',
            messaggio: 'Messaggio ricevuto ma non decifrabile.',
            sent_at: new Date().toISOString(),
            system: true,
          }),
        )
      }
    })
    socket.on('chat:error', (payload) => {
      try {
        const decryptedPayload = decryptPayload(payload)

        setMessages((current) =>
          appendLimitedMessage(current, {
            pseudo_id: 'SYSTEM',
            nickname: 'Server',
            messaggio: decryptedPayload.message,
            sent_at: new Date().toISOString(),
            system: true,
          }),
        )
      } catch {
        setMessages((current) =>
          appendLimitedMessage(current, {
            pseudo_id: 'SYSTEM',
            nickname: 'Server',
            messaggio: 'Errore di comunicazione cifrata con il server.',
            sent_at: new Date().toISOString(),
            system: true,
          }),
        )
      }
    })
    socket.on('chat:system', (payload) => {
      try {
        const decryptedPayload = decryptPayload(payload)

        setMessages((current) =>
          appendLimitedMessage(current, {
            pseudo_id: 'SYSTEM',
            nickname: 'Sistema',
            messaggio: decryptedPayload.message,
            sent_at: decryptedPayload.sent_at,
            system: true,
          }),
        )
      } catch {
        setMessages((current) =>
          appendLimitedMessage(current, {
            pseudo_id: 'SYSTEM',
            nickname: 'Sistema',
            messaggio: 'Evento di sistema non decifrabile.',
            sent_at: new Date().toISOString(),
            system: true,
          }),
        )
      }
    })

    return () => {
      socket.disconnect()
      document.title = DEFAULT_TITLE
      updateFaviconBadge(0, originalFaviconRef.current)
    }
  }, [])

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  useEffect(() => {
    document.title =
      unreadCount > 0 ? `(${unreadCount}) ${DEFAULT_TITLE}` : DEFAULT_TITLE
    updateFaviconBadge(unreadCount, originalFaviconRef.current || '/favicon.svg')
  }, [unreadCount])

  useEffect(() => {
    function clearUnreadCount() {
      if (!document.hidden) {
        setUnreadCount(0)
      }
    }

    document.addEventListener('visibilitychange', clearUnreadCount)
    window.addEventListener('focus', clearUnreadCount)

    return () => {
      document.removeEventListener('visibilitychange', clearUnreadCount)
      window.removeEventListener('focus', clearUnreadCount)
    }
  }, [])

  useEffect(() => {
    if (!showPrivacyInfo) return

    function handlePointerDown(event) {
      if (!privacyPopupRef.current?.contains(event.target)) {
        setShowPrivacyInfo(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setShowPrivacyInfo(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showPrivacyInfo])

  useEffect(() => {
    if (nickname && socketRef.current && !socketRef.current.connected) {
      socketRef.current.connect()
    }
  }, [nickname])

  useEffect(() => {
    const socket = socketRef.current

    if (!nickname || !socket) return

    function announceJoin() {
      emitEncrypted('user:join', {
        nickname,
      })
    }

    if (socket.connected) {
      announceJoin()
      return
    }

    socket.once('connect', announceJoin)

    return () => {
      socket.off('connect', announceJoin)
    }
  }, [nickname])

  function joinChat(event) {
    event.preventDefault()
    const cleanName = draftName.trim()

    if (!cleanName) return

    setNickname(cleanName)
  }

  function selectFile(event) {
    const file = event.target.files?.[0]

    setFileError('')

    if (!file) {
      setSelectedFile(null)
      return
    }

    if (file.size > MAX_FILE_BYTES) {
      setSelectedFile(null)
      setFileError(`Il file supera il limite di ${formatFileSize(MAX_FILE_BYTES)}.`)
      event.target.value = ''
      return
    }

    setSelectedFile(file)
  }

  function clearSelectedFile() {
    setSelectedFile(null)
    setFileError('')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function leaveChat() {
    if (socketRef.current?.connected) {
      // Minimizzazione del dato (art. 5, par. 1, lett. c): nell'evento di uscita
      // non inviamo identita o metadati aggiuntivi, perche' il server conosce
      // gia' il socket autenticato nella sessione corrente e puo' gestire il
      // distacco senza ricevere un nickname dal client.
      emitEncrypted('user:leave', {})
    }

    socketRef.current?.disconnect()
    setNickname('')
    setMessages([])
    setMessage('')
    setUnreadCount(0)
    setIsSending(false)
    clearSelectedFile()
  }

  async function sendMessage(event) {
    event.preventDefault()
    const cleanMessage = message.trim()

    if ((!cleanMessage && !selectedFile) || !socketRef.current?.connected) return

    setIsSending(true)
    setFileError('')

    try {
      const filePayload = selectedFile
        ? {
            name: selectedFile.name,
            type: selectedFile.type || 'application/octet-stream',
            size: selectedFile.size,
            dataUrl: await fileToDataUrl(selectedFile),
          }
        : null

      // Privacy by Design / minimizzazione: il client invia nel payload del
      // messaggio solo cio' che serve davvero alla chat in tempo reale
      // (testo e allegato eventuale). Identita', pseudo_id e timestamp non
      // vengono accettati dal client come campi liberi: sono gestiti o derivati
      // dal server per ridurre i dati trasmessi e impedire spoofing.
      const payload = {
        messaggio: cleanMessage,
        file: filePayload,
      }

      emitEncrypted('chat:message', payload)
      setMessages((current) =>
        appendLimitedMessage(current, {
          ...payload,
          nickname,
          sent_at: new Date().toISOString(),
          mine: true,
        }),
      )
      setMessage('')
      clearSelectedFile()
    } catch {
      setFileError('Non riesco a leggere il file selezionato.')
    } finally {
      setIsSending(false)
    }
  }

  if (!nickname) {
    return (
      <main className="shell intro-shell">
        <section className="intro">
          <p className="eyebrow">Chat Temporanea</p>
          <h1>No account, zero persistenza.</h1>
          <p className="intro-copy">
            Scegli un nickname temporaneo: il server inoltra i messaggi in tempo
            reale, cifra i dati in transito con XOR e non conserva cronologie.
          </p>

          <form className="join-form" onSubmit={joinChat}>
            <label htmlFor="nickname">Nickname temporaneo</label>
            <div className="join-row">
              <input
                id="nickname"
                maxLength="24"
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Es. Matteo"
                value={draftName}
              />
              <button type="submit">Entra</button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="shell chat-shell">
      <header className="chat-header">
        <div className="chat-heading">
          <div className="heading-meta">
            <p className="eyebrow">Sessione effimera</p>
            <span className={`status ${status}`}>{status}</span>
          </div>
          <div className="heading-row">
            <h1>Chat Temporanea</h1>
            <button
              className="disconnect-button"
              onClick={leaveChat}
              type="button"
            >
              Esci
            </button>
          </div>
        </div>
        <div className="identity">
          <div className="identity-row">
            <strong>{nickname}</strong>
            <div className="privacy-popup-wrap" ref={privacyPopupRef}>
              <button
                aria-controls="privacy-info-popup"
                aria-expanded={showPrivacyInfo}
                aria-label="Informazioni privacy"
                className="info-icon-button"
                onClick={() => setShowPrivacyInfo((current) => !current)}
                type="button"
              >
                i
              </button>
              {showPrivacyInfo ? (
                <>
                  <button
                    aria-label="Chiudi informazioni privacy"
                    className="privacy-popup-backdrop"
                    onClick={() => setShowPrivacyInfo(false)}
                    type="button"
                  />
                  <section
                    aria-label="Garanzie privacy"
                    className="privacy-popup"
                    id="privacy-info-popup"
                  >
                    <h2>Privacy</h2>
                    <span>Cifratura XOR in transito</span>
                    <span>Nessun account</span>
                    <span>Nessun database</span>
                    <span>Nessuna cronologia server</span>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <section className="messages" aria-live="polite" ref={messagesRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Nessun messaggio in questa sessione.</h2>
            <p>Apri una seconda scheda per provare la chat in tempo reale.</p>
          </div>
        ) : (
          messages.map((item, index) => (
            <article
              className={`message ${item.mine ? 'mine' : ''} ${
                item.system ? 'system' : ''
              }`}
              key={`${item.nickname || item.pseudo_id}-${item.sent_at}-${index}`}
            >
              <div className="message-meta">
                <strong>{item.nickname || item.pseudo_id}</strong>
              </div>
              {item.messaggio ? (
                <p>
                  {item.system ? item.messaggio : <MessageText text={item.messaggio} />}
                </p>
              ) : null}
              {item.file ? (
                <div className="attachment">
                  {item.file.type?.startsWith('image/') ? (
                    <a
                      className="attachment-preview"
                      download={item.file.name}
                      href={item.file.dataUrl}
                      title={`Scarica ${item.file.name}`}
                    >
                      <img alt={item.file.name} src={item.file.dataUrl} />
                    </a>
                  ) : null}
                  <a className="attachment-link" download={item.file.name} href={item.file.dataUrl}>
                    <span>{item.file.name}</span>
                    <small>{formatFileSize(item.file.size)}</small>
                  </a>
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>

      <form className="composer" onSubmit={sendMessage}>
        <div className="composer-row">
          <button
            aria-label="Allega file"
            className="attach-button"
            disabled={status !== 'connected' || isSending}
            onClick={() => fileInputRef.current?.click()}
            title="Allega file"
            type="button"
          >
            +
          </button>
          <input
            className="file-input"
            disabled={status !== 'connected' || isSending}
            onChange={selectFile}
            ref={fileInputRef}
            type="file"
          />
          <input
            aria-label="Messaggio"
            disabled={status !== 'connected' || isSending}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Scrivi un messaggio..."
            value={message}
          />
          <button
            disabled={
              status !== 'connected' ||
              isSending ||
              (!message.trim() && !selectedFile)
            }
            type="submit"
          >
            {isSending ? 'Invio...' : 'Invia'}
          </button>
        </div>
        {selectedFile ? (
          <div className="selected-file">
            <span>
              {selectedFile.name} - {formatFileSize(selectedFile.size)}
            </span>
            <button onClick={clearSelectedFile} type="button">
              Rimuovi
            </button>
          </div>
        ) : null}
        {fileError ? <p className="file-error">{fileError}</p> : null}
      </form>
    </main>
  )
}

export default App
