import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore, createTransport, createController } from './runtime.mjs'

test('atomic storage survives reopen and serializes concurrent writes', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'gacha-go-'))
	try {
		const path = join(dir, 'calendar.json'), store = await createStore(path)
		await Promise.all([store.set('a', 1), store.set('b', 2)])
		const again = await createStore(path)
		assert.equal(await again.get('a'), 1); assert.equal(await again.get('b'), 2)
		await writeFile(path, '{bad')
		await assert.rejects(createStore(path), /缓存无法读取/)
	} finally { await rm(dir, { recursive: true, force: true }) }
})

test('native transport preserves proxy headers, body, status and cancellation', async () => {
	const calls = []
	const transport = createTransport(async (url, opts) => { calls.push({ url, opts }); return new Response('ok') })
	assert.equal(await transport.fetchViaProxy('https://example.org/api', { referer: 'https://example.org/', headers: { 'X-Test': 'yes' }, body: 'q=1' }), 'ok')
	assert.equal(calls[0].opts.method, 'POST'); assert.equal(calls[0].opts.headers.Referer, 'https://example.org/')
	const abort = new AbortController(); transport.setRoundSignal(abort.signal); abort.abort()
	await transport.fetchRaw('https://example.org')
	assert.equal(calls[1].opts.signal.aborted, true)
	await assert.rejects(transport.fetchRaw('file:///tmp/test'), /不支持/)
	await assert.rejects(createTransport(async () => new Response('', { status: 403 })).fetchViaProxy('https://example.org'), /HTTP 403/)
})

test('controller is cache-only until refresh; selection and navigation work independently', async () => {
	const values = {}, calls = []
	const store = { async get(k) { return values[k] }, async set(k, v) { values[k] = v } }
	const meta = [{ id: 'genshin', name: '原神' }, { id: 'hsr', name: '星铁' }, { id: 'extra', name: '其他' }]
	const engine = { async listGames() { return meta }, async getCached() { return { games: {}, refreshedAt: 0 } }, async refresh() { calls.push('refresh'); return { games: {}, refreshedAt: 100 } } }
	const model = { buildGameItems(_m, _r, ids) { return ids.map(title => ({ title })) }, buildDetailItems(m) { return [{ title: m.name }] }, summarize() { return { text: '状态' } } }
	const c = createController({ engine, store, model, transport: { setRoundSignal() {} } })
	await c.ready; assert.deepEqual(values, {}); assert.equal(calls.length, 0)
	assert.equal((await c.snapshot({})).title, '近期排期')
	assert.equal((await c.snapshot({})).items.length, 0)
	assert.equal((await c.snapshot({})).status.includes('\n'), false)
	assert.deepEqual((await c.snapshot({})).statusRows, [])
	assert.equal((await c.actions.home({})).patch.navigation, 'games')
	assert.equal((await c.snapshot({})).items.length, 2)
	assert.equal((await c.actions.settings({})).patch.navigation, 'settings')
	assert.equal((await c.actions.recent({})).patch.navigation, 'recent')
	await c.actions.home({})
	await c.actions['select-game']({ sessionId: 'a' }, { value: { id: 'hsr' } })
	assert.equal((await c.snapshot({ sessionId: 'a' })).title, '星铁')
	assert.equal((await c.snapshot({ sessionId: 'b' })).title, '近期排期')
	await c.actions['toggle-game']({}, { value: { id: 'extra' } })
	assert.ok(values.shown.includes('extra'))
	await c.actions.refresh().result(new AbortController().signal)
	assert.equal(calls.length, 1)
	let feed
	const stop = c.subscribe({}, data => { feed = data })
	await new Promise(resolve => setImmediate(resolve))
	assert.equal(feed.navigation, 'games')
	await c.actions['set-follow']({}, { value: { id: 'extra', value: false } })
	assert.equal(values.shown.includes('extra'), false)
	await c.actions['set-follow']({}, { value: { id: 'extra', value: false } })
	assert.equal(values.shown.includes('extra'), false)
	await c.actions.navigate({}, { value: { value: 'recent' } })
	assert.equal((await c.snapshot({})).navigation, 'recent')
	stop(); c.dispose()
})
