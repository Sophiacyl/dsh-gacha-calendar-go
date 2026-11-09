import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createEngine } from '../packages/core/core.mjs'
import { calendarView, gameRows } from './ui.mjs'
import { createController } from './runtime.mjs'
import * as model from './model.mjs'
import { checkView } from '/root/.dsh/skills/dsh-go-plugin/kit/lib/view-check.js'

test('all original icons match upstream URL and downloaded SHA256', async () => {
	const sources = JSON.parse(await readFile(new URL('./assets/sources.json', import.meta.url), 'utf8'))
	const meta = await createEngine().listGames()
	assert.equal(sources.entries.length, meta.length)
	for (const game of meta) {
		const entry = sources.entries.find(e => e.id === game.id)
		assert.equal(entry.source, game.icon)
		const image = await readFile(new URL('./assets/' + entry.file, import.meta.url))
		assert.equal(createHash('sha256').update(image).digest('hex'), entry.sha256)
		assert.ok(image.length <= 1048576)
	}
})

test('original images accompany actionable rows; old app keeps working', () => {
	const original = { title: '原神', icon: 'calendar', action: { id: 'select-game', args: { id: 'genshin' } } }
	const row = gameRows([original], () => 'asset:genshin.png')[0]
	assert.equal(row.children[0].src, 'asset:genshin.png')
	assert.deepEqual(row.children[1].items[0].action, original.action)
	assert.equal(row.children[1].items[0].icon, undefined)
	assert.equal(original.icon, 'calendar')
	assert.equal(calendarView({ components: ['avatar'] }).v, 2)
	assert.equal(calendarView({ components: ['list'] }).v, undefined)
})

test('full 33-game image view fits native limits and uses original images in every page', async () => {
	const sources = JSON.parse(await readFile(new URL('./assets/sources.json', import.meta.url), 'utf8'))
	const icons = Object.fromEntries(sources.entries.map(e => [e.id, 'asset:' + e.file]))
	const engine = createEngine(), store = { async get() {}, async set() {} }
	const c = createController({ engine, store, transport: {}, model, icons })
	await c.ready
	await c.actions.settings({})
	let data = await c.snapshot({})
	assert.equal(data.imageRows.flatMap(group => group.children).length, 33)
	assert.ok(Buffer.byteLength(JSON.stringify(data)) <= 32768)
	const view = calendarView({ components: ['avatar'] })
	view.children[0].text = data.title; view.children[1].text = data.status
	view.children[3].children = data.imageRows; view.children[4].text = data.hint
	const checked = checkView(view, { budget: 'panel' })
	assert.equal(checked.fatal, false, JSON.stringify(checked))
	assert.deepEqual(checked.issues.filter(issue => issue.path !== 'view.accent'), [])
	await c.actions['select-game']({}, { value: { id: 'hsr' } })
	data = await c.snapshot({})
	assert.equal(data.imageRows[0].src, icons.hsr)
	c.dispose()
})
