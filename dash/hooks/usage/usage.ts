/**
 * What the session has spent: its cost in dollars, how long it has run, and
 * the account's rate-limit windows (5 hours, the week, a gateway's spend
 * limit), each with what is used and when it resets. Pure, so the tests
 * reach it without an engine.
 *
 * The figures are the status line's, as `$.session.usage()` answers them:
 * one the engine does not have is left out, never zeroed. Off a
 * subscription there is no window; where the host keeps no ledger, no cost.
 */

import type { SessionUsage } from 'claude-code'

import { say } from '../say'

/** How often the pane redraws so the durations age, in milliseconds. */
export const USAGE_TICK_MS = 60_000

/**
 * The colors a Session gauge fills with, by the share used: the lowest
 * share each starts from, green to red, in the effort gauges' tints.
 */
export const USAGE_COLORS: readonly { from: number; color: string }[] = [
  { from: 0, color: '#6ee7b7' },
  { from: 50, color: '#facc15' },
  { from: 75, color: '#fb923c' },
  { from: 90, color: '#f87171' },
]

/**
 * The color a gauge fills with at that share used.
 *
 * @param percent the share used, 0 to 100 and past it
 * @returns green under 50 %, yellow under 75 %, orange under 90 %, red after
 */
export function usageColorOf(percent: number): string {
  return USAGE_COLORS.filter(step => percent >= step.from).at(-1)?.color ?? USAGE_COLORS[0]!.color
}

/**
 * One rate-limit window, as the pane draws it.
 */
export type LimitView = {
  /** Which window: `five_hour`, `seven_day`, `spend_limit` or another. */
  kind: string
  /** How much of it is used, 0 to 100, past it on an exceeded spend limit. */
  percent: number
  /** How long until it resets, in milliseconds, where the engine says when. */
  resetsInMs?: number
}

/**
 * What the Session frame shows of the session's spending.
 */
export type UsageView = {
  /** What the session has cost, in US dollars, where the host keeps a ledger. */
  usd?: number
  /** How long the session has run, in milliseconds, where the engine says when it began. */
  elapsedMs?: number
  /** The rate-limit windows with a reading, the 5 hours first, then the week. */
  limits: LimitView[]
}

/** The order the windows are drawn in; one not named here comes after. */
const LIMIT_ORDER = ['five_hour', 'seven_day', 'spend_limit']

/**
 * The session's spending as the pane draws it, at that time.
 *
 * @param usage what `$.session.usage()` answered
 * @param now the time now, in `$.clock.now()`'s milliseconds
 * @returns the cost, the duration and the windows
 */
export function usageViewOf(usage: Pick<SessionUsage, 'startedAt' | 'rateLimits' | 'cost'>, now: number): UsageView {
  const rank = (kind: string): number => {
    const index = LIMIT_ORDER.indexOf(kind)

    return index === -1 ? LIMIT_ORDER.length : index
  }

  // An engine that predates a figure leaves it out: none is drawn for it.
  const limits = (usage.rateLimits ?? [])
    .map(limit => {
      const resetsAt = limit.resetsAt === undefined ? NaN : Date.parse(limit.resetsAt)

      return Number.isFinite(resetsAt)
        ? { kind: limit.kind, percent: limit.percentUsed, resetsInMs: Math.max(0, resetsAt - now) }
        : { kind: limit.kind, percent: limit.percentUsed }
    })
    .sort((a, b) => rank(a.kind) - rank(b.kind))

  return {
    ...(usage.cost === undefined ? {} : { usd: usage.cost.usd }),
    ...(Number.isFinite(usage.startedAt) ? { elapsedMs: Math.max(0, now - usage.startedAt) } : {}),
    limits,
  }
}

/**
 * A window's name as a person reads it.
 *
 * @param kind the window, as the engine names it
 * @returns its label, or the engine's name for a window the mod does not know
 */
export function limitLabelOf(kind: string): string {
  switch (kind) {
    case 'five_hour':
      return say().limitFiveHour
    case 'seven_day':
      return say().limitSevenDay
    case 'spend_limit':
      return say().limitSpend
    default:
      return `${kind}:`
  }
}

/**
 * A share used as a person reads it, one decimal at most.
 *
 * @param percent the share, 0 to 100
 * @returns `23,5 %`, `7 %`
 */
export function percentText(percent: number): string {
  const rounded = Math.round(percent * 10) / 10

  return `${String(rounded).replace('.', ',')} %`
}

/**
 * A duration as a person reads it, to the minute.
 *
 * @param ms the duration, in milliseconds
 * @returns `< 1 min`, `45 min`, `2 h 05`, `3 d 4 h` (the day's unit in the person's language)
 */
export function durationText(ms: number): string {
  const minutes = Math.floor(ms / 60_000)

  if (minutes < 1) {
    return '< 1 min'
  }

  if (minutes < 60) {
    return `${minutes} min`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours} h ${String(minutes % 60).padStart(2, '0')}`
  }

  return `${Math.floor(hours / 24)} ${say().dayUnit} ${hours % 24} h`
}
