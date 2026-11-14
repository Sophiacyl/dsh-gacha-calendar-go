// Pure recent-deadline model for core structured gacha/events records.
const DAY = 86400000;
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8640000000000000;
const text = value => typeof value === 'string' ? value.trim() : '';
const normalized = value => text(value).replace(/\s+/g, '');
const SIDES = [{ key: 'gacha', label: '卡池', icon: 'star', stale: 'gachaStale' }, { key: 'events', label: '活动', icon: 'flag', stale: 'eventStale' }];
function dedup(record, side) {
	const unique = new Map();
	for (const item of Array.isArray(record?.[side.key]) ? record[side.key] : []) {
		if (!item || typeof item !== 'object' || Array.isArray(item) || !(text(item.title) || text(item.show))) continue;
		const key = JSON.stringify([normalized(item.title || item.show), finite(item.startTs) ? item.startTs : null, finite(item.endTs) ? item.endTs : null, item.phase?.kind || '', finite(item.phase?.startTs) ? item.phase.startTs : null, finite(item.phase?.endTs) ? item.phase.endTs : null]);
		if (!unique.has(key) || item.source === 'primary') unique.set(key, item);
	}
	const items = [...unique.values()];
	return items.filter(item => {
		if (item.source !== 'primary' || !Array.isArray(item.roles) || !item.roles.length) return true;
		const peers = items.filter(peer => peer.source === 'hover' && peer.startTs === item.startTs && peer.endTs === item.endTs);
		return !peers.length || !item.roles.every(role => text(role) && peers.some(peer => normalized(peer.title).includes(normalized(role))));
	});
}
function windowOf(item, now) {
	const phase = item.phase;
	if (phase?.kind === 'claim' && finite(phase.startTs) && finite(phase.endTs) && phase.endTs > phase.startTs && now >= phase.startTs) return { start: phase.startTs, end: phase.endTs, claim: true };
	return { start: finite(item.startTs) ? item.startTs : null, end: finite(item.endTs) ? item.endTs : null, claim: false };
}
function duration(ms) {
	const total = Math.max(1, Math.ceil(ms / 60000)), days = Math.floor(total / 1440), hours = Math.floor(total % 1440 / 60), minutes = total % 60;
	return days ? `${days}天${hours ? `${hours}小时` : ''}` : hours ? `${hours}小时${minutes ? `${minutes}分` : ''}` : `${minutes}分钟`;
}
function date(ts, tz) {
	const opts = { timeZone: text(tz) || 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
	try { return `${new Intl.DateTimeFormat('zh-CN', opts).format(ts)} ${opts.timeZone}`; }
	catch { return `${new Intl.DateTimeFormat('zh-CN', { ...opts, timeZone: 'Asia/Shanghai' }).format(ts)} Asia/Shanghai`; }
}

/**
 * Selected structured facts only. Active deadlines precede starts in the next
 * seven days. Counts are deduped active facts, not groups or upcoming facts.
 * Claim phase replaces the activity window once its start has been reached,
 * matching mobile/model.mjs. Unknown starts need explicit zzz-bwiki provenance.
 */
export function buildRecent(meta, result, ids, now) {
	const clock = now instanceof Date ? now.getTime() : now;
	if (!finite(clock)) return { items: [], soonCount: 0, weekCount: 0, nextText: '暂无近期排期' };
	const metas = new Map((Array.isArray(meta) ? meta : []).filter(Boolean).map(game => [game.id, game]));
	const selected = [...new Set((Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string' && id))];
	const groups = new Map();
	let soonCount = 0, weekCount = 0;
	for (const id of selected) {
		const game = metas.get(id) || { id }, record = result?.games?.[id];
		for (const side of SIDES) for (const item of dedup(record, side)) {
			const w = windowOf(item, clock);
			if (w.end !== null && (w.end <= clock || (w.start !== null && w.end <= w.start))) continue;
			const provenOpen = id === 'zzz' && side.key === 'gacha' && (text(game.gachaSourceId) || text(record?.gachaSourceId)) === 'zzz-bwiki' && item.preview !== true;
			if (w.start === null && !provenOpen) continue;
			const upcoming = w.start !== null && w.start > clock;
			const deadline = upcoming ? w.start : w.end;
			if (deadline === null || deadline > clock + 7 * DAY) continue;
			if (!upcoming) { weekCount++; if (deadline <= clock + DAY) soonCount++; }
			const key = JSON.stringify([id, side.key, upcoming, deadline]);
			if (!groups.has(key)) groups.set(key, { id, game, side, upcoming, deadline, facts: [], stale: false });
			const group = groups.get(key);
			const name = (w.claim && text(item.phase?.show)) || text(item.title) || text(item.show);
			group.facts.push({ name: w.claim && !/兑换|领取/.test(name) ? `${name}（奖励领取）` : name, tz: item.tz || game.tz });
			group.stale ||= !!record?.[side.stale];
		}
	}
	const ordered = [...groups.values()].sort((a, b) => Number(a.upcoming) - Number(b.upcoming) || a.deadline - b.deadline || a.id.localeCompare(b.id) || a.side.key.localeCompare(b.side.key));
	const items = ordered.map(group => ({
		title: `${text(group.game.name) || text(result?.games?.[group.id]?.name) || group.id} · ${group.side.label} · ${group.facts.length}项${group.upcoming ? '即将开始' : '即将结束'}`,
		subtitle: [...group.facts.slice(0, 8).map(fact => fact.name), ...(group.facts.length > 8 ? [`另有 ${group.facts.length - 8} 项，请打开完整排期`] : []), `${group.upcoming ? '开始' : '截止'} ${date(group.deadline, group.facts[0].tz)}`, ...(group.stale ? ['沿用旧缓存，请刷新确认'] : [])].join('\n'),
		trailing: `${group.upcoming ? '距开始' : '剩余'} ${duration(group.deadline - clock)}`,
		icon: group.side.icon,
		tone: group.stale ? 'warn' : group.upcoming ? 'info' : group.deadline <= clock + DAY ? 'warn' : 'good',
		action: { id: 'select-game', args: { id: group.id } },
	}));
	const next = ordered.find(group => !group.upcoming);
	const first = next || ordered[0];
	const nextText = first ? `${next ? '下一个截止' : '下一个开始'}：${text(first.game.name) || text(result?.games?.[first.id]?.name) || first.id} · ${first.side.label} · ${date(first.deadline, first.facts[0].tz)} · ${duration(first.deadline - clock)}${first.stale ? '（旧缓存）' : ''}` : '暂无近期排期';
	return { items, soonCount, weekCount, nextText };
}
