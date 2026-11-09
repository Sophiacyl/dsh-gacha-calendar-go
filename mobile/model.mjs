// Pure native-v1 display model. Inputs are core Result schemaVersion=1 and listGames metadata.
const SIDES = [
	{ key: 'gacha', label: '卡池', fail: 'gachaFail', stale: 'gachaStale', source: 'source', url: 'url' },
	{ key: 'events', label: '活动', fail: 'eventFail', stale: 'eventStale', source: 'eventSource', url: 'eventUrl' }
];
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8640000000000000;
const text = value => typeof value === 'string' ? value.trim() : '';
const time = value => value instanceof Date ? (finite(value.getTime()) ? value.getTime() : 0) : (finite(value) ? value : 0);
const idsOf = ids => [...new Set((Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string' && id))];
const normalized = value => text(value).replace(/\s+/g, '');

function dateLabel(value, tz) {
	if (!finite(value)) return '';
	const options = { timeZone: text(tz) || 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
	try { return new Intl.DateTimeFormat('zh-CN', options).format(value); }
	catch { return new Intl.DateTimeFormat('zh-CN', { ...options, timeZone: 'Asia/Shanghai' }).format(value); }
}
function duration(ms) {
	const minutes = Math.max(1, Math.ceil(ms / 60000));
	const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), mins = minutes % 60;
	return days ? `${days}天${hours ? `${hours}小时` : ''}` : hours ? `${hours}小时${mins ? `${mins}分` : ''}` : `${mins}分钟`;
}
function failKind(fail) {
	if (!fail) return '';
	if (typeof fail === 'object') return fail.kind === 'nomatch' ? 'nomatch' : 'down';
	return /no-match|nomatch/.test(String(fail)) ? 'nomatch' : 'down';
}
function configured(meta, side, record) {
	if (record?.skipped) return false;
	if (meta && Object.hasOwn(meta, side.url)) return !!text(meta[side.url]);
	const source = text(meta?.[side.source]);
	if (meta && Object.hasOwn(meta, side.source)) return !!source && !/^(未配置|未配置来源|无来源)$/.test(source);
	return null; // listGames metadata may be absent; never invent a not-configured diagnosis.
}
function openStartAllowed(meta, record, side) {
	if (side.key !== 'gacha') return false;
	const selected = text(meta?.gachaSourceId) || text(record?.gachaSourceId);
	// Only this upstream source explicitly allows an unknown start to be active.
	return meta?.id === 'zzz' && selected === 'zzz-bwiki';
}
function windowOf(item, now) {
	const phase = item.phase;
	if (phase?.kind === 'claim' && finite(phase.startTs) && finite(phase.endTs) && now >= phase.startTs) {
		return { start: phase.startTs, end: phase.endTs, claim: true };
	}
	return { start: finite(item.startTs) ? item.startTs : null, end: finite(item.endTs) ? item.endTs : null, claim: false };
}
function stateOf(item, now, allowUnknown) {
	const { start, end } = windowOf(item, now);
	if (start !== null && end !== null && end <= start) return 'unknown';
	if (end !== null && now >= end) return 'expired';
	if (start !== null && now < start) return 'upcoming';
	if (item.preview === true && start === null) return 'unknown';
	if (start === null) return allowUnknown && end !== null ? 'active' : 'unknown';
	if (item.longTerm === true) return 'active';
	return end !== null ? 'active' : 'unknown';
}
function recordsOf(record, side) {
	const raw = Array.isArray(record?.[side.key]) ? record[side.key] : [];
	const valid = raw.filter(item => item && typeof item === 'object' && !Array.isArray(item) && (text(item.title) || text(item.show)));
	const unique = new Map();
	for (const item of valid) {
		const key = JSON.stringify([normalized(item.title || item.show), finite(item.startTs) ? item.startTs : null, finite(item.endTs) ? item.endTs : null, item.phase?.kind || '', finite(item.phase?.startTs) ? item.phase.startTs : null, finite(item.phase?.endTs) ? item.phase.endTs : null]);
		if (!unique.has(key) || item.source === 'primary') unique.set(key, item);
	}
	const items = [...unique.values()];
	// A primary may summarize multiple hover pools; suppress it only when every declared role is represented.
	return items.filter(item => {
		if (item.source !== 'primary' || !Array.isArray(item.roles) || !item.roles.length) return true;
		const peers = items.filter(peer => peer.source === 'hover' && peer.startTs === item.startTs && peer.endTs === item.endTs);
		return !peers.length || !item.roles.every(role => text(role) && peers.some(peer => normalized(peer.title).includes(normalized(role))));
	});
}
function sideInfo(meta, record, side, now, hasRefresh = true) {
	const items = recordsOf(record, side);
	const fail = failKind(record?.[side.fail]);
	const stale = !!record?.[side.stale];
	const config = configured(meta, side, record);
	const hasText = !!text(record?.[side.key === 'gacha' ? 'banner' : 'event']);
	let status = config === false ? '未配置来源' : fail === 'down' ? '来源连接失败' : fail === 'nomatch' ? '未匹配到当期内容' : !record || (!items.length && !hasText && !hasRefresh && !record.okAt) ? '尚未刷新' : !items.length && !hasText ? '暂无排期数据' : '已读取排期';
	if (stale) status += ' · 沿用旧缓存';
	const states = items.map(item => stateOf(item, now, openStartAllowed(meta, record, side)));
	if (states.includes('expired')) status += ' · 含已过期缓存';
	return { items, fail, stale, config, status, states };
}
function itemRow(meta, record, side, item, now) {
	const window = windowOf(item, now), state = stateOf(item, now, openStartAllowed(meta, record, side));
	let zone = text(item.tz) || text(meta?.tz) || 'Asia/Shanghai';
	try { new Intl.DateTimeFormat('zh-CN', { timeZone: zone }); } catch { zone = 'Asia/Shanghai'; }
	const start = dateLabel(window.start, zone), end = dateLabel(window.end, zone);
	const dates = start && end ? `${start} → ${end}` : end ? `开始时间未知 → ${end}` : start ? `${start} → 结束时间未知` : text(item.raw) || '起止时间未知';
	const invalid = window.start !== null && window.end !== null && window.end <= window.start;
	const label = invalid ? '时间范围无效' : state === 'expired' ? '已结束 · 缓存已过期' : state === 'upcoming' ? `距开始 ${duration(window.start - now)}` : state === 'active' ? (window.end !== null ? `剩余 ${duration(window.end - now)}` : '长期') : window.start === null ? '开始时间未知' : '结束时间未知';
	const title = (window.claim && text(item.phase?.show)) || text(item.title) || text(item.show);
	const facts = [text(item.category), ...(Array.isArray(item.tags) ? item.tags.map(text) : [])].filter(Boolean);
	const roles = Array.isArray(item.roles) ? item.roles.map(text).filter(Boolean) : [];
	return {
		title: `${side.label} · ${title}${window.claim && !/兑换|领取/.test(title) ? '（奖励领取）' : ''}`,
		subtitle: [dates, zone, roles.length ? `角色：${roles.join('、')}` : '', facts.join('、'), record?.[side.stale] ? '沿用旧缓存' : ''].filter(Boolean).join(' · '),
		trailing: label,
		tone: state === 'expired' || record?.[side.stale] ? 'warn' : state === 'active' ? 'good' : 'info',
		icon: state === 'expired' ? 'history' : 'calendar'
	};
}

/** Returns native v1 list items, one per unique selected game id, preserving selection order. */
export function buildGameItems(gamesMeta, result, selectedIds, now) {
	const clock = time(now), metas = new Map((Array.isArray(gamesMeta) ? gamesMeta : []).filter(Boolean).map(meta => [meta.id, meta]));
	return idsOf(selectedIds).map(id => {
		const meta = metas.get(id) || { id, name: id }, record = result?.games?.[id];
		const infos = SIDES.map(side => sideInfo(meta, record, side, clock, finite(result?.refreshedAt) && result.refreshedAt > 0));
		const count = state => infos.reduce((sum, info) => sum + info.states.filter(value => value === state).length, 0);
		const warning = infos.some(info => info.fail || info.stale || info.states.includes('expired'));
		return { title: text(meta.name) || text(record?.name) || id, subtitle: infos.map((info, index) => `${SIDES[index].label}：${info.status}`).join('\n'), trailing: count('active') ? `${count('active')}项进行中` : count('upcoming') ? `${count('upcoming')}项待开始` : count('expired') ? '缓存已过期' : '暂无进行中排期', tone: warning ? 'warn' : count('active') ? 'good' : 'info', icon: warning ? 'warning' : 'calendar', action: { id: 'select-game', args: { id } } };
	});
}

/** Returns <=44 native list rows: side diagnostics, chronological facts, optional truncation note. */
export function buildDetailItems(meta, record, now) {
	const clock = time(now), rows = [], entries = [];
	for (const side of SIDES) {
		const info = sideInfo(meta, record, side, clock, !!record?.okAt);
		rows.push({ title: `${side.label}来源`, subtitle: info.status, trailing: text(meta?.[side.source]) || '来源未知', tone: info.fail || info.stale ? 'warn' : 'info', icon: info.fail ? 'warning' : 'info' });
		for (const item of info.items) entries.push({ item, side });
		// Legacy text is never allowed to hide structured item chronology.
		if (!Array.isArray(record?.[side.key]) || record[side.key].length === 0) {
			const isGacha = side.key === 'gacha', title = text(record?.[isGacha ? 'banner' : 'eventShow']) || (!isGacha ? text(record?.event) : '');
			if (title) entries.push({ side, legacy: { title: `${side.label} · ${title}`, subtitle: [text(record?.[isGacha ? 'roles' : 'eventHoverExtra']), text(record?.[isGacha ? 'bannerDates' : 'eventDates']), '旧版文本缓存，时间状态未验证', info.stale ? '沿用旧缓存' : ''].filter(Boolean).join(' · '), trailing: '需刷新确认', tone: 'warn', icon: 'history' } });
		}
	}
	entries.sort((a, b) => {
		const wa = a.item ? windowOf(a.item, clock) : {}, wb = b.item ? windowOf(b.item, clock) : {};
		return (wa.start ?? wa.end ?? Infinity) - (wb.start ?? wb.end ?? Infinity) || (wa.end ?? Infinity) - (wb.end ?? Infinity) || String(a.item?.title || '').localeCompare(String(b.item?.title || ''), 'zh-CN');
	});
	const truncated = entries.length > 42, limit = truncated ? 41 : 42;
	for (const entry of entries.slice(0, limit)) rows.push(entry.legacy || itemRow(meta, record, entry.side, entry.item, clock));
	if (truncated) rows.push({ title: `另有 ${entries.length - limit} 项未展示`, subtitle: `共 ${entries.length} 项排期，当前按起始时间展示前 ${limit} 项。`, tone: 'info', icon: 'more' });
	return rows;
}

/** Counts items after deduplication; diagnostic counts are selected-game counts (may overlap). */
export function summarize(result, selectedIds, now) {
	const clock = time(now), ids = idsOf(selectedIds);
	const summary = { selectedCount: ids.length, activeCount: 0, upcomingCount: 0, expiredCount: 0, unknownCount: 0, downCount: 0, nomatchCount: 0, staleCount: 0, unconfiguredCount: 0, noRefreshCount: 0 };
	for (const id of ids) {
		const record = result?.games?.[id];
		const infos = SIDES.map(side => sideInfo({ id }, record, side, clock, finite(result?.refreshedAt) && result.refreshedAt > 0));
		for (const info of infos) for (const state of info.states) summary[`${state}Count`]++;
		for (const [key, predicate] of [['downCount', info => info.fail === 'down'], ['nomatchCount', info => info.fail === 'nomatch'], ['staleCount', info => info.stale], ['unconfiguredCount', info => info.config === false], ['noRefreshCount', info => info.status.startsWith('尚未刷新')]]) if (infos.some(predicate)) summary[key]++;
	}
	const at = result?.refreshedAt;
	summary.lastRefreshText = finite(at) && at > 0 ? `上次刷新 ${dateLabel(at, 'Asia/Shanghai')}${clock < at ? '（时间晚于当前时钟）' : clock - at < 60000 ? '（刚刚）' : `（${duration(clock - at)}前）`}` : '尚未刷新';
	const counts = [`已选 ${summary.selectedCount} 款`, `进行中 ${summary.activeCount} 项`];
	for (const [key, label] of [['upcomingCount', '待开始'], ['expiredCount', '已过期缓存'], ['unknownCount', '时间待确认']]) if (summary[key]) counts.push(`${label} ${summary[key]} 项`);
	for (const [key, label] of [['downCount', '连接失败'], ['nomatchCount', '未匹配'], ['staleCount', '旧缓存'], ['unconfiguredCount', '未配置'], ['noRefreshCount', '未刷新']]) if (summary[key]) counts.push(`${label} ${summary[key]} 款`);
	summary.text = counts.join(' · ');
	return summary;
}
