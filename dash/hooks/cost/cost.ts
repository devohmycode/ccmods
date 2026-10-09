/**
 * What a switch costs now: the prompt the last main request carried, and
 * whether the cache that holds it is likely still warm. A switch forfeits
 * that cache, so the next request writes the whole prompt again. Pure, so
 * the tests reach it without an engine.
 *
 * The tokens are measured: the API's own usage on the last main request.
 * The cache's state is inferred from that request's age, because no hook
 * reads the cache's TTL: 5 minutes by default, 1 hour on some accounts.
 */

import type { ModelUsage } from 'claude-code'

import { say } from '../say'

/** How long the prompt cache surely holds after a request, in milliseconds. */
export const WARM_MS = 5 * 60_000

/** How long the longest cache TTL holds, in milliseconds. */
export const LONG_TTL_MS = 60 * 60_000

/**
 * The last main request, as the next one will re-send it.
 */
export type LastRequest = {
  /** Its prompt and its answer, in tokens: what the next request carries at least. */
  tokens: number
  /** Whether any of it went through the prompt cache. */
  isCached: boolean
  /** When it was answered, in `$.clock.now()`'s milliseconds. */
  at: number
}

/**
 * The cache a switch would forfeit:
 * - `none`: no request yet, nothing to lose;
 * - `warm`: a request under 5 minutes ago, the cache surely holds;
 * - `maybe`: between 5 minutes and 1 hour, it holds only on a 1-hour TTL;
 * - `cold`: older, or never cached, a switch costs nothing more.
 */
export type CacheState = 'none' | 'warm' | 'maybe' | 'cold'

/**
 * What a switch costs now.
 */
export type SwitchCost = {
  /** The state of the cache it would forfeit. */
  state: CacheState
  /** The tokens the next request would write again, when there are any. */
  tokens?: number
}

/**
 * The tokens a request's prompt and answer add up to.
 *
 * @param usage what the API reported for the request, or null
 * @returns the last request's measure, without its time, or undefined
 */
export function measureOf(usage: ModelUsage | null | undefined): Omit<LastRequest, 'at'> | undefined {
  if (usage === null || usage === undefined) {
    return undefined
  }

  const cached = usage.cache_read_input_tokens + usage.cache_creation_input_tokens

  return { tokens: usage.input_tokens + cached + usage.output_tokens, isCached: cached > 0 }
}

/**
 * What a switch would cost at that time.
 *
 * @param last the last main request, or undefined before the first
 * @param now the time now, in milliseconds
 * @returns the cache's state and, where it may hold, the tokens at stake
 */
export function switchCostOf(last: LastRequest | undefined, now: number): SwitchCost {
  if (last === undefined) {
    return { state: 'none' }
  }

  const age = now - last.at

  if (!last.isCached || age >= LONG_TTL_MS) {
    return { state: 'cold' }
  }

  return { state: age < WARM_MS ? 'warm' : 'maybe', tokens: last.tokens }
}

/**
 * The pane's line on what a switch costs now.
 *
 * @param cost what a switch would cost
 * @returns the line
 */
export function costLineOf(cost: SwitchCost): string {
  switch (cost.state) {
    case 'none':
      return say().costNone
    case 'cold':
      return say().costCold
    case 'warm':
      return say().costWarm(tokensText(cost.tokens ?? 0))
    case 'maybe':
      return say().costMaybe(tokensText(cost.tokens ?? 0))
  }
}

/**
 * What a switch's notification adds: the tokens it forfeited, where the
 * cache may have held them; nothing otherwise.
 *
 * @param cost what the switch cost, as measured just before it
 * @returns the suffix, or the empty string
 */
export function costSuffixOf(cost: SwitchCost): string {
  return cost.tokens === undefined ? '' : say().costSuffix(tokensText(cost.tokens))
}

/**
 * A count of tokens as a person reads it.
 *
 * @param tokens the count
 * @returns `850`, `12 k`, `1,2 M`
 */
export function tokensText(tokens: number): string {
  if (tokens < 1000) {
    return String(tokens)
  }

  if (tokens < 1_000_000) {
    return `${Math.round(tokens / 1000)} k`
  }

  return `${(tokens / 1_000_000).toFixed(1).replace('.', ',')} M`
}
