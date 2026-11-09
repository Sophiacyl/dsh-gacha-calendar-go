# dsh-go 原生适配

本分支在上游 v0.13.0 基础上增加手机原生插件，保留上游源码、版本号和 MIT 版权声明。所有手机适配真源在 `mobile/`；不修改上游生成的 `lib/`、`packages/core/`。

## 构建和检查

在仓库根目录运行：

```sh
node build.mjs --check
(cd test && node all.mjs)
node --test mobile/*.test.mjs
node mobile/build.mjs
node "$HOME/.dsh/skills/dsh-go-plugin/kit/bin/check.mjs" dist/mobile --load
```

`mobile/build.mjs` 复制上游生成的 core.mjs 与手机真源，生成独立包 `local-gacha-calendar-go`。生成包沿用根版本号，设置 private，不包含发布脚本；打包时保留原 LICENSE。

手机本机安装：

```sh
node mobile/build.mjs "${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/local-gacha-calendar-go"
dsh plugin --profile web add "${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/local-gacha-calendar-go"
```

已有安装更新 lib 后，需要在 App 的引擎页重启引擎。插件目录不能删除，安装是本地链接。此包与原桌面插件并存。

## 功能及边界

- 输入框上方「二游日历」胶囊；对话插件页、全部功能和聊天插件弹层均有日历面板。
- 默认关注原神、星铁、绝区零、鸣潮、明日方舟、重返未来：1999；可在面板选择全部已登记游戏。
- 点游戏看卡池、活动、来源状态和倒计时；每分钟更新显示，不触发联网。
- 仅用户点刷新时联网；打开先读缓存。隐藏游戏不参与抓取，旧缓存保留。
- 游戏选择与缓存独立于原插件，保存于 `$DSH_HOME/dsh-go/data/local-gacha-calendar-go/calendar.json`。
- 默认只使用各游戏默认来源。源失败时如实提示，不自动切源；首版不提供来源编辑、自定义游戏、系统通知、后台自动刷新或日历导出。
- 未知开始时间不冒充进行中；过期或刷新失败沿用的数据明确标识。原生列表最多 44 个详情行，超出时显示未展示数量。
- App 原生显示由桥接组件渲染；检查器和测试宿主验证协议，不能代替用户设备上的视觉验收。

## 同步上游

`origin` 指向 Sophiacyl/dsh-gacha-calendar-go，`upstream` 指向 EastMG/dsh-gacha-calendar，开发分支为 mobile/dsh-go。同步上游后运行以上门禁并重建手机插件。推送需单独可用的 GitHub Git 凭据；浏览器登录不等于命令行已登录。不得推送到 upstream。
