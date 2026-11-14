import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { gameRows, PAGE_SIZE } from './ui.mjs'
import { buildRecent } from './recent.mjs'

export const DEFAULT_GAMES = ['genshin', 'hsr', 'zzz', 'wuwa', 'arknights', 'r1999']

export async function createStore(path) {
	let values = {}
	try { values = JSON.parse(await readFile(path, 'utf8')); if (!values || Array.isArray(values) || typeof values !== 'object') throw new Error('invalid-store') }
	catch (error) { if (error.code !== 'ENOENT') throw new Error('日历缓存无法读取，请检查存储空间。', { cause: error }) }
	let queue = Promise.resolve()
	return {
		async get(key) { return values[key] },
		async set(key, value) {
			const save = queue.then(async () => {
				const next = { ...values, [key]: value }
				await mkdir(dirname(path), { recursive: true })
				await writeFile(path + '.tmp', JSON.stringify(next), { mode: 0o600 })
				await rename(path + '.tmp', path)
				values = next
			})
			queue = save.catch(() => {})
			return save
		},
	}
}

export function createTransport(fetcher = fetch) {
	let roundSignal
	async function request(url, opts = {}) {
		const target = new URL(url)
		if (!['https:', 'http:'].includes(target.protocol)) throw new Error('不支持的来源地址')
		const signals = [AbortSignal.timeout(25000), opts.signal, roundSignal].filter(Boolean)
		const response = await fetcher(target, { ...opts, signal: AbortSignal.any(signals) })
		return response
	}
	return {
		setRoundSignal(signal) { roundSignal = signal },
		fetchRaw: request,
		async fetchViaProxy(url, { referer, headers, body } = {}) {
			const response = await request(url, { headers: { ...headers, ...(referer ? { Referer: referer } : {}) }, ...(body != null ? { method: 'POST', body } : {}) })
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			return response.text()
		},
	}
}

export function createController({ engine, store, transport, model, icons = {}, now = Date.now }) {
	const sessions = new Map()
	let meta = [], result = { games: {}, refreshedAt: 0 }, busy = false, message = '', inFlight
	const feeds = new Set()
	let tick, selectionQueue = Promise.resolve()
	const ready = (async () => {
		meta = await engine.listGames()
		result = await engine.getCached()
	})()
	ready.catch(() => { message = '日历初始化失败，请检查缓存文件。' })
	async function selected() { const saved = await store.get('mobileSelected'); return (Array.isArray(saved) ? saved : DEFAULT_GAMES).filter(id => meta.some(g => g.id === id)) }
	async function syncSelection() {
		const ids = await selected()
		await store.set('hidden', meta.filter(g => !ids.includes(g.id)).map(g => g.id))
		await store.set('shown', ids)
	}
	function state(scope = {}) {
		const key = scope.sessionId || 'global'
		if (!sessions.has(key)) {
			if (sessions.size >= 50) {
				const inactive = [...sessions.keys()].find(k => ![...feeds].some(f => (f.scope.sessionId || 'global') === k))
				if (inactive) sessions.delete(inactive)
			}
			sessions.set(key, { page: 'recent', game: null, pageIndex: 0, search: '' })
		}
		return sessions.get(key)
	}
	async function snapshot(scope) {
		await ready
		const ids = await selected(), s = state(scope)
		const recent = buildRecent(meta, result, ids, now())
		let title = '二游日历', items
		if (s.page === 'recent') {
			title = '近期排期'
			items = recent.items
		} else if (s.page === 'settings') {
			title = '选择关注的游戏'
			items = meta.filter(g => `${g.name} ${g.id}`.toLocaleLowerCase().includes(s.search.trim().toLocaleLowerCase())).map(g => ({ title: `${ids.includes(g.id) ? '✓ ' : '＋ '}${g.name}`, subtitle: ids.includes(g.id) ? '已关注 · 点击取消' : '未关注 · 点击添加', action: { id: 'toggle-game', args: { id: g.id } } }))
		} else if (s.page === 'detail' && meta.some(g => g.id === s.game)) {
			const g = meta.find(g => g.id === s.game)
			title = g.name
			items = model.buildDetailItems(g, result.games[g.id], now())
		} else {
			items = model.buildGameItems(meta, result, ids, now())
			if (!ids.length) items = [{ title: '还没有关注游戏', subtitle: '点击「选择游戏」添加。' }]
		}
		const total = items.length, pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
		s.pageIndex = Math.max(0, Math.min(s.pageIndex, pageCount - 1))
		items = items.slice(s.pageIndex * PAGE_SIZE, (s.pageIndex + 1) * PAGE_SIZE)
		const imageRows = s.page === 'detail'
			? [...(icons[s.game] ? [{ type: 'avatar', src: icons[s.game], alt: title, aspect: 1 }] : []), ...gameRows(items, () => undefined, 'detail')]
			: gameRows(items, item => icons[item.action?.args?.id], s.page)
		if (s.page === 'recent' && total === 0) imageRows.push({ type: 'text', text: result.refreshedAt ? '未来七天暂无可确认的截止或开启排期。' : '先选择关注游戏，再点刷新获取近期排期。', tone: 'muted' })
		if (s.page === 'detail') imageRows.unshift({ type: 'actions', items: [{ label: '返回游戏', action: 'home', icon: 'list' }] })
		if (s.page === 'settings' && total === 0) imageRows.push({ type: 'text', text: '没有匹配的游戏，试试其他名称。', tone: 'muted' })
		const searchRows = s.page === 'settings' ? [{ type: 'textField', label: '搜索', placeholder: '游戏名称', bind: 'data.search', value: s.search, maxLength: 80, multiline: false, maxLines: 1, onChange: 'search-games' }] : []
		imageRows.unshift(...searchRows)
		const pageLabel = `第 ${s.pageIndex + 1} / ${pageCount} 页 · 共 ${total} 项`
		const summary = model.summarize(result, ids, now())
		const pageActions = pageCount > 1 ? [ ...(s.pageIndex > 0 ? [{ label: '上一页', action: 'previous-page' }] : []), ...(s.pageIndex < pageCount - 1 ? [{ label: '下一页', action: 'next-page' }] : []) ] : []
		return { title, items, imageRows, searchRows, search: s.search, pageLabel, pageActions, navigation: s.page === 'detail' ? 'games' : s.page, follow: Object.fromEntries(meta.map(g => [g.id, ids.includes(g.id)])), status: busy ? '正在刷新，请稍候…' : message || (s.page === 'recent' ? `24小时内 ${recent.soonCount} 项 · 7天内 ${recent.weekCount} 项\n${recent.nextText}` : typeof summary === 'string' ? summary : summary.lastRefreshText), hint: s.page === 'settings' ? '搜索后直接开关关注；刷新只抓取已关注游戏。' : s.page === 'detail' ? title : '点行展开，查看同批排期；展开后可进入完整详情。' }
	}
	async function publish() {
		await Promise.all([...feeds].map(async f => { try { const data = await snapshot(f.scope); if (feeds.has(f)) f.emit(data) } catch { if (feeds.has(f)) f.emit({ title: '二游日历', items: [], imageRows: [], pageActions: [], pageLabel: '', navigation: 'recent', follow: {}, status: '日历读取失败，请检查存储空间。', hint: '' }) } }))
	}
	async function refresh(signal) {
		await ready
		if (inFlight) return inFlight
		inFlight = (async () => {
			busy = true; message = ''; await publish()
			const controller = new AbortController()
			const abort = () => controller.abort()
			signal?.addEventListener('abort', abort, { once: true })
			if (signal?.aborted) controller.abort()
			transport.setRoundSignal(controller.signal)
			try {
				if (controller.signal.aborted) throw new Error('cancelled')
				await selectionQueue
				await syncSelection()
				result = await engine.refresh()
				message = ''
				return { toast: controller.signal.aborted ? '刷新已停止，已保留可用结果。' : '刷新完成，请留意各游戏来源状态。' }
			} catch { message = '刷新失败，保留上次缓存。'; return { toast: message } }
			finally { controller.abort(); transport.setRoundSignal(undefined); signal?.removeEventListener('abort', abort); busy = false; await publish() }
		})()
		try { return await inFlight } finally { inFlight = null }
	}
	return {
		ready, snapshot,
		subscribe(scope, emit) {
			const feed = { scope, emit }; feeds.add(feed); void publish()
			if (!tick) { tick = setInterval(() => void publish(), 60000); tick.unref?.() }
			return () => { feeds.delete(feed); if (!feeds.size) { clearInterval(tick); tick = null } }
		},
		actions: {
			async recent(scope) { Object.assign(state(scope), { page: 'recent', pageIndex: 0 }); await publish(); return {} },
			async navigate(scope, event) { const page = event.value?.value; if (!['recent', 'games', 'settings'].includes(page)) return {}; Object.assign(state(scope), { page, pageIndex: 0 }); await publish(); return {} },
			async 'set-follow'(scope, event) {
				const id = event.value?.id, value = event.value?.value
				await ready
				if (busy) { await publish(); return { toast: '请等刷新结束后再修改。' } }
				if (!meta.some(g => g.id === id) || typeof value !== 'boolean') return {}
				const save = selectionQueue.then(async () => { const ids = await selected(); await store.set('mobileSelected', value ? [...new Set([...ids, id])] : ids.filter(x => x !== id)); await syncSelection() })
				selectionQueue = save.catch(() => {})
				try { await save; await publish(); return {} } catch { await publish(); return { toast: '保存失败，请检查存储空间。' } }
			},
			async home(scope) { Object.assign(state(scope), { page: 'games', pageIndex: 0 }); await publish(); return {} },
			async settings(scope) { Object.assign(state(scope), { page: 'settings', pageIndex: 0 }); await publish(); return {} },
			async 'search-games'(scope, event) { const s = state(scope); s.search = typeof event.value?.value === 'string' ? event.value.value.slice(0, 80) : ''; s.pageIndex = 0; await publish(); return {} },
			async 'previous-page'(scope) { state(scope).pageIndex--; await publish(); return {} },
			async 'next-page'(scope) { state(scope).pageIndex++; await publish(); return {} },
			async 'select-game'(scope, event) { await ready; if (!meta.some(g => g.id === event.value?.id)) return { toast: '游戏不存在。' }; Object.assign(state(scope), { page: 'detail', game: event.value.id, pageIndex: 0 }); await publish(); return {} },
			async 'toggle-game'(scope, event) {
				await ready
				if (busy) return { toast: '请等刷新结束后再修改。' }
				const id = event.value?.id
				if (!meta.some(g => g.id === id)) return { toast: '游戏不存在。' }
				const save = selectionQueue.then(async () => {
					const ids = await selected()
					await store.set('mobileSelected', ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
					await syncSelection()
				})
				selectionQueue = save.catch(() => {})
				try { await save; await publish(); return {} }
				catch { return { toast: '保存失败，请检查存储空间。' } }
			},
			refresh() { if (busy) return { toast: '正在刷新，请稍候。' }; return { pending: { label: '正在刷新日历', timeoutMs: 55000 }, result: refresh } },
		},
		dispose() { clearInterval(tick); tick = null; feeds.clear() },
	}
}
