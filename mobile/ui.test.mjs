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
	const content = row.children[0]
	assert.equal(content.children[0].src, 'asset:genshin.png')
	assert.equal(content.type, 'row')
	assert.deepEqual(content.style.columns, [1, 4])
	assert.equal(content.children[1].children[0].text, original.title)
	assert.equal(content.children[1].children[0].style.maxLines, 20)
	assert.deepEqual(row.children.at(-1).items[0].action, original.action)
	assert.equal(original.icon, 'calendar')
	assert.equal(calendarView({ components: ['avatar'] }).v, 2)
	assert.equal(calendarView({ components: ['list'] }).v, undefined)
})

test('overview puts name, active count and joined fetch states to the right of original icon', () => {
	const row = gameRows([{ title: '崩坏：星穹铁道', trailing: '9项进行中', subtitle: '卡池：已读取排期\n活动：已读取排期' }], () => 'asset:hsr.png')[0]
	const lines = row.children[0].children[1].children
	assert.equal(lines[0].text, '崩坏：星穹铁道')
	assert.equal(lines[1].text, '9项进行中')
	assert.equal(lines[2].text, '卡池：已读取 · 活动：已读取')
	assert.equal(lines[0].style.size, 'body')
	assert.equal(lines[1].style.size, 'caption')
	assert.equal(lines[2].style.size, 'caption')
	assert.ok(lines.every(node => node.type === 'text'))
	assert.equal(lines[2].text.includes('\n'), false)
	assert.equal(lines[0].style.maxLines, 20)
})

test('all 33 games remain reachable with wrapping cards and page bounds', async () => {
	const sources = JSON.parse(await readFile(new URL('./assets/sources.json', import.meta.url), 'utf8'))
	const icons = Object.fromEntries(sources.entries.map(e => [e.id, 'asset:' + e.file]))
	const engine = createEngine(), store = { async get() {}, async set() {} }
	const c = createController({ engine, store, transport: {}, model, icons })
	await c.ready
	await c.actions.settings({})
	let data = await c.snapshot({})
	assert.equal(data.imageRows.length, 8)
	const seen = new Set()
	for (let page = 0; page < 5; page++) {
		const current = await c.snapshot({})
		for (const item of current.items) seen.add(item.action.args.id)
		await c.actions['next-page']({})
	}
	assert.equal(seen.size, 33)
	assert.match((await c.snapshot({})).pageLabel, /第 5 \/ 5 页/)
	await c.actions.settings({})
	data = await c.snapshot({})
	assert.ok(Buffer.byteLength(JSON.stringify(data)) <= 32768)
	const view = calendarView({ components: ['avatar'] })
	view.children[0].text = data.title; view.children[1].text = data.status
	view.children[3].children = data.imageRows; view.children[4].text = data.pageLabel; view.children[6].text = data.hint
	const checked = checkView(view, { budget: 'panel' })
	assert.equal(checked.fatal, false, JSON.stringify(checked))
	assert.deepEqual(checked.issues.filter(issue => issue.path !== 'view.accent'), [])
	await c.actions['select-game']({}, { value: { id: 'hsr' } })
	data = await c.snapshot({})
	assert.equal(data.imageRows[0].src, icons.hsr)
	c.dispose()
})

test('long activity and game names use full-width text separate from deadline', () => {
	const name = 'BanG Dream！少女乐团派对·国服：这是一个特别长的游戏和活动名称'
	const row = gameRows([{ title: name, subtitle: '2026/11/09 12:00 → 2026/12/09 12:00', trailing: '剩余30天' }], () => undefined, 'detail')[0]
	assert.equal(row.type, 'stack')
	assert.equal(row.children[0].text, name)
	assert.equal(row.children[0].style.maxLines, 20)
	assert.equal(row.children[1].text, '剩余30天')
	assert.ok(row.children[2].text.includes('\n至 '))
	assert.equal(row.children[0].style.size, undefined)
	assert.equal(row.style.card, 'outlined')
	assert.ok(row.children.every(child => child.type === 'text'))
	const selected = gameRows([{ title: '✓ ' + name, action: { id: 'toggle-game', args: { id: 'bandori' } } }], () => 'asset:bandori.jpg', 'settings')[0]
	assert.equal(selected.children[1].text, '✓ ' + name)
	assert.equal(selected.children.at(-1).items[0].label, '取消关注')
})
