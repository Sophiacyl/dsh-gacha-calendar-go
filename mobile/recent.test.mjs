import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecent } from './recent.mjs';
const H = 3600000, D = 24 * H;
const meta = [{ id: 'a', name: '游戏甲' }, { id: 'b', name: '游戏乙' }, { id: 'zzz', name: '绝区零' }];
const fact = (title, startTs = 0, endTs = 2 * H, extra = {}) => ({ title, startTs, endTs, tz: 'Asia/Shanghai', ...extra });
const recent = (games, now = H, ids = ['a'], m = meta) => buildRecent(m, { games }, ids, now);

test('epoch zero is valid, unknown and expired windows excluded', () => {
	const r = recent({ a: { events: [fact('有效', 0, H), fact('未知', null, H), fact('过期', -H, 0), fact('反向', 2 * H, H), fact('空终点', 0, null)] } }, 0);
	assert.equal(r.items.length, 1); assert.equal(r.soonCount, 1); assert.equal(r.weekCount, 1);
	assert.ok(r.items[0].subtitle.includes('有效')); assert.ok(!r.items[0].subtitle.includes('未知'));
	assert.deepEqual(recent({}, NaN), { items: [], soonCount: 0, weekCount: 0, nextText: '暂无近期排期' });
});

test('grouping is by game, kind and exact effective deadline; counts count facts', () => {
	const r = recent({ a: { events: [fact('活动一'), fact('活动二')], gacha: [fact('池')] }, b: { events: [fact('另一游戏')] } }, H, ['a', 'b', 'a']);
	assert.equal(r.items.length, 3); assert.equal(r.soonCount, 4); assert.equal(r.weekCount, 4);
	const event = r.items.find(item => item.title.includes('游戏甲 · 活动'));
	assert.match(event.title, /2项/); assert.match(event.subtitle, /活动一\n活动二\n截止/);
	assert.deepEqual(event.action, { id: 'select-game', args: { id: 'a' } });
});

test('active endings have priority over upcoming starts; boundaries are inclusive', () => {
	const r = recent({ a: { events: [fact('将开始', 2 * H, 3 * H), fact('即将截止', 0, H + D), fact('七天', 0, H + 7 * D), fact('太远', 0, H + 7 * D + 1), fact('太远开始', H + 7 * D + 1, H + 8 * D)] } });
	assert.equal(r.items.length, 3); assert.equal(r.soonCount, 1); assert.equal(r.weekCount, 2);
	assert.match(r.items.at(-1).title, /即将开始/); assert.match(r.items.at(-1).trailing, /距开始/);
	assert.match(r.nextText, /下一个截止/);
	assert.match(recent({ a: { events: [fact('未来', 2 * H, 3 * H)] } }).nextText, /下一个开始/);
});

test('unknown start needs proven zzz-bwiki provenance and cannot be preview', () => {
	const games = { zzz: { gacha: [fact('未知起点', null, 2 * H)], events: [fact('活动未知', null, 2 * H)] } };
	assert.equal(recent(games, H, ['zzz']).items.length, 0);
	games.zzz.gachaSourceId = 'zzz-bwiki';
	assert.equal(recent(games, H, ['zzz']).weekCount, 1);
	games.zzz.gacha[0].preview = true;
	assert.equal(recent(games, H, ['zzz']).items.length, 0);
});

test('claim phase takes over at phase start, changes deadline and preserves reward label', () => {
	const item = fact('周年活动', 0, 2 * H, { phase: { kind: 'claim', startTs: 2 * H, endTs: 5 * H, show: '周年兑换截止' } });
	const before = recent({ a: { events: [item] } }, H);
	assert.match(before.items[0].trailing, /1小时/);
	const claim = recent({ a: { events: [item] } }, 3 * H);
	assert.equal(claim.weekCount, 1); assert.match(claim.items[0].subtitle, /周年兑换截止/); assert.match(claim.items[0].trailing, /2小时/);
	assert.equal(recent({ a: { events: [item] } }, 5 * H).items.length, 0);
	const noShow = { ...item, phase: { ...item.phase, show: '' } };
	assert.match(recent({ a: { events: [noShow] } }, 3 * H).items[0].subtitle, /奖励领取/);
});

test('same model dedup removes duplicates and fully represented aggregate pools only', () => {
	const pools = [fact('汇总', 0, 2 * H, { roles: ['甲', '乙'], source: 'primary' }), fact('甲池：甲', 0, 2 * H, { source: 'hover' }), fact('乙池：乙', 0, 2 * H, { source: 'hover' }), fact('甲池：甲', 0, 2 * H, { source: 'primary' })];
	const full = recent({ a: { gacha: pools } });
	// Duplicate primary wins exactly as model.mjs, so aggregate is retained if
	// its role only has a primary peer, not a hover peer.
	assert.equal(full.weekCount, 3);
	const hoverOnly = recent({ a: { gacha: pools.slice(0, 3) } });
	assert.equal(hoverOnly.weekCount, 2); assert.ok(!hoverOnly.items[0].subtitle.includes('汇总'));
	const partial = recent({ a: { gacha: pools.slice(0, 2) } });
	assert.equal(partial.weekCount, 2);
});

test('stale retained facts explicitly marked, malformed data safe, inputs untouched', () => {
	const games = { a: { events: [null, {}, fact('旧活动')], eventStale: true } };
	const copy = JSON.stringify(games), r = recent(games, new Date(H));
	assert.equal(r.items[0].tone, 'warn'); assert.match(r.items[0].subtitle, /沿用旧缓存/); assert.match(r.nextText, /旧缓存/);
	assert.equal(JSON.stringify(games), copy);
	assert.deepEqual(buildRecent(null, null, null, 0).items, []);
	assert.equal(recent({ a: { events: [fact('未选')] } }, H, ['b']).items.length, 0);
});
