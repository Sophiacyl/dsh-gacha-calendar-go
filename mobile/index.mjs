import { createEngine } from './core.mjs'
import * as model from './model.mjs'
import { createController, createStore, createTransport } from './runtime.mjs'
import { calendarView } from './ui.mjs'
import icons from './icons.mjs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'local-gacha-calendar-go'

export function apply(ctx) {
	ctx.inject(['dshGo'], (ctx) => {
		const path = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-go', 'data', name, 'calendar.json')
		let controllerPromise
		function getController() {
			if (!controllerPromise) controllerPromise = createStore(path).then(store => {
				const transport = createTransport()
				return createController({ engine: createEngine({ storage: store, transport }), store, transport, model, icons })
			}).catch(error => { controllerPromise = undefined; throw error })
			return controllerPromise
		}
		ctx.dshGo.panel('calendar', {
			view: (_scope, caps) => calendarView(caps),
			data(scope, emit) {
				let stopped = false, cancel
				emit({ title: '二游日历', status: '正在读取缓存…', items: [], imageRows: [], pageActions: [], pageLabel: '', navigation: 'recent', follow: {}, hint: '' })
				getController().then(c => { if (!stopped) cancel = c.subscribe(scope, emit) }).catch(() => {
					if (!stopped) emit({ title: '二游日历', status: '缓存无法读取，请检查存储空间。', items: [], imageRows: [], pageActions: [], pageLabel: '', navigation: 'recent', follow: {}, hint: '' })
				})
				return () => { stopped = true; cancel?.() }
			},
			actions: Object.fromEntries(['home', 'settings', 'select-game', 'toggle-game', 'refresh', 'previous-page', 'next-page', 'search-games', 'recent', 'navigate', 'set-follow'].map(id => [id, async (scope, event) => {
				try { const c = await getController(); return await c.actions[id](scope, event) }
				catch { return { toast: '日历暂时不可用，请检查存储空间。' } }
			}])),
		})
		ctx.on('dispose', () => { controllerPromise?.then(c => c.dispose()).catch(() => {}) })
	})
}
