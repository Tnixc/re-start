import { execSync } from 'child_process'

const HOST_NAME = 'com.restart.apple_reminders'

function readMessage(): object | null {
    // Chrome native messaging protocol: 4-byte LE length prefix + JSON
    const header = new Uint8Array(4)
    const headerBytes = Bun.stdin.stream().getReader()

    // We use a synchronous approach: read all of stdin
    return null
}

function sendMessage(msg: object): void {
    const json = JSON.stringify(msg)
    const bytes = new TextEncoder().encode(json)
    const header = new Uint32Array([bytes.length])
    const headerBytes = new Uint8Array(header.buffer)

    process.stdout.write(Buffer.from(headerBytes))
    process.stdout.write(Buffer.from(bytes))
}

async function readNativeMessage(): Promise<object | null> {
    const reader = Bun.stdin.stream().getReader()

    // Read 4-byte length header
    const chunks: Uint8Array[] = []
    let totalLen = 0

    while (totalLen < 4) {
        const { value, done } = await reader.read()
        if (done) return null
        chunks.push(value)
        totalLen += value.length
    }

    const headerBuf = new Uint8Array(4)
    let offset = 0
    for (const chunk of chunks) {
        const needed = Math.min(chunk.length, 4 - offset)
        headerBuf.set(chunk.subarray(0, needed), offset)
        offset += needed
    }

    const msgLen = new DataView(headerBuf.buffer).getUint32(0, true)
    if (msgLen === 0 || msgLen > 1024 * 1024) return null

    // Collect any leftover bytes from the header read
    const bodyChunks: Uint8Array[] = []
    let bodyLen = 0

    for (const chunk of chunks) {
        if (offset < chunk.length) {
            const leftover = chunk.subarray(offset)
            bodyChunks.push(leftover)
            bodyLen += leftover.length
        }
        offset = chunk.length // only first chunk can have leftover
    }

    // Read remaining body bytes
    while (bodyLen < msgLen) {
        const { value, done } = await reader.read()
        if (done) break
        bodyChunks.push(value)
        bodyLen += value.length
    }

    const bodyBuf = new Uint8Array(msgLen)
    let bOffset = 0
    for (const chunk of bodyChunks) {
        const needed = Math.min(chunk.length, msgLen - bOffset)
        bodyBuf.set(chunk.subarray(0, needed), bOffset)
        bOffset += needed
    }

    const json = new TextDecoder().decode(bodyBuf)
    return JSON.parse(json)
}

async function main() {
    const message = await readNativeMessage()

    // Run a command on the host machine to demonstrate native execution
    let hostInfo = ''
    try {
        hostInfo = execSync('whoami').toString().trim()
    } catch {
        hostInfo = 'unknown'
    }

    const reminders = [
        {
            id: 'ar-1',
            content: `"${hostInfo}" woah`,
            checked: false,
            completed_at: null,
            due: null,
            project_id: null,
            labels: [],
            child_order: 0,
            is_deleted: false,
        },
        {
            id: 'ar-2',
            content: 'XXXX',
            checked: false,
            completed_at: null,
            due: null,
            project_id: null,
            labels: [],
            child_order: 1,
            is_deleted: false,
        },
        {
            id: 'ar-3',
            content: execSync('echo $PATH').toString().trim(),
            checked: false,
            completed_at: null,
            due: null,
            project_id: null,
            labels: [],
            child_order: 2,
            is_deleted: false,
        },
    ]

    sendMessage({
        success: true,
        host: hostInfo,
        items: reminders,
    })
}

main()
