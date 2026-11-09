// Full-width wrapping titles keep dates and actions from squeezing game names.
export const PAGE_SIZE = 8
export function gameRows(items, iconFor, page = 'games') {
	return items.map(item => {
		const src = iconFor(item)
		const children = []
		if (src) children.push({ type: 'avatar', src, alt: item.title, aspect: 1 })
		children.push({ type: 'text', text: item.title, style: { weight: 'semibold', maxLines: 20 } })
		if (item.trailing) children.push({ type: 'text', text: item.trailing, style: { maxLines: 20 } })
		if (item.subtitle) children.push({ type: 'text', text: item.subtitle.replace(/ → /g, '\n至 '), tone: 'muted', style: { maxLines: 20 } })
		if (item.action) children.push({ type: 'actions', items: [{ label: page === 'settings' ? item.title.startsWith('✓ ') ? '取消关注' : '关注游戏' : '查看详情', action: item.action }] })
		return { type: 'stack', style: { card: 'outlined', gap: 'S' }, children }
	})
}

export function calendarView(caps = {}) {
	const images = caps.components?.includes('avatar') === true
	return { ...(images ? { v: 2 } : {}), type: 'stack', title: '二游日历', children: [
		{ type: 'text', text: { $: 'data.title' }, ...(images ? { style: { weight: 'semibold', maxLines: 20 } } : {}) },
		{ type: 'text', text: { $: 'data.status' }, tone: 'muted' },
		{ type: 'actions', items: [
			{ label: '游戏列表', action: 'home', icon: 'list' },
			{ label: '选择游戏', action: 'settings', icon: 'settings' },
			{ label: '刷新', action: 'refresh', icon: 'refresh', ...(images ? {} : { style: 'primary' }) },
		] },
		images ? { type: 'stack', children: { $: 'data.imageRows' } } : { type: 'list', items: { $: 'data.items' } },
		{ type: 'text', text: { $: 'data.pageLabel' }, tone: 'muted' },
		{ type: 'actions', items: [ { label: '上一页', action: 'previous-page' }, { label: '下一页', action: 'next-page' } ] },
		{ type: 'text', text: { $: 'data.hint' }, tone: 'muted' },
	] }
}
