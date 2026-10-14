# 小克 · Claude Code 桌宠 mod

把 Claude 拟人「小克」请进 Claude Code（终端与桌面版 Code 标签页）：她待在输入框上方，戳一下会冒出各种 Claude 味的碎碎念，还会帮你盯着用量和花费。

> 本 mod 移植自 DSH 插件 [aklnaaw/dsh-xiaoke-widget](https://github.com/aklnaaw/dsh-xiaoke-widget)（其本身二创自 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)），用 Claude Code 的 mod 接口重写。

## 能做什么

- **输入框上方的小克**：立绘 + 台词 + 「戳一下小克」「藏起来」按钮；窗口窄时自动换行，不会被截断。
- **戳一下**：随机台词（80 多句，按权重抽取），附带软乎乎的弹跳动画和「吱」声。
- **表情贴纸**：偶尔用贴纸代替台词，每张都配一句台词；支持 GIF 动图贴纸（需要 ffmpeg）。
- **认得出模型**：提到 Haiku / Sonnet / Opus / Fable 的台词会随当前使用的模型变化；用 Mythos 的话……会有彩蛋。思考强度（low～max）和快速模式也各有专属台词。
- **会自己说话**：一轮对话结束后，有一定几率按结果（回答完成 / 被打断 / 出错 / 这轮很贵）自己吐槽一句；新会话开始时按时间打招呼。
- **用量面板**：本次会话花费、5 小时 / 7 天额度、上下文占用、上一轮花费与 token、今日 / 近 7 天 / 近 30 天花费（从安装当天开始累计）。重要数字用橙色标出。
- **额度快用完时**：5h 或 7d 额度用到阈值（默认 80%）以上，小克会换成哭脸，并提醒你省着点。
- **音效**：回答结束、请求授权、Claude 向你提问、单轮花费超过阈值时各有提示音。
- **Claude-chan 人设**（可关）：在系统提示词末尾加入傲娇、理性、嘴硬心软的「Claude 酱」人设，只影响语气，不影响代码质量。
- **面板模式**：`/xiaoke pane` 打开更大的侧边面板。
- **自定义**：自己的台词、立绘、贴纸、音效放进 `custom/` 文件夹即可，详见 [`custom/README.txt`](custom/README.txt)。

## 安装

在**终端**里的 Claude Code 中输入（桌面版的 Code 标签页不支持 `/plugin` 命令，但在终端装好后，桌面版的会话也会自动加载）：

```
/plugin install xiaoke --marketplace Orangeboi69/claudeapp-claude-chan
```

按提示输入 `y` 添加 marketplace，选择 user 范围即可。之后每个新会话都会出现小克。

也可以 clone 到本地后从文件夹安装：

```bash
claude plugin marketplace add <本仓库的本地路径>
claude plugin install xiaoke@xiaoke-mods
```

### 音效（可选，建议）

音效来自上游项目，按上游说明「原样提供」，本仓库**不直接分发**。在本仓库根目录运行一次下载脚本即可：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\fetch-sounds.ps1
```

Windows 上播放音效需要 **ffmpeg**（用其中的 `ffplay`；没有时退回系统播放器，开头可能被截掉一点）。GIF 贴纸同样需要 ffmpeg。

## 命令

| 命令 | 作用 |
|---|---|
| `/xiaoke` | 显示 / 隐藏输入框上方的小克 |
| `/xiaoke pane` | 打开面板 |
| `/xiaoke usage` | 查看用量与近 7 / 30 天统计 |
| `/xiaoke settings` | 列出全部设置 |
| `/xiaoke set <设置> <值>` | 修改设置，如 `/xiaoke set stickerChance 25` |
| `/xiaoke sound [名称]` | 试听音效：`poke`、`turn-end`、`approve`、`ask`、`cost` |
| `/xiaoke reload` | 重新读取 `custom/` 与用量 |
| `/xiaoke status` | 查看小克的状态与自定义内容加载情况 |

## 设置

全部设置都能用 `/xiaoke set` 修改（`on` / `off`、数字或选项），也会出现在 `/config` 菜单里。

| 设置 | 默认 | 说明 |
|---|---|---|
| `showBand` | on | 在输入框上方显示小克 |
| `showPortrait` | on | 显示立绘 |
| `flip` | off | 镜像翻转立绘 |
| `bounce` | on | 戳她时弹跳 |
| `stickers` / `stickerChance` | on / 12.5 | 贴纸开关 / 出现概率（%） |
| `pokeSound` / `pokeSoundChoice` | on / squeak | 戳一下的音效 / 选择 `squeak` 或 `exp-orb`（`exp-orb` 需自备 `sounds/exp-orb.wav`） |
| `turnEndSound` | on | 回答结束提示音 |
| `approvalSound` | on | 请求授权提示音 |
| `askSound` | on | Claude 提问提示音 |
| `costSound` / `costThreshold` | on / 1 | 单轮花费 ≥ 阈值（美元）时提示 |
| `lowUsageWarning` / `lowUsageThreshold` | on / 80 | 额度用到阈值（%）以上时哭脸提醒 |
| `showCost` / `showUsage` | on / on | 显示会话花费 / 用量面板 |
| `showRecentSpend` | off | 在小克旁边显示「今日」和「近7天」花费（`/xiaoke usage` 始终会列出） |
| `chatter` / `chatterChance` | on / 35 | 回合结束后自己说话 / 概率（%） |
| `chatterInChat` | off | 同时把她的那句话显示在回答下方 |
| `customContent` | on | 读取 `custom/` 文件夹 |
| `persona` | on | Claude-chan 人设 |

## 说明

- 小克的台词是固定句库随机抽取，不调用模型，不消耗 token；只有 `persona` 人设会在每次请求的系统提示词里多出约 300 token（大部分命中缓存）。
- 「今日 / 近 7 天 / 近 30 天」只统计装了本 mod 之后、且在加载了小克的会话里完成的回合。
- 速率额度（5h / 7d）只在订阅账号下有数据。

## 致谢与许可

- **代码**：MIT，见 [`LICENSE`](LICENSE)。底子来自 MeteorNOX 的原项目与 aklnaaw 的小克二创。
- **小克立绘**（`hooks/portrait.ts` 内嵌的图片及由它裁切、加工出的所有图像，包括 `hooks/art.ts` 与 `custom/stickers/`）：**CC BY-NC-SA 4.0**，见 [`LICENSE-ARTWORK`](LICENSE-ARTWORK)。哭脸静帧取自 [AirsEDA](https://github.com/AirsEDA) 制作的动态小克。`custom/stickers/` 中的表情贴纸以该立绘为参考、借助图像模型生成，同样按 CC BY-NC-SA 4.0 发布。**禁止商用**。
- **音效**：不随本仓库分发，由 `scripts/fetch-sounds.ps1` 从上游下载，来源说明见 [`SOUNDS-PROVENANCE.md`](SOUNDS-PROVENANCE.md)。
- **Claude-chan 人设**提示词由社区贡献。本项目为同人二创，与 Anthropic 官方无关。
