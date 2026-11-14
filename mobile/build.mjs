import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const publish = process.argv.includes('--publish')
const target = process.argv.slice(2).find(arg => !arg.startsWith('--'))
const out = resolve(target || join(root, publish ? 'dist/npm' : 'dist/mobile'))
const packageName = publish ? 'dsh-gacha-calendar-go' : 'local-gacha-calendar-go'
const upstream = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const release = JSON.parse(await readFile(join(root, 'mobile/release.json'), 'utf8'))
await mkdir(join(out, 'lib'), { recursive: true })
for (const name of ['index.mjs', 'runtime.mjs', 'model.mjs', 'ui.mjs', 'recent.mjs']) {
	if (publish && name === 'index.mjs') {
		const source = await readFile(join(root, 'mobile', name), 'utf8')
		await writeFile(join(out, 'lib', name), source.replace("export const name = 'local-gacha-calendar-go'", `export const name = '${packageName}'`))
	} else await copyFile(join(root, 'mobile', name), join(out, 'lib', name))
}
await copyFile(join(root, 'README.md'), join(out, 'README.md'))
await copyFile(join(root, 'packages/core/core.mjs'), join(out, 'lib/core.mjs'))
await copyFile(join(root, 'LICENSE'), join(out, 'LICENSE'))
const icons = JSON.parse(await readFile(join(root, 'mobile/assets/sources.json'), 'utf8'))
await mkdir(join(out, 'assets'), { recursive: true })
for (const entry of icons.entries) await copyFile(join(root, 'mobile/assets', entry.file), join(out, 'assets', entry.file))
await copyFile(join(root, 'mobile/assets/sources.json'), join(out, 'assets/sources.json'))
await writeFile(join(out, 'lib/icons.mjs'), `export default ${JSON.stringify(Object.fromEntries(icons.entries.map(e => [e.id, 'asset:' + e.file])))}\n`)
await writeFile(join(out, 'package.json'), JSON.stringify({
	name: packageName, version: release.version, ...(!publish ? { private: true } : { publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' } }), type: 'module', main: 'lib/index.mjs',
	files: ['lib/', 'assets/', 'cordis.patch.yml', 'README.md', 'LICENSE'],
	homepage: 'https://github.com/Sophiacyl/dsh-gacha-calendar-go',
	bugs: { url: 'https://github.com/Sophiacyl/dsh-gacha-calendar-go/issues' },
	keywords: ['dsh-go', 'dsh-plugin', 'gacha', 'calendar', 'android'],
	...(publish ? { peerDependencies: { '@deepseek-ai/cordis': '^4.0.1', '@deepseek-ai/dsh': '>=0.2.1-rc.2 <0.3.0-0' } } : {}),
	description: '二游日历的 dsh-go 手机原生适配：关注游戏、活动详情、倒计时与手动刷新。', license: 'MIT',
	repository: { type: 'git', url: 'git+https://github.com/Sophiacyl/dsh-gacha-calendar-go.git' },
	engines: { node: '>=20', dsh: '>=0.2.1-rc.2 <0.3.0-0' },
	dsh: { bundle: { patch: './cordis.patch.yml' } },
	dshGo: { v: 1, minApp: '1.0.13', title: { zh: '二游日历 · 手机版', en: 'Gacha Calendar Go' }, icon: 'calendar', assets: 'assets', wants: [], contributes: {
		'composer.actions': [{ id: 'open-calendar', label: '二游日历', icon: 'calendar', effect: { type: 'open', page: 'panel:calendar' } }],
		panels: [{ id: 'calendar', title: '二游日历', icon: 'calendar', placement: ['session.tab', 'features', 'chat.panel'] }],
	} },
}, null, 2) + '\n')
await writeFile(join(out, 'cordis.patch.yml'), `- insert:\n    - id: ${packageName}\n      name: ${packageName}\n`)
console.log(`Built mobile plugin: ${out}`)
