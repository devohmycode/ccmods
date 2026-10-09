import { describe, expect, test } from 'claude-code/testing'

import { LONG_TTL_MS, EN, WARM_MS, costLineOf, costSuffixOf, measureOf, switchCostOf, tokensText } from '../hooks'

const USAGE = { input_tokens: 2000, output_tokens: 1000, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 1000 }

describe('the cost of a switch', () => {
  test('a request measures its prompt and its answer, and whether the cache held any', async () => {
    expect(measureOf(USAGE)).toEqual({ tokens: 84_000, isCached: true })
    expect(measureOf({ ...USAGE, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })?.isCached).toBe(false)
    expect(measureOf(null)).toBeUndefined()
  })

  test('the cache is warm under 5 minutes, maybe under an hour, cold after', async () => {
    const last = { tokens: 84_000, isCached: true, at: 0 }

    expect(switchCostOf(undefined, 0)).toEqual({ state: 'none' })
    expect(switchCostOf(last, WARM_MS - 1)).toEqual({ state: 'warm', tokens: 84_000 })
    expect(switchCostOf(last, WARM_MS)).toEqual({ state: 'maybe', tokens: 84_000 })
    expect(switchCostOf(last, LONG_TTL_MS)).toEqual({ state: 'cold' })
    expect(switchCostOf({ ...last, isCached: false }, 0)).toEqual({ state: 'cold' })
  })

  test('the line names the tokens only where the cache may hold them', async () => {
    expect(costLineOf({ state: 'warm', tokens: 84_000 })).toContain('84 k tokens')
    expect(costLineOf({ state: 'maybe', tokens: 84_000 })).toContain('at most 84 k')
    expect(costLineOf({ state: 'cold' })).toBe(EN.costCold)
    expect(costSuffixOf({ state: 'cold' })).toBe('')
    expect(costSuffixOf({ state: 'warm', tokens: 850 })).toBe(' · 850 tokens to cache again')
  })

  test('a count of tokens reads in units, thousands or millions', async () => {
    expect(tokensText(850)).toBe('850')
    expect(tokensText(84_400)).toBe('84 k')
    expect(tokensText(1_234_000)).toBe('1,2 M')
  })
})
