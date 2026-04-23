const XOR_KEY = process.env.XOR_KEY || 'gdpr-xor-demo-key'

function xorBuffer(buffer, key) {
  const keyBuffer = Buffer.from(key, 'utf8')
  const output = Buffer.alloc(buffer.length)

  for (let index = 0; index < buffer.length; index += 1) {
    output[index] = buffer[index] ^ keyBuffer[index % keyBuffer.length]
  }

  return output
}

function encryptPayload(payload) {
  const serialized = JSON.stringify(payload)
  const buffer = Buffer.from(serialized, 'utf8')

  return {
    cipher: xorBuffer(buffer, XOR_KEY).toString('base64'),
  }
}

function decryptPayload(envelope = {}) {
  if (!envelope || typeof envelope.cipher !== 'string' || !envelope.cipher) {
    throw new Error('Payload cifrato non valido.')
  }

  const decryptedBuffer = xorBuffer(Buffer.from(envelope.cipher, 'base64'), XOR_KEY)

  return JSON.parse(decryptedBuffer.toString('utf8'))
}

module.exports = {
  decryptPayload,
  encryptPayload,
}
