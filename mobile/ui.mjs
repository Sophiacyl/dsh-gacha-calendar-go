// Keep upstream game artwork. Native list.icon accepts names only, so pair each
// ordinary native list row with a real avatar image instead of inventing an icon.
export function gameRows(items, iconFor) {
	const rows = items.map(item => {
		const src = iconFor(item)
		const { icon, ...original } = item
		return src ? { type: 'row', children: [
			{ type: 'avatar', src, alt: item.title, aspect: 1 },
			{ type: 'list', items: [original] },
		] } : { type: 'list', items: [item] }
	})
	// Native containers show at most 32 children; grouping preserves all 33 games.
	return rows.length <= 24 ? rows : Array.from({ length: Math.ceil(rows.length / 24) }, (_, index) => ({ type: 'stack', children: rows.slice(index * 24, (index + 1) * 24) }))
}

export function calendarView(caps = {}) {
	const images = caps.components?.includes('avatar') === true
	return { ...(images ? { v: 2 } : {}), type: 'stack', title: '二游日历', children: [
		{ type: 'text', text: { $: 'data.title' } },
		{ type: 'text', text: { $: 'data.status' }, tone: 'muted' },
		{ type: 'actions', items: [
			{ label: '游戏列表', action: 'home', icon: 'list' },
			{ label: '选择游戏', action: 'settings', icon: 'settings' },
			{ label: '刷新', action: 'refresh', icon: 'refresh', ...(images ? {} : { style: 'primary' }) },
		] },
		images ? { type: 'stack', children: { $: 'data.imageRows' } } : { type: 'list', items: { $: 'data.items' } },
		{ type: 'text', text: { $: 'data.hint' }, tone: 'muted' },
	] }
}
