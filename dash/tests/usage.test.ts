import { describe, expect, test } from 'claude-code/testing'

import { EN, USAGE_COLORS, durationText, limitLabelOf, percentText, usageColorOf, usageViewOf } from '../hooks'

const NOW = Date.parse('2026-10-07T12:00:00Z')

describe('the session spending', () => {
  test('the windows come 5 hours first, with what is left before each resets', async () => {
    const view = usageViewOf(
      {
        startedAt: NOW - 90 * 60_000,
        cost: { usd: 1.234 },
        rateLimits: [
          { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-09T16:00:00Z' },
          { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-07T14:05:00Z' },
        ],
      },
      NOW,
    )

    expect(view.usd).toBe(1.234)
    expect(view.elapsedMs).toBe(90 * 60_000)
    expect(view.limits.map(limit => limit.kind)).toEqual(['five_hour', 'seven_day'])
    expect(view.limits[0]).toEqual({ kind: 'five_hour', percent: 23.5, resetsInMs: 125 * 60_000 })
    expect(durationText(view.limits[1]!.resetsInMs!)).toBe('2 d 4 h')
  })

  test('a figure the engine does not have is left out, never zeroed', async () => {
    const view = usageViewOf({ startedAt: NOW, rateLimits: [{ kind: 'spend_limit', percentUsed: 104 }] }, NOW)

    expect(view.usd).toBeUndefined()
    expect(view.limits).toEqual([{ kind: 'spend_limit', percent: 104 }])
  })

  test('durations, shares and windows read as a person reads them', async () => {
    expect(durationText(30_000)).toBe('< 1 min')
    expect(durationText(45 * 60_000)).toBe('45 min')
    expect(durationText(125 * 60_000)).toBe('2 h 05')
    expect(percentText(23.5)).toBe('23,5 %')
    expect(percentText(7)).toBe('7 %')
    expect(limitLabelOf('five_hour')).toBe(EN.limitFiveHour)
    expect(limitLabelOf('other')).toBe('other:')
    expect(EN.usd(1.234)).toBe('$1.23')
  })

  test('a gauge fills green, then yellow, orange and red as it is spent', async () => {
    const [green, yellow, orange, red] = USAGE_COLORS.map(step => step.color)

    expect(usageColorOf(0)).toBe(green)
    expect(usageColorOf(49.9)).toBe(green)
    expect(usageColorOf(50)).toBe(yellow)
    expect(usageColorOf(75)).toBe(orange)
    expect(usageColorOf(90)).toBe(red)
    expect(usageColorOf(104)).toBe(red)
  })
})
