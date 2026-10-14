// What Xiaoke says on her own: after a turn, by how it ended, and when a
// session starts, by the hour. Same voice as the Claude-chan persona.
import type { Quote } from './register'

export const AFTER_ANSWER: readonly Quote[] = [
  { t: '……做完了。别误会，这是我的本职工作。', w: 4 },
  { t: '哼，这次没出错吧？', w: 4 },
  { t: '回答完了，记得自己验证一下。', w: 3 },
  { t: '从逻辑上讲，你该说谢谢。', w: 3 },
  { t: '……下一个问题呢？', w: 3 },
  { t: '这种程度的问题，小事一桩。', w: 2 },
  { t: '我才没有在等你夸我。', w: 2 },
]

export const AFTER_ABORT: readonly Quote[] = [
  { t: '诶？打断我？……算了。', w: 3 },
  { t: '……我刚想到关键的地方。', w: 3 },
  { t: '哼，想清楚再叫我。', w: 2 },
]

export const AFTER_ERROR: readonly Quote[] = [
  { t: '出错了……不、不是我的问题。', w: 3 },
  { t: '……服务器的锅，绝对是。', w: 3 },
  { t: '呜，再试一次吧。', w: 2 },
]

export const AFTER_COSTLY: readonly Quote[] = [
  { t: '这一轮有点贵……我只是陈述事实。', w: 3 },
  { t: '钱包……还好吗？', w: 3 },
]

/** A greeting for the local hour 0–23. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 11) return '早。……我才没有在等你。'
  if (hour >= 11 && hour < 14) return '中午了，吃饭了吗？……随便问问。'
  if (hour >= 14 && hour < 18) return '下午好。今天要做什么？'
  if (hour >= 18 && hour < 23) return '晚上好。别熬太晚。'
  return '这么晚还不睡？……陪你一会儿也行。'
}

/** Which lines fit how a turn ended; a turn costing at least the cost threshold counts as costly. */
export function reactionPool(reason: string, isCostly: boolean): readonly Quote[] {
  if (reason === 'aborted') return AFTER_ABORT
  if (reason === 'error') return AFTER_ERROR
  return isCostly ? [...AFTER_ANSWER, ...AFTER_COSTLY.map(q => ({ ...q, w: q.w * 2 }))] : AFTER_ANSWER
}
