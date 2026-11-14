export const PAGE_SIZE = 8
const KIND_COLORS = { '卡池': 'indigo', '活动': 'teal' }
const marked = text => text.replace(/卡池/g, '✦ 卡池').replace(/活动/g, '⚑ 活动')
function textNode(text, muted = false) {
	return { type: 'text', text, ...(muted ? { tone: 'muted' } : {}), style: { size: 'caption', maxLines: 20 } }
}
function colored(text) {
	const value = marked(text)
	return { ...textNode(value, true), spans: value.split(/(✦ 卡池|⚑ 活动)/).filter(Boolean).map(text => ({ text, ...(/^[✦⚑] /.test(text) ? { color: text.startsWith('✦') ? 'indigo' : 'teal', weight: 'semibold' } : {}) })) }
}
export function gameRows(items, iconFor, page = 'games') {
	return items.map(item => {
		const src = iconFor(item)
		if (page === 'settings') {
			const followed = item.title.startsWith('✓ '), title = item.title.replace(/^[✓＋] /, '')
			return { type: 'stack', style: { gap: 'S' }, children: [
				{ type: 'toggle', label: title, bind: `data.follow.${item.action.args.id}`, value: followed, onChange: { id: 'set-follow', args: { id: item.action.args.id } } },
			] }
		}
		if (page === 'games' || page === 'recent') {
			const status = (item.subtitle || '').replace(/已读取排期/g, '已读').replace(/来源连接失败/g, '连接失败').replace(/未匹配到当期内容/g, '暂无当期')
			return { type: 'collapsible', label: `${page === 'recent' ? marked(item.title) : item.title} · ${item.trailing || '查看排期'}`, expanded: false, style: { gap: 'S', padding: 'S' }, children: [
				...(src ? [{ type: 'avatar', src, alt: item.title, aspect: 1 }] : []),
				colored(status),
				...(item.action ? [{ type: 'actions', items: [{ label: '完整排期', action: item.action }] }] : []),
			] }
		}
		const kind = item.title.match(/^(卡池|活动)/)?.[1]
		return { type: 'stack', style: { card: 'outlined', gap: 'S', padding: 'S' }, children: [
			{ ...textNode(item.title.replace(/^(卡池|活动)/, kind => kind === '卡池' ? '✦ 卡池' : '⚑ 活动')), style: { size: 'caption', weight: 'semibold', maxLines: 20, ...(kind ? { color: KIND_COLORS[kind] } : {}) } },
			...(item.trailing ? [textNode(item.trailing)] : []),
			...(item.subtitle ? [textNode(item.subtitle.replace(/ → /g, '\n至 '), true)] : []),
		] }
	})
}
export function calendarView(caps = {}) {
	const native = caps.components?.includes('collapsible') && caps.components?.includes('segmented')
	return { ...(native ? { v: 2 } : {}), type: 'stack', title: '二游日历', ...(native ? { style: { gap: 'S' } } : {}), children: [
		{ type: 'text', text: { $: 'data.status' }, tone: 'muted', ...(native ? { style: { size: 'caption', maxLines: 8 } } : {}) },
		...(native ? [{ type: 'segmented', label: '查看', bind: 'data.navigation', options: [{ label: '近期', value: 'recent' }, { label: '游戏', value: 'games' }, { label: '关注', value: 'settings' }], onChange: 'navigate' }] : []),
		{ type: 'actions', items: native ? [{ label: '刷新排期', action: 'refresh', icon: 'refresh' }] : [{ label: '近期', action: 'recent' }, { label: '游戏', action: 'home' }, { label: '关注', action: 'settings' }, { label: '刷新', action: 'refresh' }] },
		native ? { type: 'stack', style: { gap: 'S' }, children: { $: 'data.imageRows' } } : { type: 'list', items: { $: 'data.items' } },
		{ type: 'text', text: { $: 'data.pageLabel' }, tone: 'muted', ...(native ? { style: { size: 'caption' } } : {}) },
		{ type: 'actions', items: { $: 'data.pageActions' } },
		{ type: 'text', text: { $: 'data.hint' }, tone: 'muted', ...(native ? { style: { size: 'caption', maxLines: 4 } } : {}) },
	] }
}
