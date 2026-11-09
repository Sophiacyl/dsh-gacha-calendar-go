// Explicit development command: snapshot the exact image URLs from upstream core.
import { createEngine } from '../packages/core/core.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const dir = fileURLToPath(new URL('./assets/', import.meta.url))
await mkdir(dir, { recursive: true })
const games = await createEngine().listGames(), entries = []
let next = 0
await Promise.all(Array.from({ length: 5 }, async () => {
	while (next < games.length) {
		const game = games[next++]
		const response = await fetch(game.icon, { signal: AbortSignal.timeout(30000) })
		if (!response.ok) throw new Error(`${game.id}: HTTP ${response.status}`)
		const bytes = Buffer.from(await response.arrayBuffer())
		const ext = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png' : bytes[0] === 255 && bytes[1] === 216 ? 'jpg' : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : bytes.toString('ascii', 0, 3) === 'GIF' ? 'gif' : null
		if (!ext || bytes.length > 1048576) throw new Error(`${game.id}: unsupported or oversized image`)
		const file = `${game.id}.${ext}`
		await writeFile(dir + file, bytes)
		entries.push({ id: game.id, name: game.name, file, source: game.icon, sha256: createHash('sha256').update(bytes).digest('hex') })
		console.log(`${game.id}: ${bytes.length} bytes`)
	}
}))
entries.sort((a,b) => games.findIndex(g => g.id === a.id) - games.findIndex(g => g.id === b.id))
await writeFile(dir + 'sources.json', JSON.stringify({ notice: '游戏图标版权归原权利人所有。本目录图片逐字节取自上游原图地址，供原生日历识别游戏使用；不属于项目 MIT 代码授权。', entries }, null, 2) + '\n')
console.log(`Saved ${entries.length} original icons`)
