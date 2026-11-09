import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = resolve(process.argv[2] || join(root, 'dist/mobile'))
const upstream = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
await mkdir(join(out, 'lib'), { recursive: true })
for (const name of ['index.mjs', 'runtime.mjs', 'model.mjs', 'ui.mjs']) await copyFile(join(root, 'mobile', name), join(out, 'lib', name))
await copyFile(join(root, 'packages/core/core.mjs'), join(out, 'lib/core.mjs'))
await copyFile(join(root, 'LICENSE'), join(out, 'LICENSE'))
const icons = JSON.parse(await readFile(join(root, 'mobile/assets/sources.json'), 'utf8'))
await mkdir(join(out, 'assets'), { recursive: true })
for (const entry of icons.entries) await copyFile(join(root, 'mobile/assets', entry.file), join(out, 'assets', entry.file))
await copyFile(join(root, 'mobile/assets/sources.json'), join(out, 'assets/sources.json'))
await writeFile(join(out, 'lib/icons.mjs'), `export default ${JSON.stringify(Object.fromEntries(icons.entries.map(e => [e.id, 'asset:' + e.file])))}\n`)
await writeFile(join(out, 'package.json'), JSON.stringify({
	name: 'local-gacha-calendar-go', version: upstream.version, private: true, type: 'module', main: 'lib/index.mjs',
	description: '二游日历的 dsh-go 手机原生适配：关注游戏、活动详情、倒计时与手动刷新。', license: 'MIT',
	repository: { type: 'git', url: 'git+https://github.com/Sophiacyl/dsh-gacha-calendar-go.git' },
	engines: { node: '>=20', dsh: '>=0.2.1-rc.2 <0.3.0-0' },
	dsh: { bundle: { patch: './cordis.patch.yml' } },
	dshGo: { v: 1, title: { zh: '二游日历 · 手机版', en: 'Gacha Calendar Go' }, icon: 'calendar', assets: 'assets', wants: [], contributes: {
		'composer.actions': [{ id: 'open-calendar', label: '二游日历', icon: 'calendar', effect: { type: 'open', page: 'panel:calendar' } }],
		panels: [{ id: 'calendar', title: '二游日历', icon: 'calendar', placement: ['session.tab', 'features', 'chat.panel'] }],
	} },
}, null, 2) + '\n')
await writeFile(join(out, 'cordis.patch.yml'), '- insert:\n    - id: local-gacha-calendar-go\n      name: local-gacha-calendar-go\n')
console.log(`Built mobile plugin: ${out}`)
