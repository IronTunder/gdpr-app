const XOR_KEY = import.meta.env.VITE_XOR_KEY || 'gdpr-xor-demo-key'

function xorBytes(bytes, key) {
  const keyBytes = new TextEncoder().encode(key)

  return bytes.map((byte, index) => byte ^ keyBytes[index % keyBytes.length])
}

function bytesToBase64(bytes) {
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return window.btoa(binary)
}

function base64ToBytes(value) {
  const binary = window.atob(value)

  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export function encryptPayload(payload) {
  const serialized = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(serialized)

  return {
    cipher: bytesToBase64(xorBytes(bytes, XOR_KEY)),
  }
}

export function decryptPayload(envelope = {}) {
  if (!envelope || typeof envelope.cipher !== 'string' || !envelope.cipher) {
    throw new Error('Payload cifrato non valido.')
  }

  const decryptedBytes = xorBytes(base64ToBytes(envelope.cipher), XOR_KEY)
  const serialized = new TextDecoder().decode(decryptedBytes)

  return JSON.parse(serialized)
}
