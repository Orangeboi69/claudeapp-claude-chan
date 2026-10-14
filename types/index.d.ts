/** The quote in Xiaoke's bubble; empty before the first click. */
export type Quote = string
/** Session cost in US dollars, refreshed when a turn ends; null where the host keeps no ledger. */
export type CostUsd = number | null

/** The usage figures the band and pane show; null where the host reports none. */
export type Usage = {
  /** Five-hour rate-limit window used, 0 to 100. */
  fiveHour: number | null
  fiveHourResetsAt: string | null
  /** Seven-day rate-limit window used, 0 to 100. */
  sevenDay: number | null
  /** Context window used, 0 to 100. */
  contextPercent: number | null
  /** What the last main-loop turn cost, in US dollars, and its tokens. */
  lastTurnUsd: number | null
  lastTurnTokens: number | null
  /** Spend today across this mod's sessions, in US dollars. */
  todayUsd: number | null
  /** Spend over the last 7 and 30 calendar days, today included, in US dollars. */
  weekUsd: number | null
  monthUsd: number | null
  /** Tokens over the last 7 and 30 calendar days, today included. */
  weekTokens: number
  monthTokens: number
  /** The first day the mod tracked a turn, `YYYY-MM-DD`; null before any. */
  trackingSince: string | null
}

declare module 'claude-code' {
  interface PluginState {
    xiaoke: { quote: Quote; costUsd: CostUsd; isBandHidden: boolean; usage: Usage; pokes: number; bounceFrame: number; sticker: number; stickerFrame: number; stickerPlays: number; model: string; effort: string; isFastMode: boolean }
  }
}
