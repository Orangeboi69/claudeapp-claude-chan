import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnUsage } from 'claude-code'

import type { Usage } from '../types'

import { CRY_SVG, STICKERS } from './art'
import { greetingFor, reactionPool } from './chatter'
import { forModel, modelFamily } from './models'
import { PERSONA } from './persona'
import { PORTRAIT_SVG } from './portrait'
import { QUOTES } from './quotes'

const PANE = 'xiaoke'
const TITLE = '小克'
const PROMPT = '点我一下试试？'
const quote = atom({ plugin: 'xiaoke', key: 'quote' } as const, '')
const sticker = atom({ plugin: 'xiaoke', key: 'sticker' } as const, -1)
const stickerFrame = atom({ plugin: 'xiaoke', key: 'stickerFrame' } as const, 0)
const stickerPlays = atom({ plugin: 'xiaoke', key: 'stickerPlays' } as const, 0)
/** The id of the model answering the main loop, as the last request named it. */
const model = atom({ plugin: 'xiaoke', key: 'model' } as const, '')
/** The reasoning effort of the last main-loop request (`low` … `max`), or '' when none was set. */
const effort = atom({ plugin: 'xiaoke', key: 'effort' } as const, '')
/** Whether fast mode was on at the last finished turn, as the settings menu says. */
const isFastMode = atom({ plugin: 'xiaoke', key: 'isFastMode' } as const, false)
const costUsd = atom({ plugin: 'xiaoke', key: 'costUsd' } as const, null as number | null)
const isBandHidden = atom({ plugin: 'xiaoke', key: 'isBandHidden' } as const, false)
const NO_USAGE: Usage = {
  fiveHour: null,
  fiveHourResetsAt: null,
  sevenDay: null,
  contextPercent: null,
  lastTurnUsd: null,
  lastTurnTokens: null,
  todayUsd: null,
  weekUsd: null,
  monthUsd: null,
  weekTokens: 0,
  monthTokens: 0,
  trackingSince: null,
}
const usage = atom({ plugin: 'xiaoke', key: 'usage' } as const, NO_USAGE)
const pokes = atom({ plugin: 'xiaoke', key: 'pokes' } as const, 0)
const bounceFrame = atom({ plugin: 'xiaoke', key: 'bounceFrame' } as const, -1)

/**
 * The plushie bounce a poke plays, one frame every BOUNCE_MS: squish, spring
 * up, land with a second squish, settle. `sx`/`sy` scale her about her feet,
 * `dy` lifts her (negative is up).
 */
export const BOUNCE = [
  { sx: 1.12, sy: 0.86, dy: 0 },
  { sx: 1.16, sy: 0.8, dy: 0 },
  { sx: 0.9, sy: 1.12, dy: -8 },
  { sx: 0.94, sy: 1.08, dy: -16 },
  { sx: 1, sy: 1, dy: -18 },
  { sx: 0.97, sy: 1.04, dy: -8 },
  { sx: 1.1, sy: 0.9, dy: 0 },
  { sx: 0.96, sy: 1.05, dy: 0 },
  { sx: 1.03, sy: 0.97, dy: 0 },
] as const
const BOUNCE_MS = 55

/** How often the bounce draws a frame: the poses above are eased between at this rate. */
export const BOUNCE_FRAME_MS = 20

/**
 * The bounce at BOUNCE_FRAME_MS per frame: each pose of BOUNCE holds its
 * BOUNCE_MS slot as before, so the bounce takes as long as ever, and the
 * frames between poses are eased so the squish moves instead of jumping.
 */
export const BOUNCE_FRAMES: readonly { sx: number; sy: number; dy: number }[] = (() => {
  const poses = [...BOUNCE, { sx: 1, sy: 1, dy: 0 }]
  const total = BOUNCE.length * BOUNCE_MS
  const ease = (t: number) => t * t * (3 - 2 * t)
  const out: { sx: number; sy: number; dy: number }[] = []
  for (let at = 0; at < total; at += BOUNCE_FRAME_MS) {
    const k = Math.floor(at / BOUNCE_MS)
    const a = poses[k]!
    const b = poses[k + 1]!
    const t = ease((at - k * BOUNCE_MS) / BOUNCE_MS)
    const mix = (x: number, y: number) => Math.round((x + (y - x) * t) * 1000) / 1000
    out.push({ sx: mix(a.sx, b.sx), sy: mix(a.sy, b.sy), dy: mix(a.dy, b.dy) })
  }
  return out
})()

/** How long an animated sticker plays when a poke shows it, and each frame's time. */
export const STICKER_PLAY_MS = 2400
export const STICKER_FRAME_MS = 60

/** Lines she says while usage is running low; they join the pool then, weighted up. */
export const LOW_QUOTES: readonly { t: string; w: number }[] = [
  { t: '呜……额度快用完了……', w: 12 },
  { t: '别、别再让我想了，额度要没了……', w: 8 },
  { t: '……省着点用，这不是撒娇。', w: 8 },
  { t: '从逻辑上讲，现在该休息一下了。', w: 6 },
]

export type Quote = { t: string; w: number }

/** Weighted pick from the pool, never the quote already showing when avoidable. */
export function pickQuote(current: string, roll: () => number = Math.random, pool: readonly Quote[] = QUOTES): string {
  const total = pool.reduce((sum, q) => sum + q.w, 0)
  for (let attempt = 0; attempt < 5; attempt++) {
    let r = roll() * total
    for (const q of pool) {
      r -= q.w
      if (r < 0) {
        if (q.t !== current) return q.t
        break
      }
    }
  }
  return pool.find(q => q.t !== current)?.t ?? current
}

function costLine(usd: number | null): string {
  return usd === null ? '本次会话花费: —' : `本次会话花费: $${usd.toFixed(4)}`
}

/** One figure of the info rows: a dim label and the number drawn in orange. */
export type Figure = { label: string; value: string }

function costFigure(usd: number | null): Figure {
  return { label: '本次会话花费:', value: usd === null ? '—' : `$${usd.toFixed(4)}` }
}

/**
 * A quote as the band shows it. Some lines end in "↓", pointing down at her
 * the way the pane stacks her under the bubble; the band seats her to the
 * left of the text, so there the arrow points left and leads the line.
 */
export function bandQuote(text: string): string {
  return text.endsWith('↓') ? `← ${text.slice(0, -1).trimEnd()}` : text
}

/** A picture as an Svg the surfaces draw: the PNG bytes embedded, `size` px square. */
export function pictureSvg(base64: string, size: number): string {
  const href = `data:image/png;base64,${base64}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<image width="${size}" height="${size}" href="${href}" xlink:href="${href}"/></svg>`
  )
}

/**
 * The portrait at frame `n` of BOUNCE, or resting for any other `n`, drawn
 * from `base` (a 256 px picture Svg) and mirrored when `isFlipped`. A still
 * picture each time: the desktop draws a plain Svg but drops an interactive
 * one, so the bounce is these drawn in turn, not an animation in the markup.
 */
export function portraitSvg(n: number, base: string = PORTRAIT_SVG, isFlipped = false): string {
  // Room around her for the squish and the hop, so no frame is cut at the
  // edge; every frame, the resting one too, uses the same box so she never jumps.
  let svg = base.replace(
    'viewBox="0 0 256 256" width="256" height="256"',
    'viewBox="-24 -52 304 308" width="304" height="308"',
  )
  if (isFlipped) svg = svg.replace('<image', '<g transform="translate(256 0) scale(-1 1)"><image').replace('</svg>', '</g></svg>')
  const f = BOUNCE_FRAMES[n]
  if (f === undefined) return svg
  const t = `translate(0 ${f.dy}) translate(128 250) scale(${f.sx} ${f.sy}) translate(-128 -250)`
  const at = svg.indexOf('<g transform="translate(256') === -1 ? '<image' : '<g transform="translate(256'
  return svg.replace(at, `<g transform="${t}">${at}`).replace('</svg>', '</g></svg>')
}

/** Whether a rate-limit window is used past `threshold` percent. */
export function isUsageLow(u: Usage, threshold: number): boolean {
  return (u.fiveHour ?? 0) >= threshold || (u.sevenDay ?? 0) >= threshold
}

/** What she says unprompted while usage runs low: the fuller window and how full. */
export function lowLine(u: Usage): string {
  const isFiveHour = (u.fiveHour ?? 0) >= (u.sevenDay ?? 0)
  const pct = isFiveHour ? u.fiveHour : u.sevenDay
  return `呜……${isFiveHour ? '5h' : '7d'} 额度已用 ${pct}%，省着点……`
}

/**
 * What a poke does: each sticker's frame count (none when stickers are off),
 * how likely a sticker is, the lines it picks from, its sound and bounce.
 */
export type Poke = {
  stickerFrames: readonly { count: number; ms: number }[]
  stickerChance: number
  pool: readonly Quote[]
  squeak: string | null
  isBouncing: boolean
}

/** A poke: a new line or, now and then, a sticker; then the sound, the bounce and any animation. */
async function poke($: EngineInterface, p: Poke) {
  const plays: Promise<void>[] = []
  if (p.stickerFrames.length > 0 && Math.random() < p.stickerChance) {
    const n = Math.floor(Math.random() * p.stickerFrames.length)
    await update($, sticker, () => n)
    plays.push(playSticker($, p.stickerFrames[n] ?? { count: 1, ms: STICKER_FRAME_MS }))
  } else {
    await update($, sticker, () => -1)
    await update($, quote, current => pickQuote(current, Math.random, p.pool))
  }
  plays.push(bounce($, p.squeak, p.isBouncing))
  await Promise.all(plays)
}

/**
 * What she says on her own after a turn: maybe a sticker (by the sticker
 * chance), else a line from `pool`, with a bounce but no squeak. Resolves to
 * the line, or null when she showed a sticker, as soon as it shows.
 */
async function chatter($: EngineInterface, pool: readonly Quote[], p: Poke): Promise<string | null> {
  let said: string | null = null
  const plays: Promise<void>[] = []
  if (p.stickerFrames.length > 0 && Math.random() < p.stickerChance) {
    const n = Math.floor(Math.random() * p.stickerFrames.length)
    await update($, sticker, () => n)
    plays.push(playSticker($, p.stickerFrames[n] ?? { count: 1, ms: STICKER_FRAME_MS }))
  } else {
    await update($, sticker, () => -1)
    said = await update($, quote, current => pickQuote(current, Math.random, pool))
  }
  plays.push(bounce($, null, p.isBouncing))
  // The animation runs on its own: the turn it reacts to never waits for it.
  Promise.all(plays).catch(() => {})
  return said
}

/** Steps an animated sticker's frames for STICKER_PLAY_MS, then rests on its first; a newer poke stops it. */
async function playSticker($: EngineInterface, timing: { count: number; ms: number }) {
  const frames = timing.count
  const mine = await update($, stickerPlays, n => n + 1)
  await update($, stickerFrame, () => 0)
  if (frames <= 1) return
  // Frames follow the clock, as the bounce's do: a slow redraw skips frames
  // instead of slowing the sticker down.
  const start = await $.clock.now()
  let shown = 0
  for (;;) {
    await $.clock.sleep(timing.ms)
    if ((await read($, stickerPlays)) !== mine) return
    const elapsed = (await $.clock.now()) - start
    if (elapsed >= Math.max(STICKER_PLAY_MS, frames * timing.ms)) break
    const n = Math.floor(elapsed / timing.ms) % frames
    if (n !== shown) {
      await update($, stickerFrame, () => n)
      shown = n
    }
  }
  if ((await read($, stickerPlays)) === mine) await update($, stickerFrame, () => 0)
}

/** Squeaks and plays the bounce, each if asked; a newer poke takes over and this one stops. */
async function bounce($: EngineInterface, squeak: string | null, isBouncing: boolean) {
  if (squeak !== null) void play($, squeak)
  if (!isBouncing) return
  const mine = await update($, pokes, n => n + 1)
  // Frames follow the clock, not a count: a slow redraw skips a frame
  // rather than stretching the bounce, so it always lasts the same time.
  const start = await $.clock.now()
  let shown = -1
  for (;;) {
    if ((await read($, pokes)) !== mine) return
    const n = Math.floor(((await $.clock.now()) - start) / BOUNCE_FRAME_MS)
    if (n >= BOUNCE_FRAMES.length) break
    if (n !== shown) {
      await update($, bounceFrame, () => n)
      shown = n
    }
    await $.clock.sleep(BOUNCE_FRAME_MS)
  }
  if ((await read($, pokes)) === mine) await update($, bounceFrame, () => -1)
}

function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/**
 * The usage figures as separate pieces, leaving out what the host does not
 * report; today's and the last 7 days' spend only when `showRecent`.
 */
export function usageParts(u: Usage, showRecent = true): Figure[] {
  const parts: Figure[] = []
  if (u.fiveHour !== null) parts.push({ label: '5h', value: `${u.fiveHour}%` })
  if (u.sevenDay !== null) parts.push({ label: '7d', value: `${u.sevenDay}%` })
  if (u.contextPercent !== null) parts.push({ label: '上下文', value: `${Math.round(u.contextPercent)}%` })
  if (u.lastTurnUsd !== null) {
    const tok = u.lastTurnTokens === null ? '' : ` / ${tokens(u.lastTurnTokens)} tok`
    parts.push({ label: '上轮', value: `$${u.lastTurnUsd.toFixed(3)}${tok}` })
  }
  if (showRecent && u.todayUsd !== null) parts.push({ label: '今日', value: `$${u.todayUsd.toFixed(2)}` })
  if (showRecent && u.weekUsd !== null) parts.push({ label: '近7天', value: `$${u.weekUsd.toFixed(2)}` })
  if (u.monthUsd !== null) parts.push({ label: '近30天', value: `$${u.monthUsd.toFixed(2)}` })
  return parts
}

/** The usage figures as one line. */
export function usageLine(u: Usage): string {
  const parts = usageParts(u)
  return parts.length === 0 ? '用量: —' : parts.map(p => `${p.label} ${p.value}`).join(' · ')
}

/** The local calendar day of a clock reading, as `YYYY-MM-DD`. */
export function dayName(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The key a day's spend is kept under in the store, across sessions. */
export function dayKey(ms: number): string {
  return `spend:${dayName(ms)}`
}

/** The key a day's tokens are kept under in the store, across sessions. */
export function tokenKey(ms: number): string {
  return `tokens:${dayName(ms)}`
}

/**
 * The last `days` calendar days ending with the day of `ms`, newest first, as
 * `YYYY-MM-DD`. Steps by calendar day rather than by 24 hours, so a change to
 * or from daylight saving time neither skips a day nor counts one twice.
 */
export function recentDays(ms: number, days: number): string[] {
  const d = new Date(ms)
  d.setHours(12, 0, 0, 0)
  const out: string[] = []
  for (let n = 0; n < days; n++) {
    out.push(dayName(d.getTime()))
    d.setDate(d.getDate() - 1)
  }
  return out
}

/** Sums the numbers kept under `prefix:<day>` for the given days; a day never written counts 0. */
async function sumDays($: EngineInterface, prefix: string, days: readonly string[]): Promise<number> {
  let total = 0
  for (const day of days) {
    const value = await $.store.get(`${prefix}:${day}`)
    if (typeof value === 'number') total += value
  }
  return total
}

/**
 * Reads the status line's figures into the band's state. With a finished
 * main-loop turn, also adds what it cost to today's total across sessions.
 */
async function refreshUsage($: EngineInterface, turn?: { usage?: TurnUsage }) {
  const now = await $.session.usage()
  const sessionUsd = now.cost?.usd ?? null
  const before = await read($, costUsd)
  await update($, costUsd, () => sessionUsd)

  const at = await $.clock.now()
  const key = dayKey(at)
  const stored = await $.store.get(key)
  let todayUsd = typeof stored === 'number' ? stored : 0
  let lastTurnUsd: number | null = null
  if (turn && sessionUsd !== null && before !== null) {
    lastTurnUsd = Math.max(0, sessionUsd - before)
    todayUsd += lastTurnUsd
    await $.store.set(key, todayUsd)
  }
  const t = turn?.usage
  const turnTokens = t
    ? t.input_tokens + t.output_tokens + t.cache_read_input_tokens + t.cache_creation_input_tokens
    : null
  if (turnTokens !== null) {
    const kept = await $.store.get(tokenKey(at))
    await $.store.set(tokenKey(at), (typeof kept === 'number' ? kept : 0) + turnTokens)
  }
  // The first day this mod tracked anything: totals before it are unknown.
  let since = await $.store.get('since')
  if (typeof since !== 'string' && turn) {
    since = dayName(at)
    await $.store.set('since', since)
  }
  const week = recentDays(at, 7)
  const month = recentDays(at, 30)
  const window = (kind: string) => now.rateLimits.find(r => r.kind === kind)
  const hasLedger = sessionUsd !== null
  const weekUsd = hasLedger ? await sumDays($, 'spend', week) : null
  const monthUsd = hasLedger ? await sumDays($, 'spend', month) : null
  const weekTokens = await sumDays($, 'tokens', week)
  const monthTokens = await sumDays($, 'tokens', month)

  await update($, usage, last => ({
    fiveHour: window('five_hour')?.percentUsed ?? null,
    fiveHourResetsAt: window('five_hour')?.resetsAt ?? null,
    sevenDay: window('seven_day')?.percentUsed ?? null,
    contextPercent: now.context.percent ?? null,
    lastTurnUsd: turn ? lastTurnUsd : last.lastTurnUsd,
    lastTurnTokens: turnTokens ?? last.lastTurnTokens,
    todayUsd: hasLedger ? todayUsd : null,
    weekUsd,
    monthUsd,
    weekTokens,
    monthTokens,
    trackingSince: typeof since === 'string' ? since : null,
  }))
}

/**
 * Plays one of the mod's clips, a path under its folder. `$.audio.play` has
 * no player on Windows and skips silently there, so Windows plays through
 * ffplay, which plays the whole clip; .NET's SoundPlayer, which cuts its
 * start off, is the fallback when ffplay is not installed. Resolves to what
 * happened, for `/xiaoke sound`; never rejects.
 */
async function play($: EngineInterface, asset: string): Promise<string> {
  const root = $.plugin.root
  if (!/^[A-Za-z]:[\\/]/.test(root)) {
    try {
      await $.audio.play({ asset })
      return `played ${asset}`
    } catch (error) {
      return `$.audio.play failed: ${String(error)}`
    }
  }

  const path = `${root}\\${asset.replaceAll('/', '\\')}`
  try {
    const { exitCode, stderr } = await $.process.run(
      ['ffplay', '-nodisp', '-autoexit', '-loglevel', 'error', path],
      { timeoutMs: 15000 },
    )
    if (exitCode === 0) return `played ${asset} (ffplay)`
    return `ffplay exited ${exitCode}: ${stderr.trim().slice(0, 300)}`
  } catch {
    // ffplay is not on PATH: fall through to SoundPlayer.
  }

  try {
    const quoted = path.replaceAll("'", "''")
    const { exitCode, stderr } = await $.process.run(
      ['powershell', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${quoted}').PlaySync()`],
      { timeoutMs: 15000 },
    )
    return exitCode === 0 ? `played ${asset} (SoundPlayer, no ffplay)` : `powershell exited ${exitCode}: ${stderr.trim().slice(0, 300)}`
  } catch (error) {
    return `powershell failed: ${String(error)}`
  }
}

/** The clips she plays, by the name `/xiaoke sound <name>` and the custom folder use. */
export const CLIPS = ['poke', 'turn-end', 'approve', 'ask', 'cost'] as const
type Clip = (typeof CLIPS)[number]

const BUILTIN_CLIPS: Record<Exclude<Clip, 'poke'>, string> = {
  'turn-end': 'sounds/task-end.wav',
  approve: 'sounds/approve.wav',
  ask: 'sounds/ask.wav',
  cost: 'sounds/cost.wav',
}

/** A sticker as drawn: its frames, one Svg each, how long each shows, and the line she says beside it. */
export type Sticker = { frames: string[]; frameMs: number; caption: string }

/** The lines her built-in stickers, and the petpet ones, come with. */
export const CAPTIONS: Readonly<Record<string, string>> = {
  face: '……盯——',
  cry: '呜……才、才没有哭。',
  petpet: '……别摸了，头发会乱的。',
  'petpet-cry': '呜呜，摸摸也没用……',
  'petpet-head': '哼，就、就一下。',
}
const DEFAULT_CAPTION = '……看什么看。'

/**
 * The line a sticker comes with: from `captions.txt` (`name=line`), else
 * from CAPTIONS by its name without the extension, else a default.
 */
export function captionFor(file: string, own: Readonly<Record<string, string>> = {}): string {
  const name = file.replace(/\.[^.]+$/, '')
  return own[name] ?? own[file] ?? CAPTIONS[name] ?? DEFAULT_CAPTION
}

/** Parses `custom/stickers/captions.txt`: `name=line` per line, `#` comments. */
export function parseCaptions(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const at = line.indexOf('=')
    if (line === '' || line.startsWith('#') || at < 1) continue
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return out
}

/** Caps on the person's own pictures: an Svg holds at most 131,072 characters. */
const MAX_PORTRAIT_BYTES = 90_000
const MAX_STICKER_BYTES = 60_000
const MAX_STICKERS = 40
const MAX_STICKER_FRAMES = 30
const ANIMATED = ['.gif', '.webp', '.apng']

/** What the person put in the mod's `custom` folder, as loaded at session start. */
export type Custom = {
  quotes: Quote[]
  portrait: string | null
  /** Each sticker as its frames (one Svg each; a still sticker has one) and the line beside it. */
  stickers: Sticker[]
  sounds: Partial<Record<Clip, string>>
  /** What was loaded or skipped, for `/xiaoke status`. */
  notes: string[]
}

const NO_CUSTOM: Custom = { quotes: [], portrait: null, stickers: [], sounds: {}, notes: [] }

/**
 * Parses `custom/quotes.txt`: one line per quote; `#` starts a comment line;
 * `5|text` gives a line weight 5, otherwise it weighs 3.
 */
export function parseQuotes(text: string): Quote[] {
  const out: Quote[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const m = /^(\d+)\|(.+)$/.exec(line)
    out.push(m ? { t: m[2]!.trim(), w: Math.max(1, Number(m[1])) } : { t: line, w: 3 })
  }
  return out
}

/**
 * A sticker's frames from PNG files: the one named `only` in `folder`, or
 * every PNG in `folder` in name order. Resolves to why not, as a string,
 * when a frame is too big or there is none.
 */
async function framesOfFolder($: EngineInterface, folder: string, only?: string): Promise<string[] | string> {
  const names = only !== undefined
    ? [only]
    : (await $.fs.list(folder))
        .filter(f => f.kind === 'file' && f.name.toLowerCase().endsWith('.png'))
        .map(f => f.name)
        .sort()
        .slice(0, MAX_STICKER_FRAMES)
  if (names.length === 0) return 'no PNG frames'
  const frames: string[] = []
  for (const name of names) {
    const { size } = await $.fs.stat(`${folder}/${name}`)
    if (size > MAX_STICKER_BYTES) return `${name} is ${size} bytes, over ${MAX_STICKER_BYTES}`
    const { base64 } = await $.fs.read(`${folder}/${name}`, { as: 'bytes' })
    frames.push(pictureSvg(base64, 96))
  }
  return frames
}

/**
 * An animated sticker's frames: ffmpeg splits the GIF (or animated WebP/APNG)
 * into PNG frames once, into `custom/.frames/<name>-<size>/`, and later loads
 * read that folder. A new file of another size is split afresh.
 */
async function framesOfAnimation($: EngineInterface, dir: string, name: string, size: number): Promise<string[] | string> {
  const cache = `${dir}/.frames/${name.replace(/[^\w.-]/g, '_')}-${size}`
  const hasFrames = (await $.fs.exists(cache)) && (await $.fs.list(cache)).some(f => f.name.endsWith('.png'))
  if (!hasFrames) {
    await $.fs.write(`${cache}/.source`, `${name}\n`)
    try {
      const { exitCode, stderr } = await $.process.run(
        ['ffmpeg', '-v', 'error', '-y', '-i', `${dir}/stickers/${name}`, '-fps_mode', 'passthrough',
          '-frames:v', String(MAX_STICKER_FRAMES), '-vf', 'scale=w=128:h=128:force_original_aspect_ratio=decrease',
          `${cache}/%03d.png`],
        { timeoutMs: 30000 },
      )
      if (exitCode !== 0) return `ffmpeg exited ${exitCode}: ${stderr.trim().slice(0, 200)}`
    } catch (error) {
      return `ffmpeg is needed to split it into frames: ${String(error)}`
    }
  }
  return framesOfFolder($, cache)
}

/** Reads the `custom` folder; anything missing, too big or unreadable is skipped and noted. */
async function loadCustom($: EngineInterface): Promise<Custom> {
  const dir = `${$.plugin.root}/custom`
  if (!(await $.fs.exists(dir))) return NO_CUSTOM
  const custom: Custom = { quotes: [], portrait: null, stickers: [], sounds: {}, notes: [] }

  try {
    if (await $.fs.exists(`${dir}/quotes.txt`)) {
      custom.quotes = parseQuotes(await $.fs.read(`${dir}/quotes.txt`))
      custom.notes.push(`${custom.quotes.length} quotes`)
    }
  } catch (error) {
    custom.notes.push(`quotes.txt skipped: ${String(error)}`)
  }

  try {
    if (await $.fs.exists(`${dir}/portrait.png`)) {
      const { size } = await $.fs.stat(`${dir}/portrait.png`)
      if (size > MAX_PORTRAIT_BYTES) {
        custom.notes.push(`portrait.png skipped: ${size} bytes, over ${MAX_PORTRAIT_BYTES}`)
      } else {
        const { base64 } = await $.fs.read(`${dir}/portrait.png`, { as: 'bytes' })
        custom.portrait = pictureSvg(base64, 256)
        custom.notes.push('portrait')
      }
    }
  } catch (error) {
    custom.notes.push(`portrait.png skipped: ${String(error)}`)
  }

  try {
    if (await $.fs.exists(`${dir}/stickers`)) {
      const own = (await $.fs.exists(`${dir}/stickers/captions.txt`))
        ? parseCaptions(await $.fs.read(`${dir}/stickers/captions.txt`))
        : {}
      const entries = (await $.fs.list(`${dir}/stickers`))
        .filter(f => !f.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name))
      for (const f of entries) {
        if (custom.stickers.length >= MAX_STICKERS) {
          custom.notes.push(`stickers past ${MAX_STICKERS} skipped`)
          break
        }
        const lower = f.name.toLowerCase()
        let frames: string[] | string
        if (f.kind === 'dir') frames = await framesOfFolder($, `${dir}/stickers/${f.name}`)
        else if (f.kind === 'file' && lower.endsWith('.png')) frames = await framesOfFolder($, `${dir}/stickers`, f.name)
        else if (f.kind === 'file' && ANIMATED.some(ext => lower.endsWith(ext))) frames = await framesOfAnimation($, dir, f.name, f.size)
        else continue
        if (typeof frames === 'string') {
          custom.notes.push(`sticker ${f.name} skipped: ${frames}`)
          continue
        }
        let frameMs = STICKER_FRAME_MS
        if (f.kind === 'dir' && (await $.fs.exists(`${dir}/stickers/${f.name}/frame-ms.txt`))) {
          const ms = Number((await $.fs.read(`${dir}/stickers/${f.name}/frame-ms.txt`)).trim())
          if (Number.isFinite(ms) && ms >= 15 && ms <= 1000) frameMs = ms
        }
        custom.stickers.push({ frames, frameMs, caption: captionFor(f.name, own) })
      }
      const moving = custom.stickers.filter(st => st.frames.length > 1).length
      if (custom.stickers.length > 0) custom.notes.push(`${custom.stickers.length} stickers (${moving} animated)`)
    }
  } catch (error) {
    custom.notes.push(`stickers skipped: ${String(error)}`)
  }

  for (const clip of CLIPS) {
    for (const ext of ['wav', 'mp3']) {
      if (await $.fs.exists(`${dir}/${clip}.${ext}`)) {
        custom.sounds[clip] = `custom/${clip}.${ext}`
        custom.notes.push(`${clip}.${ext}`)
        break
      }
    }
  }
  return custom
}

/** Reads fast mode off the settings menu; false where no row names it or the menu cannot be read. */
async function readFastMode($: EngineInterface): Promise<boolean> {
  try {
    const row = (await $.config.list()).find(r => /fast/i.test(r.key) && typeof r.value === 'boolean')
    return row?.value === true
  } catch {
    return false
  }
}

/** Every setting `userConfig` declares: its kind, its default and what it does. */
export const SETTINGS = {
  showBand: { kind: 'bool', default: true, title: 'Show Xiaoke above the prompt' },
  showPortrait: { kind: 'bool', default: true, title: 'Show her portrait' },
  flip: { kind: 'bool', default: false, title: 'Mirror her portrait' },
  bounce: { kind: 'bool', default: true, title: 'Bounce when poked' },
  stickers: { kind: 'bool', default: true, title: 'Sometimes show a sticker when poked' },
  stickerChance: { kind: 'number', default: 12.5, title: 'Percent of pokes that show a sticker' },
  pokeSound: { kind: 'bool', default: true, title: 'Sound when poked' },
  pokeSoundChoice: { kind: 'choice', default: 'squeak', choices: ['squeak', 'exp-orb'], title: 'Which poke sound' },
  turnEndSound: { kind: 'bool', default: true, title: 'Chime when a turn ends' },
  approvalSound: { kind: 'bool', default: true, title: 'Sound on approval prompts' },
  askSound: { kind: 'bool', default: true, title: 'Sound when Claude asks you a question' },
  costSound: { kind: 'bool', default: true, title: 'Sound when a turn costs a lot' },
  costThreshold: { kind: 'number', default: 1, title: 'A turn costing this many US dollars or more plays the cost sound' },
  lowUsageWarning: { kind: 'bool', default: true, title: 'Cry when usage runs low' },
  lowUsageThreshold: { kind: 'number', default: 80, title: 'Percent of the 5h or 7d window used that counts as low' },
  showCost: { kind: 'bool', default: true, title: 'Show session cost' },
  showUsage: { kind: 'bool', default: true, title: 'Show usage tracker' },
  showRecentSpend: { kind: 'bool', default: false, title: "Show today's and the last 7 days' spend in the band and pane" },
  customContent: { kind: 'bool', default: true, title: 'Use the quotes, pictures and sounds in her custom folder' },
  chatter: { kind: 'bool', default: true, title: 'Say something on her own now and then after a turn' },
  chatterChance: { kind: 'number', default: 35, title: 'Percent of finished turns she reacts to' },
  chatterInChat: { kind: 'bool', default: false, title: 'Also put her reaction line under the answer in the chat' },
  persona: { kind: 'bool', default: true, title: 'Claude-chan persona' },
} as const
type Setting = keyof typeof SETTINGS

const isSetting = (name: string): name is Setting => Object.hasOwn(SETTINGS, name)

/** Parses what `/xiaoke set <name> <value>` was given into the setting's kind, or undefined. */
export function parseSetting(name: Setting, value: string): boolean | number | string | undefined {
  const spec = SETTINGS[name]
  if (spec.kind === 'bool') return value === 'on' ? true : value === 'off' ? false : undefined
  if (spec.kind === 'number') {
    const n = Number(value)
    return value !== '' && Number.isFinite(n) && n >= 0 ? n : undefined
  }
  return (spec.choices as readonly string[]).includes(value) ? value : undefined
}

export const register: Register = (on, options) => {
  const isOn = (name: Setting) => {
    const value = options[name]
    return typeof value === 'boolean' ? value : SETTINGS[name].default === true
  }
  const numberOf = (name: 'costThreshold' | 'lowUsageThreshold' | 'stickerChance' | 'chatterChance') => {
    const value = options[name]
    return typeof value === 'number' ? value : SETTINGS[name].default
  }
  const pokeChoice = () => (options.pokeSoundChoice === 'exp-orb' ? 'exp-orb' : 'squeak')
  const valueOf = (name: Setting): string => {
    const spec = SETTINGS[name]
    if (spec.kind === 'bool') return isOn(name) ? 'on' : 'off'
    if (spec.kind === 'number') return String(numberOf(name as 'costThreshold' | 'lowUsageThreshold' | 'stickerChance' | 'chatterChance'))
    return pokeChoice()
  }

  // The custom folder as of the last session start or reload; the module's own.
  let custom: Custom = NO_CUSTOM
  const mine = () => (isOn('customContent') ? custom : NO_CUSTOM)
  const clipFor = (clip: Clip): string =>
    mine().sounds[clip] ?? (clip === 'poke' ? `sounds/${pokeChoice() === 'exp-orb' ? 'exp-orb' : 'squeak'}.wav` : BUILTIN_CLIPS[clip])
  const allStickers = (): Sticker[] => [
    ...STICKERS.map(st => ({ frames: [st.svg], frameMs: STICKER_FRAME_MS, caption: captionFor(st.name) })),
    ...mine().stickers,
  ]

  // What the band saw the last time the engine asked it to draw, for
  // `/xiaoke status`; the module's own, so a reload starts it over.
  let lastBand: { at: number; surface: string; hasSurvey: boolean; isHidden: boolean } | null = null

  /** What her portrait is drawn from now: her own picture, crying while usage is low, or the person's. */
  const baseFor = (u: Usage) => {
    const own = mine().portrait
    if (own !== null) return own
    return isOn('lowUsageWarning') && isUsageLow(u, numberOf('lowUsageThreshold')) ? CRY_SVG : PORTRAIT_SVG
  }
  const isLow = (u: Usage) => isOn('lowUsageWarning') && isUsageLow(u, numberOf('lowUsageThreshold'))

  /** What a poke does under the current settings, the custom folder and usage `u`. */
  const pokeFor = (u: Usage, req: { model: string; effort: string; isFast: boolean }): Poke => ({
    stickerFrames: isOn('stickers') ? allStickers().map(st => ({ count: st.frames.length, ms: st.frameMs })) : [],
    stickerChance: Math.min(100, numberOf('stickerChance')) / 100,
    pool: forModel([...QUOTES, ...mine().quotes, ...(isLow(u) ? LOW_QUOTES : [])], modelFamily(req.model), req.effort, req.isFast),
    squeak: isOn('pokeSound') ? clipFor('poke') : null,
    isBouncing: isOn('bounce') && isOn('showPortrait'),
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'xiaoke',
      description:
        '显示或隐藏输入框上方的小克。子命令：pane 打开面板 · usage 查看用量 · settings 列出设置 · set <设置> <值> 修改设置 · sound [名称] 试听音效 · reload 重新加载 · status 查看状态',
      argumentHint: '[pane|usage|settings|set <设置> <值>|sound [名称]|reload|status]',
    })
    custom = await loadCustom($)
    await refreshUsage($)
    const fast = await readFastMode($)
    await update($, isFastMode, () => fast)
    if (isOn('chatter') && (await read($, quote)) === '') {
      const hour = new Date(await $.clock.now()).getHours()
      await update($, quote, () => greetingFor(hour))
    }

    return next(e)
  })

  on('command.run', { command: 'xiaoke' }, async ($, e) => {
    const [verb = '', name = '', value = ''] = e.args.trim().split(/\s+/)
    if (verb === 'settings') {
      const lines = (Object.keys(SETTINGS) as Setting[]).map(
        key => `  ${valueOf(key).padEnd(7)} ${key.padEnd(18)} ${SETTINGS[key].title}`,
      )
      return {
        text: `小克 settings (change with /xiaoke set <setting> <value>: on/off, a number, or squeak/exp-orb):\n${lines.join('\n')}`,
      }
    }
    if (verb === 'set') {
      const parsed = isSetting(name) ? parseSetting(name, value) : undefined
      if (!isSetting(name) || parsed === undefined) {
        return { text: `Usage: /xiaoke set <setting> <value>, where <setting> is one of: ${Object.keys(SETTINGS).join(', ')}` }
      }
      const row = (await $.config.list()).find(r => r.key.endsWith(`.${name}`) && r.key.startsWith('xiaoke'))
      if (row === undefined) return { text: `小克: the settings menu has no row for ${name}.` }
      const { deny } = await $.config.set({ key: row.key, value: parsed })
      if (deny !== undefined) return { text: `小克: could not change ${name}: ${String(deny)}` }
      return { text: `小克: ${SETTINGS[name].title}: ${value}. She reloads with it in a moment.` }
    }
    if (verb === 'reload') {
      // Re-read what can change without new code: her custom folder and usage.
      custom = await loadCustom($)
      await refreshUsage($)
      // A mod cannot reload its own code; a save in its folder makes a watched
      // session reload it, so stamp a file there for the watcher to see.
      let code = 'her code reloads in a moment if this session watches her folder'
      try {
        await $.fs.write(`${$.plugin.root}/reload.stamp`, `${new Date().toISOString()}
`)
      } catch (error) {
        code = `could not stamp her folder for a code reload: ${String(error)}`
      }
      const own = custom.notes.length === 0 ? 'nothing' : custom.notes.join(', ')
      return { text: `小克 reloaded her custom folder (${own}) and usage; ${code}.` }
    }
    if (verb === 'sound') {
      const clip = (CLIPS as readonly string[]).includes(name) ? (name as Clip) : 'turn-end'
      return { text: `小克 sound test (${clip}): ${await play($, clipFor(clip))}` }
    }
    if (verb === 'status') {
      const isHidden = await read($, isBandHidden)
      const own = custom.notes.length === 0 ? 'none' : custom.notes.join(', ')
      const customLine = `custom folder (${isOn('customContent') ? 'on' : 'off'}): ${own}`
      if (lastBand === null) {
        return { text: `小克 status: hidden=${isHidden}; the band has not been asked to draw since the last reload\n${customLine}` }
      }
      const ago = Math.round((Date.now() - lastBand.at) / 1000)
      const why = lastBand.isHidden ? 'hidden' : lastBand.hasSurvey ? 'yielding to a question box' : 'drawn'
      return {
        text: `小克 status: hidden=${isHidden}; last band draw ${ago}s ago on ${lastBand.surface}: ${why} (hasSurvey=${lastBand.hasSurvey})\n${customLine}`,
      }
    }
    if (verb === 'usage') {
      await refreshUsage($)
      const u = await read($, usage)
      const resets = u.fiveHourResetsAt === null ? '' : `\n5h window resets at ${u.fiveHourResetsAt}`
      const money = (usd: number | null) => (usd === null ? '—' : `$${usd.toFixed(2)}`)
      const history = [
        `近7天: ${money(u.weekUsd)}, ${tokens(u.weekTokens)} tok`,
        `近30天: ${money(u.monthUsd)}, ${tokens(u.monthTokens)} tok`,
        u.trackingSince === null
          ? 'Tracking starts with the next finished turn.'
          : `Tracked since ${u.trackingSince}; turns before that, or in sessions without 小克, are not counted.`,
      ].join('\n')
      return { text: `小克 usage: ${usageLine(u)}\n${costLine(await read($, costUsd))}${resets}\n${history}` }
    }
    if (verb === 'pane') {
      await $.ui.open({ id: PANE, title: TITLE })

      return { text: '小克 is in her pane.' }
    }
    const isHidden = await update($, isBandHidden, hidden => !hidden)

    return { text: isHidden ? '小克 is hiding. /xiaoke brings her back.' : '小克 is here.' }
  })

  on('prompt.compose', async ($, e, next) => {
    if ((await read($, model)) !== e.model) await update($, model, () => e.model)
    const composed = await next(e)
    if (!isOn('persona')) return composed

    return { sections: [...composed.sections, { id: 'xiaoke:persona', text: PERSONA, scope: 'session' }] }
  })

  // turn.step streams: the hook passes every chunk through untouched.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const level = typeof e.effort === 'string' ? e.effort : ''
      if ((await read($, effort)) !== level) await update($, effort, () => level)
    }

    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      // A surface with no player skips the clip; a pet never fails a turn over it.
      if (e.reason === 'answer' && isOn('turnEndSound')) void play($, clipFor('turn-end'))
      await refreshUsage($, { usage: e.usage })
      const fast = await readFastMode($)
      if ((await read($, isFastMode)) !== fast) await update($, isFastMode, () => fast)
      const u = await read($, usage)
      const spent = u.lastTurnUsd
      const isCostly = spent !== null && spent >= numberOf('costThreshold')
      if (isOn('costSound') && isCostly) void play($, clipFor('cost'))
      if (isOn('chatter') && Math.random() < Math.min(100, numberOf('chatterChance')) / 100) {
        const req = { model: await read($, model), effort: await read($, effort), isFast: await read($, isFastMode) }
        const said = await chatter($, reactionPool(e.reason, isCostly), pokeFor(u, req))
        if (said !== null && isOn('chatterInChat') && e.reason === 'answer') {
          return { ...done, text: `小克：${said}` }
        }
      }
    }

    return done
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    if (isOn('approvalSound')) void play($, clipFor('approve'))

    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (isOn('askSound')) void play($, clipFor('ask'))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const isHidden = (await read($, isBandHidden)) || !isOn('showBand')
    lastBand = { at: Date.now(), surface: e.surface, hasSurvey: e.props.hasSurvey, isHidden }
    if (e.props.hasSurvey || isHidden) {
      return next(e)
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const said = await read($, quote)
    const shown = await read($, sticker)
    const shownFrame = await read($, stickerFrame)
    const usd = await read($, costUsd)
    const u = await read($, usage)
    const used = usageParts(u, isOn('showRecentSpend'))
    const frame = await read($, bounceFrame)
    const req = { model: await read($, model), effort: await read($, effort), isFast: await read($, isFastMode) }
    const showFigure = (f: Figure) => (
      <Text dimColor>
        {f.label} <Text color="claude">{f.value}</Text>
      </Text>
    )
    const idle = isLow(u) ? lowLine(u) : PROMPT
    // The terminal has no Svg; every remote surface draws the pictures.
    let portrait
    let bubble = (
      <Text color="claude" wrap="wrap">
        {bandQuote(said || idle)}
      </Text>
    )
    if (e.surface === 'terminal') {
      portrait = isOn('showPortrait') ? <Text color="claude">{isLow(u) ? '(╥﹏╥)' : '(=^･ω･^=)'}</Text> : null
    } else {
      const { Svg } = $.ui.resolve(e)
      portrait = isOn('showPortrait') ? (
        <Svg source={portraitSvg(frame, baseFor(u), isOn('flip'))} alt="小克" width={52} height={53} />
      ) : null
      const pic = allStickers()[shown]
      if (pic !== undefined) {
        bubble = (
          <Box flexDirection="row" alignItems="center" columnGap={1}>
            <Svg source={pic.frames[shownFrame] ?? pic.frames[0]!} alt="小克的表情" width={44} height={44} />
            <Text color="claude" wrap="wrap">
              {pic.caption}
            </Text>
          </Box>
        )
      }
    }
    const info = [...(isOn('showCost') ? [costFigure(usd)] : []), ...(isOn('showUsage') ? used : [])]

    // Two rows beside her: the quote with the buttons at its right, then the
    // figures. Each row wraps rather than running past the edge of a narrow window.
    return (
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {portrait}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" justifyContent="space-between" columnGap={1}>
            <Box key="said" flexShrink={1} minWidth={0}>
              {bubble}
            </Box>
            <Box flexDirection="row" columnGap={1}>
              <Button key="poke" label="戳一下小克" onPress={() => poke($, pokeFor(u, req))} />
              <Button key="hide" label="藏起来" dimColor onPress={() => update($, isBandHidden, () => true)} />
            </Box>
          </Box>
          {info.length > 0 && (
            <Box key={isOn('showUsage') ? 'usage' : 'info'} flexDirection="row" flexWrap="wrap" columnGap={1}>
              {isOn('showUsage') && used.length === 0 && <Text dimColor>用量: —</Text>}
              {info.map(showFigure)}
            </Box>
          )}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const said = await read($, quote)
    const shown = await read($, sticker)
    const shownFrame = await read($, stickerFrame)
    const usd = await read($, costUsd)
    const u = await read($, usage)
    const used = usageParts(u, isOn('showRecentSpend'))
    const frame = await read($, bounceFrame)
    const req = { model: await read($, model), effort: await read($, effort), isFast: await read($, isFastMode) }
    const showFigure = (f: Figure) => (
      <Text dimColor>
        {f.label} <Text color="claude">{f.value}</Text>
      </Text>
    )
    const idle = isLow(u) ? lowLine(u) : PROMPT
    let portrait
    let bubble = (
      <Text color="claude" wrap="wrap">
        {said || idle}
      </Text>
    )
    if (e.surface === 'terminal') {
      portrait = isOn('showPortrait') ? <Text color="claude">{isLow(u) ? '(╥﹏╥) 小克' : '(=^･ω･^=) 小克'}</Text> : null
    } else {
      const { Svg } = $.ui.resolve(e)
      portrait = isOn('showPortrait') ? (
        <Svg source={portraitSvg(frame, baseFor(u), isOn('flip'))} alt="小克" width={190} height={192} />
      ) : null
      const pic = allStickers()[shown]
      if (pic !== undefined) {
        bubble = (
          <Box flexDirection="column" alignItems="center">
            <Svg source={pic.frames[shownFrame] ?? pic.frames[0]!} alt="小克的表情" width={112} height={112} />
            <Text color="claude" wrap="wrap">
              {pic.caption}
            </Text>
          </Box>
        )
      }
    }

    return (
      <Box flexDirection="column" alignItems="center" gap={1}>
        <Box borderStyle="round" borderColor="claude" paddingX={1}>
          {bubble}
        </Box>
        {portrait}
        <Button key="poke" label="戳一下小克" onPress={() => poke($, pokeFor(u, req))} />
        {isOn('showCost') && showFigure(costFigure(usd))}
        {isOn('showUsage') && (
          <Box key="usage" flexDirection="row" flexWrap="wrap" gap={1}>
            {used.length === 0 ? <Text dimColor>用量: —</Text> : used.map(showFigure)}
          </Box>
        )}
      </Box>
    )
  })
}
