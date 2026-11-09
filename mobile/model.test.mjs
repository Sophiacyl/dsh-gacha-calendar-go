import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildGameItems, buildDetailItems, summarize } from './model.mjs';
import { createEngine } from '../packages/core/core.mjs';

const NOW = Date.parse('2026-11-09T12:00:00+08:00');
const meta = { id: 'test', name: '测试游戏', source: '官方公告', eventSource: '官方活动' };
const item = (overrides = {}) => ({ key: 'test:gacha:0', title: '当期卡池', show: '角色甲', roles: ['角色甲'], startTs: NOW - 3600000, endTs: NOW + 3600000, tz: 'Asia/Shanghai', raw: '', source: 'primary', ...overrides });
const record = (overrides = {}) => ({ gacha: [item()], events: [], gachaFail: null, eventFail: null, gachaStale: false, eventStale: false, okAt: NOW, ...overrides });
const result = rec => ({ schemaVersion: 1, refreshedAt: NOW, games: { test: rec } });

function assertListItems(rows) {
	const allowed = new Set(['title', 'subtitle', 'trailing', 'tone', 'icon', 'action']);
	for (const row of rows) {
		assert.equal(typeof row.title, 'string');
		for (const key of Object.keys(row)) assert.ok(allowed.has(key), key);
		if (row.tone) assert.ok(['good', 'warn', 'bad', 'info', 'muted'].includes(row.tone));
		assert.doesNotThrow(() => JSON.stringify(row));
	}
}

test('one native row per selected id, stable selection order, missing metadata, no mutations', () => {
	const input = result(record());
	const before = JSON.stringify(input);
	const rows = buildGameItems([meta], input, ['missing', 'test', 'test'], NOW);
	assert.equal(rows.length, 2);
	assert.equal(rows[0].title, 'missing');
	assert.deepEqual(rows[1].action, { id: 'select-game', args: { id: 'test' } });
	assert.equal(rows[1].trailing, '1项进行中');
	assert.equal(JSON.stringify(input), before);
	assertListItems(rows);
});

test('deduplicate exact primary/hover records but retain distinct same-window pools', () => {
	const a = item(), duplicate = item({ source: 'hover', key: 'duplicate' });
	const other = item({ source: 'hover', title: '另一卡池', roles: ['角色乙'] });
	const rows = buildDetailItems(meta, record({ gacha: [duplicate, a, other] }), NOW);
	assert.equal(rows.length, 4);
	assert.equal(rows.filter(row => row.title === '卡池 · 当期卡池').length, 1);
	assert.ok(rows.some(row => row.title === '卡池 · 另一卡池'));
});

test('suppress aggregate primary only when hover rows cover every explicit role', () => {
	const primary = item({ roles: ['甲', '乙'] });
	const hoverA = item({ title: '池甲：甲', source: 'hover', roles: [] });
	const hoverB = item({ title: '池乙：乙', source: 'hover', roles: [] });
	assert.equal(buildDetailItems(meta, record({ gacha: [primary, hoverA, hoverB] }), NOW).length, 4);
	assert.equal(buildDetailItems(meta, record({ gacha: [primary, hoverA] }), NOW).length, 4);
});

test('unknown start never appears active except proven upstream zzz-bwiki selection', () => {
	const rec = record({ gacha: [item({ startTs: null })] });
	assert.match(buildGameItems([meta], result(rec), ['test'], NOW)[0].trailing, /暂无进行中/);
	assert.match(buildDetailItems(meta, rec, NOW)[2].trailing, /开始时间未知/);
	const zzz = { ...meta, id: 'zzz' }, zResult = { refreshedAt: NOW, games: { zzz: rec } };
	assert.match(buildGameItems([zzz], zResult, ['zzz'], NOW)[0].trailing, /暂无进行中/);
	assert.equal(buildGameItems([{ ...zzz, gachaSourceId: 'zzz-bwiki' }], zResult, ['zzz'], NOW)[0].trailing, '1项进行中');
	assert.match(buildGameItems([{ ...meta, gachaSourceId: 'zzz-bwiki' }], result(rec), ['test'], NOW)[0].trailing, /暂无进行中/);
});

test('timestamps including zero, expiry boundary, invalid times, no implicit machine timezone', () => {
	const epoch = record({ gacha: [item({ startTs: 0, endTs: 3600000, tz: 'Asia/Tokyo' })] });
	const row = buildDetailItems(meta, epoch, 0)[2];
	assert.match(row.subtitle, /1970\/01\/01 09:00/);
	assert.match(row.trailing, /剩余 1小时/);
	assert.match(buildDetailItems(meta, epoch, 3600000)[2].trailing, /缓存已过期/);
	const invalid = buildDetailItems(meta, record({ gacha: [item({ startTs: NaN, endTs: Infinity, tz: 'invalid' })] }), NOW)[2];
	assert.match(invalid.trailing, /开始时间未知/);
	assert.doesNotMatch(invalid.subtitle, /Invalid Date|NaN/);
});

test('per-item chronology, future countdown, source timezone and claim phase', () => {
	const rows = buildDetailItems(meta, record({ gacha: [item({ title: '后', startTs: NOW + 7200000, endTs: NOW + 10800000 }), item({ title: '前', startTs: NOW - 7200000 })], events: [item({ title: '奖励', roles: undefined, phase: { kind: 'claim', startTs: NOW - 60000, endTs: NOW + 60000, show: '奖励兑换截止' } })] }), NOW);
	assert.match(rows[2].title, /前/);
	assert.match(rows.at(-1).trailing, /距开始 2小时/);
	assert.ok(rows.some(row => row.title.includes('奖励兑换截止') && row.trailing === '剩余 1分钟'));
	assertListItems(rows);
});

test('not configured, down, nomatch, stale and never refreshed remain distinct', () => {
	assert.match(buildGameItems([{ ...meta, source: '未配置', eventSource: '未配置' }], { games: {} }, ['test'], NOW)[0].subtitle, /未配置来源/);
	assert.match(buildGameItems([meta], { games: {} }, ['test'], NOW)[0].subtitle, /尚未刷新/);
	const rec = record({ gachaFail: { kind: 'down', reason: 'secret internal error' }, eventFail: { kind: 'nomatch' }, gachaStale: true, gacha: [item({ endTs: NOW - 1, startTs: NOW - 3600000 })] });
	const row = buildGameItems([meta], result(rec), ['test'], NOW)[0];
	assert.match(row.subtitle, /来源连接失败.*沿用旧缓存.*已过期缓存/s);
	assert.match(row.subtitle, /未匹配到当期内容/);
	assert.doesNotMatch(row.subtitle, /secret/);
	assert.equal(row.trailing, '缓存已过期');
	assert.match(buildDetailItems(meta, record({ gachaFail: 'event-down' }), NOW)[0].subtitle, /连接失败/);
});

test('legacy text only when raw array is empty; malformed nonempty arrays never invent fallback', () => {
	const old = record({ gacha: [], banner: '旧卡池', bannerDates: '11-01 ~ 11-30' });
	assert.ok(buildDetailItems(meta, old, NOW).some(row => row.title.includes('旧卡池') && row.trailing === '需刷新确认'));
	assert.ok(!buildDetailItems(meta, record({ banner: '旧卡池' }), NOW).some(row => row.title.includes('旧卡池')));
	assert.ok(!buildDetailItems(meta, record({ gacha: [null], banner: '旧卡池' }), NOW).some(row => row.title.includes('旧卡池')));
});

test('44 row bound includes honest omitted count', () => {
	const rec = record({ gacha: Array.from({ length: 70 }, (_, index) => item({ title: `卡池${index}`, startTs: index, endTs: NOW + 1 })) });
	const rows = buildDetailItems(meta, rec, NOW);
	assert.equal(rows.length, 44);
	assert.equal(rows.at(-1).title, '另有 29 项未展示');
	assert.match(rows.at(-1).subtitle, /共 70 项/);
});

test('summary counts items and overlapping game diagnostics, distinguishes no refresh', () => {
	const rec = record({ gacha: [item(), item({ title: '未来', startTs: NOW + 1, endTs: NOW + 10 }), item({ title: '过去', startTs: 0, endTs: 1 }), item({ title: '未知', startTs: null })], gachaFail: { kind: 'down' }, eventFail: { kind: 'nomatch' }, gachaStale: true });
	const summary = summarize(result(rec), ['test', 'missing', 'test'], NOW);
	for (const key of ['activeCount', 'upcomingCount', 'expiredCount', 'unknownCount', 'downCount', 'nomatchCount', 'staleCount', 'noRefreshCount']) assert.equal(summary[key], 1, key);
	assert.equal(summary.selectedCount, 2);
	assert.match(summary.lastRefreshText, /2026\/11\/09 12:00/);
	assert.equal(summarize({ refreshedAt: 0, games: {} }, ['test'], 0).lastRefreshText, '尚未刷新');
	assert.equal(summarize({ games: { test: { skipped: true } } }, ['test'], NOW).unconfiguredCount, 1);
});

test('native schema keys match model row contract', async context => {
	let source;
	try { source = await readFile(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'skills/dsh-go-plugin/kit/schema/view.schema.json'), 'utf8'); }
	catch (error) { if (error.code === 'ENOENT') { context.skip('dsh-go schema is not installed on this host'); return; } throw error; }
	const schema = JSON.parse(source);
	const properties = schema.$defs.listNode.properties.items.anyOf[0].items.anyOf[0].properties;
	assert.deepEqual(Object.keys(properties).sort(), ['action', 'icon', 'subtitle', 'title', 'tone', 'trailing']);
});

test('real core fixture refresh -> model -> persisted cache works without network', async () => {
	const mapping = JSON.parse(await readFile(new URL('../test/map.json', import.meta.url), 'utf8'));
	const requested = [];
	const bodyFor = async url => {
		const clean = String(url).replace(/[?&]origin=\*/, '');
		const path = mapping[clean] || mapping[Object.keys(mapping).find(key => clean.startsWith(key))];
		assert.ok(path, `unmapped fixture request: ${url}`);
		requested.push(url);
		return readFile(new URL(`../test/fixtures/${path}`, import.meta.url), 'utf8');
	};
	const store = new Map();
	const engine = createEngine({ now: () => Date.parse('2026-11-07T12:00:00+08:00'), storage: { get: async key => store.get(key), set: async (key, value) => store.set(key, value) }, transport: { fetchRaw: async url => new Response(await bodyFor(url)), fetchViaProxy: async url => bodyFor(url) } });
	const metas = await engine.listGames();
	store.set('hidden', metas.filter(game => game.id !== 'arknights').map(game => game.id));
	const refreshed = await engine.refresh();
	assert.ok(requested.length > 0);
	assert.ok(refreshed.games.arknights.events.length > 0);
	const rows = buildDetailItems(metas.find(game => game.id === 'arknights'), refreshed.games.arknights, Date.parse('2026-11-07T12:00:00+08:00'));
	assert.ok(rows.length > 2);
	assert.ok(rows.some(row => row.title.startsWith('活动 · ')));
	assertListItems(rows);
	assert.deepEqual(buildGameItems(metas, refreshed, ['arknights'], NOW), buildGameItems(metas, await engine.getCached(), ['arknights'], NOW));
});
