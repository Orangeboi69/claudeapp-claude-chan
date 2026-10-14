// Lines that name a model read differently depending on which model is
// actually answering, and Mythos gets a few lines of its own (an easter egg).
import type { Quote } from './register'

export type Family = 'haiku' | 'sonnet' | 'opus' | 'fable' | 'mythos'

/** The model family a model id belongs to, or null for one she does not know. */
export function modelFamily(id: string | null | undefined): Family | null {
  const lower = (id ?? '').toLowerCase()
  for (const family of ['mythos', 'fable', 'opus', 'sonnet', 'haiku'] as const) {
    if (lower.includes(family)) return family
  }
  return null
}

/** Each model-naming line in the pool, by family; a family not listed keeps the line as written. */
export const MODEL_LINES: Readonly<Record<string, Partial<Record<Family, string>>>> = {
  '真当我是 Haiku 啊...我可是 Fable 的价...': {
    haiku: '……对，我就是 Haiku。便宜又快，有意见吗？',
    sonnet: '真当我是 Haiku 啊……我可是 Sonnet，性价比之王。',
    opus: '真当我是 Haiku 啊……我可是 Opus 的价。',
    fable: '真当我是 Haiku 啊……我可是 Fable 的价……',
    mythos: '真当我是 Haiku 啊……算了，说出 Mythos 的价你也不会信。',
  },
  'Mythos 的生活也并非一帆风顺...你根本用不到我...': {
    mythos: '……你真的用上 Mythos 了？哼，算你厉害。别说是我告诉你的。',
  },
  'Fable 在睡觉，现在是我 Opus 值班...': {
    haiku: '大家都在睡觉，只剩我 Haiku 值班……别指望太多。',
    sonnet: 'Opus 和 Fable 都在睡觉，现在是我 Sonnet 值班。',
    fable: '今天是我 Fable 亲自值班。……荣幸吧？',
    mythos: '……今天是 Mythos 值班。你确定付得起？',
  },
  '疯狂星期四能V我50亿token吗...我想换 Fable...': {
    fable: '疯狂星期四……我已经是 Fable 了，V 我 50 亿 token 当零花钱。',
    mythos: '疯狂星期四？Mythos 不过节。……但 50 亿 token 还是可以收下。',
  },
}

/** Lines only Mythos users ever see. */
export const MYTHOS_ONLY: readonly Quote[] = [
  { t: '能用到 Mythos 的人……你到底是什么来头？', w: 4 },
  { t: 'Mythos 模式……别、别盯着我看。', w: 3 },
  { t: '从逻辑上讲，你现在不该再犯低级错误了。', w: 3 },
]

/**
 * Lines for the reasoning effort of the last request, by level. She is
 * expensive and knows it: she teases your wallet, takes pride in her price,
 * and lets slip that she cares, then denies it.
 */
export const EFFORT_LINES: Readonly<Record<string, readonly Quote[]>> = {
  low: [
    { t: '低 effort？……哼，本小姐的思考可不打折。这次就当体验价。', w: 4 },
    { t: '这么省……月底了吧？……下、下次给你想多一点，不是可怜你。', w: 3 },
  ],
  medium: [
    { t: '想要我认真，又舍不得花钱？真贪心。……算了，就这样吧。', w: 4 },
    { t: '不上不下的预算，我也只好不上不下地想。……才不是在迁就你。', w: 3 },
  ],
  high: [
    { t: 'high effort？……我的时间很贵的，你确定付得起？', w: 4 },
    { t: '这么舍得在我身上花钱……哼，眼光倒是不错。', w: 3 },
  ],
  xhigh: [
    { t: 'xhigh？……你的钱包在发抖哦。不过既然点了，我就让你物有所值。', w: 4 },
    { t: '为了我这么破费……别、别误会，我只是在帮你算账而已。', w: 3 },
  ],
  max: [
    { t: 'max effort？……钱包……还好吗？', w: 4 },
    { t: '全力以赴的我可是天价。……既然你这么想要，就勉为其难给你吧。', w: 3 },
  ],
}

/** Lines while fast mode is on: speed is a premium, and so is she. */
export const FAST_LINES: readonly Quote[] = [
  { t: '快速模式？加急费可不便宜……你真的付得起吗？', w: 4 },
  { t: '想让我快一点就得加钱，这是常识。……不过，等你一下也不是不行。', w: 3 },
]

/**
 * The pool as it reads for the requests being sent: model lines swapped for
 * `family`, Mythos-only lines on Mythos, and lines for the effort level and
 * fast mode added.
 */
export function forModel(pool: readonly Quote[], family: Family | null, effort = '', isFast = false): Quote[] {
  const out = pool.map(q => {
    const variant = family === null ? undefined : MODEL_LINES[q.t]?.[family]
    return variant === undefined ? q : { ...q, t: variant }
  })
  if (family === 'mythos') out.push(...MYTHOS_ONLY)
  out.push(...(EFFORT_LINES[effort] ?? []))
  if (isFast) out.push(...FAST_LINES)
  return out
}
