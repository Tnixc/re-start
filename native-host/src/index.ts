import { getRemindersWithinDays } from './reminders'

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
    await readNativeMessage()

    const reminders = getRemindersWithinDays(7)

    const items = reminders.map((r, i) => ({
        id: r.externalId,
        content: r.title,
        checked: false,
        completed_at: null,
        due: r.dueDate ? { date: r.dueDate } : null,
        project_id: null,
        project_name: r.list,
        labels: [],
        notes: r.notes ?? '',
        child_order: i,
        is_deleted: false,
    }))

    sendMessage({
        success: true,
        items,
    })
}

main()
