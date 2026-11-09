# dsh-gacha-calendar-go

**为 DSH Go 手机原生界面适配的二游卡池与活动日历。**

基于 **EastMG/dsh-gacha-calendar** 开发，复用上游的游戏来源、抓取解析和缓存核心，增加适合手机触控的原生界面。

本项目是独立的手机适配分支，与游戏官方及上游作者均不存在官方合作关系。

## 功能

- **游戏日历**：查看关注游戏的卡池、活动、起止时间和倒计时。
- **类型区分**：蓝紫色 **✦ 卡池**、青绿色 **⚑ 活动**，同时保留文字标签。
- **游戏关注**：选择需要展示和刷新的游戏。
- **名称搜索**：在“选择游戏”页按游戏名称或内部 ID 筛选。
- **原游戏图标**：沿用上游使用的游戏图标，随手机插件保存。
- **手机排版**：长名称支持换行，游戏之间有分隔，每页展示 8 项。
- **手动刷新**：仅在点击刷新时联网；打开面板先读取本地缓存。
- **状态提示**：区分来源失败、暂无当期内容、未配置来源和沿用旧缓存。

上游核心目前登记了 **33 个游戏及服务器条目**。部分条目或数据来源可能暂不可用，实际结果以面板显示为准。

默认关注：原神、崩坏：星穹铁道、绝区零、鸣潮、明日方舟、重返未来：1999。

## 使用环境

需要支持原生插件面板和 v2 视图组件的 **DSH Go**，以及启用了 `dshGo` 桥接的主机。

本项目主要面向 Android 手机上的 DSH Go 本机引擎。旧版 App 可能退回文字列表，无法显示完整的配色与图片布局。

## 安装

在 DSH Go 本机引擎终端中执行：

```bash
git clone --branch mobile/dsh-go \
  https://github.com/Sophiacyl/dsh-gacha-calendar-go.git

cd dsh-gacha-calendar-go

node build.mjs --check

node mobile/build.mjs \
  "${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/local-gacha-calendar-go"

dsh plugin --profile web add \
  "${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/local-gacha-calendar-go"
```

这是本地构建安装方式，手机版尚未作为独立 npm 包发布。

安装后可通过以下入口打开：

- 输入框上方的「二游日历」。
- 对话详情中的插件页。
- App 的「全部功能」。

原桌面插件可以与手机版并存，两者的关注设置和缓存相互独立。

## 更新

在源码目录中执行：

```bash
git pull --ff-only

node build.mjs --check

node mobile/build.mjs \
  "${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/local-gacha-calendar-go"
```

更新代码后，在 App 的「引擎」页重启引擎。

安装使用本地目录链接，**请勿删除已安装的插件目录**。

## 数据与存储

游戏排期由上游核心从游戏官方公告、社区 Wiki 和第三方站点获取。数据可能因源站调整、网络限制或解析失败而延迟，请以游戏内公告为准。

手机插件的关注设置与缓存位于：

```text
$DSH_HOME/dsh-go/data/local-gacha-calendar-go/calendar.json
```

未设置 `DSH_HOME` 时，默认使用 `~/.dsh`。

游戏图标沿用上游图片来源。原始地址和文件校验值记录在 `mobile/assets/sources.json`，正常构建无需重新下载图标。

## 当前边界

手机版目前尚未提供：

- 系统通知及到期提醒。
- 后台自动刷新。
- 来源切换和自定义来源编辑。
- 自定义游戏条目。
- 系统日历导出。

倒计时每分钟更新显示，**不会因此自动联网刷新排期**。

## 开发

手机适配代码位于 `mobile/`，上游抓取与解析核心保持独立。

```bash
# 上游构建一致性
node build.mjs --check

# 上游回归测试
(cd test && node all.mjs)

# 手机适配测试
node --test mobile/*.test.mjs

# 构建手机插件
node mobile/build.mjs
```

构建产物默认位于 `dist/mobile/`。

安装了 DSH Go 插件开发技能的环境，还可以执行原生协议检查：

```bash
node \
  "${DSH_HOME:-$HOME/.dsh}/skills/dsh-go-plugin/kit/bin/check.mjs" \
  dist/mobile --load
```

更详细的安装、缓存和适配说明见 `mobile/DEVELOPMENT.md`。上游核心开发说明见 `README_Dev.md`。

## 上游与致谢

本项目基于 **EastMG/dsh-gacha-calendar**。感谢原作者提供游戏来源、解析器、缓存核心及原始界面设计。

同时保留上游对以下项目的致谢：

- MAA1999/M9A
- yoimiya-kokomi/miao-plugin
- jacket-sikaha/game-schedule
- BTMuli/ShufflePlay
- UIGF-org/mihoyo-api-collect
- Sekai-World/sekai-master-db-cn-diff

## 许可证与素材说明

项目代码采用 **MIT License**，保留上游版权声明，详见 `LICENSE`。

游戏名称、图标及公告内容的权利归各自权利人所有，不因项目代码采用 MIT 许可证而转移。本项目仅用于排期信息聚合展示。

如发现数据错误、兼容性问题或素材权利问题，请在 **Sophiacyl/dsh-gacha-calendar-go** 仓库提交 Issue。
