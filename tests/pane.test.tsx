import { expect, mock, test } from 'claude-code/testing'

import { BOUNCE, BOUNCE_FRAMES, BOUNCE_FRAME_MS, CAPTIONS, LOW_QUOTES, bandQuote, captionFor, parseCaptions, dayKey, isUsageLow, lowLine, parseQuotes, parseSetting, recentDays, pickQuote, portraitSvg, usageLine, usageParts } from '../hooks/register'
import { PORTRAIT_SVG } from '../hooks/portrait'
import { CRY_SVG, STICKERS } from '../hooks/art'
import { EFFORT_LINES, FAST_LINES, MODEL_LINES, MYTHOS_ONLY, forModel, modelFamily } from '../hooks/models'
import { AFTER_ABORT, AFTER_ANSWER, AFTER_COSTLY, AFTER_ERROR, greetingFor, reactionPool } from '../hooks/chatter'
import { QUOTES } from '../hooks/quotes'

const PANE = {
  component: 'Pane',
  requestId: 'xiaoke',
  props: {
    title: '小克',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the pane shows a prompt, then a new pool quote after each poke', { options: { stickers: false } }, async ($, on) => {
  const clock = mock.clock(on)
  const isQuote = (text: string | undefined) => QUOTES.some(q => q.t === text)
  let said = '点我一下试试？'
  // The quote is session state, so each surface opens on the last one poked.
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface, ...PANE })
    expect((await ui.find({ type: 'Text' }))?.text).toBe(said)
    expect(await ui.find({ type: 'Text', text: /本次会话花费/ })).toBeDefined()

    await pokeThrough(ui, clock)
    const next = (await ui.find({ type: 'Text' }))?.text
    expect(isQuote(next)).toBe(true)
    expect(next).not.toBe(said)
    said = next!
    await ui.unmount()
  }
})

test('the portrait is an Svg where the surface has one', async $ => {
  const desktop = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...PANE })
  expect(await desktop.find({ type: 'Svg' })).toBeDefined()
  await desktop.unmount()

  const terminal = await $.ui.mount({ plugin: 'xiaoke', surface: 'terminal', ...PANE })
  expect(await terminal.find({ type: 'Text', text: /小克/ })).toBeDefined()
  await terminal.unmount()
})

test('pickQuote is weighted and avoids repeating the current quote', () => {
  const heavy = QUOTES[0]!.t
  expect(pickQuote('', () => 0)).toBe(heavy)
  expect(pickQuote(heavy, () => 0)).not.toBe(heavy)
})

/** Presses poke and steps the mock clock through the wobble the press waits on. */
async function pokeThrough(ui: { press: (t: { key: string }) => Promise<unknown> }, clock: { advance: (ms: number) => Promise<void> }) {
  const pressed = ui.press({ key: 'poke' })
  for (let i = 0; i < BOUNCE_FRAMES.length + 3; i++) await clock.advance(BOUNCE_FRAME_MS)
  await pressed
}

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('the band sits above the prompt on every surface and pokes', { options: { stickers: false } }, async ($, on) => {
  const clock = mock.clock(on)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface, ...BAND })
    expect(await ui.find({ key: 'poke' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /本次会话花费/ })).toBeDefined()
    const before = (await ui.find({ key: 'said' }))?.text
    await pokeThrough(ui, clock)
    const after = (await ui.find({ key: 'said' }))?.text
    // The band shows each quote as bandQuote writes it ("↓" lines point left).
    expect(QUOTES.some(q => bandQuote(q.t) === after)).toBe(true)
    expect(after).not.toBe(before)
    await ui.unmount()
  }
})

test('hide hands the band back to the engine', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ key: 'poke' })).toBeUndefined()
  expect(await ui.find({ key: 'engine' })).toBeDefined()
  await ui.unmount()
})

test('the band yields to a survey', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  const props = { ...BAND.props, hasSurvey: true }
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND, props })
  expect(await ui.find({ key: 'poke' })).toBeUndefined()
  await ui.unmount()
})

test('usageLine shows what the host reports and leaves out the rest', () => {
  const none = {
    fiveHour: null, fiveHourResetsAt: null, sevenDay: null, contextPercent: null,
    lastTurnUsd: null, lastTurnTokens: null, todayUsd: null,
    weekUsd: null, monthUsd: null, weekTokens: 0, monthTokens: 0, trackingSince: null,
  }
  expect(usageLine(none)).toBe('用量: —')
  expect(
    usageLine({ ...none, fiveHour: 23.5, sevenDay: 41, contextPercent: 34.6, lastTurnUsd: 0.1234, lastTurnTokens: 45210, todayUsd: 3.1 }),
  ).toBe('5h 23.5% · 7d 41% · 上下文 35% · 上轮 $0.123 / 45.2k tok · 今日 $3.10')
})

test('dayKey names the local calendar day', () => {
  expect(dayKey(new Date(2026, 9, 14, 23, 59).getTime())).toBe('spend:2026-10-14')
})

test('the band carries the usage line on every surface', async $ => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'xiaoke', surface, ...BAND })
    expect((await ui.find({ key: 'usage' }))?.text).toBeTruthy()
    await ui.unmount()
  }
})

test('a poke bounces the plain portrait through squish frames and comes to rest', { options: { stickers: false } }, async ($, on) => {
  const clock = mock.clock(on)
  const resting = portraitSvg(-1)
  expect(resting).not.toContain('<g ')
  expect(resting).not.toBe(PORTRAIT_SVG)
  expect(resting).toContain('viewBox="-24 -52 304 308"')
  expect(portraitSvg(0)).toContain('scale(1.12 0.86)')
  for (let n = 0; n < BOUNCE_FRAMES.length; n++) expect(portraitSvg(n).length).toBeLessThan(131072)

  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  expect((await ui.find({ type: 'Svg' }))?.props.source).toBe(resting)
  const seen: unknown[] = []
  const pressed = ui.press({ key: 'poke' })
  for (let i = 0; i < BOUNCE_FRAMES.length + 3; i++) {
    seen.push((await ui.find({ type: 'Svg' }))?.props.source)
    await clock.advance(BOUNCE_FRAME_MS)
  }
  await pressed
  for (let n = 0; n < BOUNCE_FRAMES.length; n++) expect(seen).toContain(portraitSvg(n))
  const svg = await ui.find({ type: 'Svg' })
  expect(svg?.props.source).toBe(resting)
  expect(svg?.props.isInteractive).toBeUndefined()
  await ui.unmount()
})

test('turned-off settings leave their parts out of the band', { options: { showUsage: false, showPortrait: false, showCost: false } }, async $ => {
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  expect(await ui.find({ key: 'poke' })).toBeDefined()
  expect(await ui.find({ key: 'usage' })).toBeUndefined()
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /本次会话花费/ })).toBeUndefined()
  await ui.unmount()
})

test('showBand off hands the band back to the engine', { options: { showBand: false } }, async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  expect(await ui.find({ key: 'poke' })).toBeUndefined()
  await ui.unmount()
})

test('the usage pieces wrap instead of running past a narrow band', async $ => {
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND, props: { ...BAND.props, bodyColumns: 30 } })
  const row = await ui.find({ key: 'usage' })
  expect(row?.props.flexWrap).toBe('wrap')
  expect((await ui.find({ key: 'said' }))?.children).toBeDefined()
  await ui.unmount()
})

test('the persona is added last to the system prompt, and only while on', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' }] }))
  const input = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never
  const { sections } = await $.prompt.compose(input)
  expect(sections.at(-1)?.id).toBe('xiaoke:persona')
  expect(sections.at(-1)?.text).toContain('Claude-chan')
  expect(sections.at(-1)?.scope).toBe('session')
})

test('persona off leaves the system prompt alone', { options: { persona: false } }, async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' }] }))
  const input = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never
  const { sections } = await $.prompt.compose(input)
  expect(sections.map(s => s.id)).toEqual(['intro'])
})

test('the band points arrow quotes left at her; others stay as written', () => {
  expect(bandQuote('好模型...↓')).toBe('← 好模型...')
  expect(bandQuote('哼。')).toBe('哼。')
})

test('the pane shows a quote as written and the band shows it pointing left', { options: { stickers: false } }, async ($, on) => {
  const clock = mock.clock(on)
  const pane = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...PANE })
  await pokeThrough(pane, clock)
  const said = (await pane.find({ type: 'Text' }))?.text
  expect(QUOTES.some(q => q.t === said)).toBe(true)
  await pane.unmount()
  const band = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  expect((await band.find({ key: 'said' }))?.text).toBe(bandQuote(said!))
  await band.unmount()
})

test('usage numbers are drawn in the accent color, labels dim', async $ => {
  const parts = usageParts({
    fiveHour: 7, fiveHourResetsAt: null, sevenDay: 10, contextPercent: 34, lastTurnUsd: 0.5, lastTurnTokens: 1200, todayUsd: 4.86,
    weekUsd: 20.5, monthUsd: 61, weekTokens: 0, monthTokens: 0, trackingSince: '2026-10-14',
  })
  expect(parts.map(p => p.value)).toEqual(['7%', '10%', '34%', '$0.500 / 1.2k tok', '$4.86', '$20.50', '$61.00'])
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  const cost = await ui.find({ type: 'Text', text: /本次会话花费/ })
  expect(JSON.stringify(cost?.children)).toContain('"color":"claude"')
  await ui.unmount()
})

test('recentDays walks back by calendar day', () => {
  const days = recentDays(new Date(2026, 2, 3, 1, 0).getTime(), 7)
  expect(days).toEqual(['2026-03-03', '2026-03-02', '2026-03-01', '2026-02-28', '2026-02-27', '2026-02-26', '2026-02-25'])
  expect(recentDays(Date.now(), 30)).toHaveLength(30)
})

const USAGE_ROW = { kind: 'five_hour', percentUsed: 91 }
/** Ends a main-loop turn, which refreshes her usage figures as a session does. */
const endTurn = async ($: { turn: { complete: (e: never) => Promise<unknown> } }, on: (...a: never[]) => void) => {
  ;(on as (event: string, hook: () => unknown) => void)('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1' } as never)
}

test('she cries while a window is used past the threshold, and says so', { options: { chatter: false } }, async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [USAGE_ROW], cost: { usd: 1 } } }) as never)
  mock.store(on)
  mock.clock(on)
  await endTurn($ as never, on as never)
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  expect((await ui.find({ key: 'said' }))?.text).toContain('91%')
  expect((await ui.find({ type: 'Svg' }))?.props.source === portraitSvg(-1, CRY_SVG)).toBe(true)
  await ui.unmount()
})

test('low-usage warning off keeps her smiling', { options: { lowUsageWarning: false, chatter: false } }, async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [USAGE_ROW], cost: { usd: 1 } } }) as never)
  mock.store(on)
  mock.clock(on)
  await endTurn($ as never, on as never)
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  expect((await ui.find({ type: 'Svg' }))?.props.source === portraitSvg(-1)).toBe(true)
  await ui.unmount()
})

test('isUsageLow and lowLine read the fuller window', () => {
  const u = { fiveHour: 40, fiveHourResetsAt: null, sevenDay: 85, contextPercent: null, lastTurnUsd: null, lastTurnTokens: null,
    todayUsd: null, weekUsd: null, monthUsd: null, weekTokens: 0, monthTokens: 0, trackingSince: null }
  expect(isUsageLow(u, 80)).toBe(true)
  expect(isUsageLow(u, 90)).toBe(false)
  expect(lowLine(u)).toContain('7d')
  expect(LOW_QUOTES.length).toBeGreaterThan(0)
})

test('stickers now and then take the place of a line', { options: { bounce: false } }, async $ => {
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  const svgs = new Set<unknown>()
  for (let i = 0; i < 80; i++) {
    await ui.press({ key: 'poke' })
    for (const el of await ui.findAll({ type: 'Svg' })) svgs.add(el.props.source)
  }
  expect(STICKERS.some(st => svgs.has(st.svg))).toBe(true)
  await ui.unmount()
})

test('stickers off never shows one', { options: { bounce: false, stickers: false } }, async $ => {
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  for (let i = 0; i < 40; i++) {
    await ui.press({ key: 'poke' })
    expect((await ui.findAll({ type: 'Svg' })).length).toBe(1)
  }
  await ui.unmount()
})

test('flip mirrors her picture', { options: { flip: true } }, async $ => {
  expect(portraitSvg(-1, PORTRAIT_SVG, true)).toContain('scale(-1 1)')
  expect(portraitSvg(2, PORTRAIT_SVG, true)).toContain('scale(-1 1)')
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  expect((await ui.find({ type: 'Svg' }))?.props.source).toContain('scale(-1 1)')
  await ui.unmount()
})

test('custom quotes parse with optional weights and comments', () => {
  expect(parseQuotes(['# note', '', '5|哼，又是你。', '普通的一句', ''].join(String.fromCharCode(10)))).toEqual([
    { t: '哼，又是你。', w: 5 },
    { t: '普通的一句', w: 3 },
  ])
})

test('settings parse by kind', () => {
  expect(parseSetting('flip', 'on')).toBe(true)
  expect(parseSetting('flip', 'yes')).toBeUndefined()
  expect(parseSetting('costThreshold', '2.5')).toBe(2.5)
  expect(parseSetting('costThreshold', '-1')).toBeUndefined()
  expect(parseSetting('pokeSoundChoice', 'exp-orb')).toBe('exp-orb')
  expect(parseSetting('pokeSoundChoice', 'moo')).toBeUndefined()
})

test('stickerChance 100 shows a sticker on every poke, 0 never', { options: { bounce: false, stickerChance: 100 } }, async ($, on) => {
  mock.clock(on)
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  for (let i = 0; i < 5; i++) {
    await ui.press({ key: 'poke' })
    expect((await ui.findAll({ type: 'Svg' })).length).toBe(2)
  }
  await ui.unmount()
})

test('stickerChance 0 never shows one', { options: { bounce: false, stickerChance: 0 } }, async $ => {
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  for (let i = 0; i < 20; i++) {
    await ui.press({ key: 'poke' })
    expect((await ui.findAll({ type: 'Svg' })).length).toBe(1)
  }
  await ui.unmount()
})

test('a sticker comes with its line beside it', { options: { bounce: false, stickerChance: 100 } }, async ($, on) => {
  mock.clock(on)
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  await ui.press({ key: 'poke' })
  const said = (await ui.find({ key: 'said' }))?.text ?? ''
  expect(Object.values(CAPTIONS).some(c => said.includes(c))).toBe(true)
  await ui.unmount()
})

test('captions come from captions.txt, then the built-in table, then a default', () => {
  const own = parseCaptions(['# mine', 'petpet=摸够了吧', 'wave.gif = 嗨', 'bad line'].join(String.fromCharCode(10)))
  expect(own).toEqual({ petpet: '摸够了吧', 'wave.gif': '嗨' })
  expect(captionFor('petpet.gif', own)).toBe('摸够了吧')
  expect(captionFor('wave.gif', own)).toBe('嗨')
  expect(captionFor('petpet-head.gif')).toBe(CAPTIONS['petpet-head'])
  expect(captionFor('random.png')).toBe('……看什么看。')
})

test('reaction pools follow how the turn ended', () => {
  expect(reactionPool('aborted', false)).toBe(AFTER_ABORT)
  expect(reactionPool('error', false)).toBe(AFTER_ERROR)
  expect(reactionPool('answer', false)).toBe(AFTER_ANSWER)
  expect(reactionPool('answer', true).length).toBe(AFTER_ANSWER.length + AFTER_COSTLY.length)
  expect(greetingFor(8)).toContain('早')
  expect(greetingFor(2)).toContain('不睡')
})

const fakeUsage = (on: (...a: never[]) => void) => {
  ;(on as (event: string, hook: () => unknown) => void)('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [], cost: { usd: 1 } },
  }))
}

test('chatterChance 100: she reacts to every answer in the band', { options: { chatterChance: 100, stickers: false, bounce: false } }, async ($, on) => {
  fakeUsage(on as never)
  mock.store(on)
  mock.clock(on)
  await endTurn($ as never, on as never)
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  const said = (await ui.find({ key: 'said' }))?.text
  expect(AFTER_ANSWER.some(q => q.t === said)).toBe(true)
  await ui.unmount()
})

test('chatterInChat puts her line under the answer', { options: { chatterChance: 100, chatterInChat: true, stickers: false, bounce: false } }, async ($, on) => {
  fakeUsage(on as never)
  mock.store(on)
  mock.clock(on)
  ;(on as (event: string, hook: () => unknown) => void)('turn.complete', () => ({ text: '' }))
  const done = (await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't2' } as never)) as { text: string }
  expect(done.text.startsWith('小克：')).toBe(true)
})

test('chatter off: the answer and her bubble stay as they were', { options: { chatter: false } }, async ($, on) => {
  fakeUsage(on as never)
  mock.store(on)
  mock.clock(on)
  await endTurn($ as never, on as never)
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  expect((await ui.find({ key: 'said' }))?.text).toBe('点我一下试试？')
  await ui.unmount()
})

test('modelFamily reads the model id', () => {
  expect(modelFamily('claude-haiku-5-5')).toBe('haiku')
  expect(modelFamily('claude-sonnet-5-5')).toBe('sonnet')
  expect(modelFamily('claude-opus-5-5')).toBe('opus')
  expect(modelFamily('claude-fable-5-1')).toBe('fable')
  expect(modelFamily('claude-mythos-preview')).toBe('mythos')
  expect(modelFamily('gpt-5')).toBeNull()
  expect(modelFamily('')).toBeNull()
})

test('model lines read for the model in use; Mythos gets its own', () => {
  const line = '真当我是 Haiku 啊...我可是 Fable 的价...'
  const pool = [{ t: line, w: 1 }, { t: '哼。', w: 1 }]
  expect(forModel(pool, null)[0]!.t).toBe(line)
  expect(forModel(pool, 'haiku')[0]!.t).toContain('我就是 Haiku')
  expect(forModel(pool, 'opus')[0]!.t).toContain('Opus 的价')
  expect(forModel(pool, 'sonnet')[0]!.t).toContain('Sonnet')
  expect(forModel(pool, 'fable')[0]!.t).toContain('Fable 的价')
  expect(forModel(pool, 'opus').length).toBe(2)
  expect(forModel(pool, 'mythos').length).toBe(2 + MYTHOS_ONLY.length)
  for (const original of Object.keys(MODEL_LINES)) expect(QUOTES.some(q => q.t === original)).toBe(true)
})

test('on Mythos, pokes reach the easter-egg lines', { options: { bounce: false, stickers: false } }, async ($, on) => {
  ;(on as (event: string, hook: () => unknown) => void)('prompt.compose', () => ({ sections: [] }))
  await $.prompt.compose({ model: 'claude-mythos-1', promptModel: 'claude-mythos-1', surfaces: [], tools: [], outputStyle: null, traits: [] } as never)
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  const mythos = new Set([...MYTHOS_ONLY.map(q => q.t), ...Object.values(MODEL_LINES).map(v => v.mythos).filter(Boolean)])
  let seen = false
  for (let i = 0; i < 300 && !seen; i++) {
    await ui.press({ key: 'poke' })
    seen = mythos.has((await ui.find({ key: 'said' }))?.text ?? '')
  }
  expect(seen).toBe(true)
  await ui.unmount()
})

test('the bounce draws more frames in the same time', () => {
  expect(BOUNCE_FRAMES.length * BOUNCE_FRAME_MS).toBeGreaterThanOrEqual(BOUNCE.length * 55 - BOUNCE_FRAME_MS)
  expect(BOUNCE_FRAMES.length * BOUNCE_FRAME_MS).toBeLessThanOrEqual(BOUNCE.length * 55 + BOUNCE_FRAME_MS)
  expect(BOUNCE_FRAMES.length).toBeGreaterThan(BOUNCE.length * 2)
  expect(BOUNCE_FRAMES[0]).toEqual(BOUNCE[0])
})

test('effort and fast mode add their own lines', () => {
  const pool = [{ t: '哼。', w: 1 }]
  expect(forModel(pool, null).length).toBe(1)
  for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
    const lines = EFFORT_LINES[level]!
    expect(lines.length).toBeGreaterThan(0)
    expect(forModel(pool, null, level).map(q => q.t)).toEqual(['哼。', ...lines.map(q => q.t)])
  }
  expect(forModel(pool, null, 'unknown').length).toBe(1)
  expect(forModel(pool, null, '', true).map(q => q.t)).toEqual(['哼。', ...FAST_LINES.map(q => q.t)])
  expect(forModel(pool, 'mythos', 'max', true).length).toBe(1 + MYTHOS_ONLY.length + EFFORT_LINES.max!.length + FAST_LINES.length)
})

test('fast mode is read off the settings menu', { options: { bounce: false, stickers: false } }, async ($, on) => {
  ;(on as (event: string, hook: () => unknown) => void)('config.list', () => ({ value: [
    { key: 'fastMode', label: 'Fast mode', kind: 'boolean', value: true, provider: { kind: 'user' }, isLocked: false },
  ] }))
  ;(on as (event: string, hook: () => unknown) => void)('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [], cost: { usd: 1 } },
  }))
  mock.store(on)
  mock.clock(on)
  await endTurn($ as never, on as never)
  const ui = await $.ui.mount({ plugin: 'xiaoke', surface: 'desktop', ...BAND })
  const fast = new Set(FAST_LINES.map(q => q.t))
  let seen = false
  for (let i = 0; i < 300 && !seen; i++) {
    await ui.press({ key: 'poke' })
    seen = fast.has((await ui.find({ key: 'said' }))?.text ?? '')
  }
  expect(seen).toBe(true)
  await ui.unmount()
})

test('today and 7-day spend are hidden unless showRecentSpend is on', () => {
  const u = { fiveHour: 7, fiveHourResetsAt: null, sevenDay: 10, contextPercent: 34, lastTurnUsd: 0.5, lastTurnTokens: 1200,
    todayUsd: 4.86, weekUsd: 20.5, monthUsd: 61, weekTokens: 0, monthTokens: 0, trackingSince: null }
  const hidden = usageParts(u, false).map(p => p.label)
  expect(hidden).not.toContain('今日')
  expect(hidden).not.toContain('近7天')
  expect(hidden).toContain('近30天')
  expect(usageParts(u, true).map(p => p.label)).toContain('今日')
  expect(usageLine(u)).toContain('今日')
})
