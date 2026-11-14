import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createEngine } from '../packages/core/core.mjs'
import { calendarView, gameRows } from './ui.mjs'
import { createController } from './runtime.mjs'
import * as model from './model.mjs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
let checkView
try { ({ checkView } = await import(pathToFileURL(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'skills/dsh-go-plugin/kit/lib/view-check.js')).href)) }
catch (error) { if (!['ERR_MODULE_NOT_FOUND', 'ENOENT'].includes(error.code)) throw error }
const caps = { components: ['avatar', 'collapsible', 'segmented'] }

test('original icon assets stay byte-identical to recorded upstream images', async () => {
	const sources = JSON.parse(await readFile(new URL('./assets/sources.json', import.meta.url), 'utf8'))
	const meta = await createEngine().listGames()
	assert.equal(sources.entries.length, meta.length)
	for (const game of meta) {
		const entry = sources.entries.find(e => e.id === game.id)
		assert.equal(entry.source, game.icon)
		const image = await readFile(new URL('./assets/' + entry.file, import.meta.url))
		assert.equal(createHash('sha256').update(image).digest('hex'), entry.sha256)
	}
})

test('game overview collapses long facts instead of reserving an empty icon column', () => {
	const action = { id: 'select-game', args: { id: 'hsr' } }
	const row = gameRows([{ title: '崩坏：星穹铁道', trailing: '9项进行中', subtitle: '卡池：已读取排期\n活动：已读取排期', action }], () => 'asset:hsr.png')[0]
	assert.equal(row.type, 'collapsible'); assert.equal(row.expanded, false)
	assert.match(row.label, /9项进行中/)
	assert.equal(row.children[0].src, 'asset:hsr.png')
	assert.deepEqual(row.children.at(-1).items[0].action, action)
	assert.ok(!JSON.stringify(row).includes('"columns"'))
	assert.ok(row.children[1].spans.some(span => span.color === 'indigo'))
	assert.ok(row.children[1].spans.some(span => span.color === 'teal'))
})

test('selection is a native follow switch, full label and no per-game giant button', () => {
	const name = 'BanG Dream！少女乐团派对·国服'
	const row = gameRows([{ title: '✓ ' + name, action: { id: 'toggle-game', args: { id: 'bandori' } } }], () => 'asset:bandori.jpg', 'settings')[0]
	const toggle = row.children[0]
	assert.equal(toggle.type, 'toggle'); assert.equal(toggle.label, name)
	assert.equal(toggle.bind, 'data.follow.bandori'); assert.equal(toggle.value, true)
	assert.deepEqual(toggle.onChange.args, { id: 'bandori' })
})

test('detail preserves long text and type colors while keeping dates separate', () => {
	const rows = gameRows([{ title: '卡池 · 当期限定超长名称', trailing: '剩余30天', subtitle: '2026/11/09 12:00 → 2026/12/09 12:00' }, { title: '活动 · 周年庆典' }], () => undefined, 'detail')
	assert.equal(rows[0].children[0].style.color, 'indigo'); assert.equal(rows[1].children[0].style.color, 'teal')
	assert.equal(rows[0].children[0].style.maxLines, 20)
	assert.ok(rows[0].children[2].text.includes('\n至 '))
})

function resolve(value, data) {
	if (Array.isArray(value)) return value.map(v => resolve(v, data))
	if (value && typeof value === 'object') {
		if (value.$) return value.$.split('.').slice(1).reduce((obj, k) => obj?.[k], data)
		return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, resolve(v,data)]))
	}
	return value
}

test('native protocol, 33-game search, page limits and recent navigation work', async () => {
	const sources = JSON.parse(await readFile(new URL('./assets/sources.json', import.meta.url), 'utf8'))
	const icons = Object.fromEntries(sources.entries.map(e => [e.id, 'asset:' + e.file]))
	const c = createController({ engine: createEngine(), store: { async get() {}, async set() {} }, transport: {}, model, icons })
	await c.ready
	assert.equal((await c.snapshot({})).navigation, 'recent')
	await c.actions.settings({})
	const seen = new Set()
	for (let p = 0; p < 5; p++) {
		const data = await c.snapshot({})
		for (const item of data.items) seen.add(item.action.args.id)
		assert.ok(Buffer.byteLength(JSON.stringify(data)) < 32768)
		if (checkView) {
			const checked = checkView(resolve(calendarView(caps),data), { budget: 'panel' })
			assert.equal(checked.fatal,false,JSON.stringify(checked))
			assert.deepEqual(checked.issues.filter(i => i.path !== 'view.accent'),[])
		}
		await c.actions['next-page']({})
	}
	assert.equal(seen.size,33)
	await c.actions['search-games']({}, { value: { value: '星穹' } })
	assert.equal((await c.snapshot({})).items[0].action.args.id,'hsr')
	assert.equal((await c.snapshot({})).pageActions.length,0)
	await c.actions['search-games']({}, { value: { value: 'no-game' } })
	assert.equal((await c.snapshot({})).items.length,0)
	await c.actions['select-game']({}, { value: { id:'hsr' } })
	assert.equal((await c.snapshot({})).navigation,'games')
	assert.equal(calendarView(caps).v,2)
	assert.equal(calendarView({components:['list']}).v,undefined)
	c.dispose()
})
