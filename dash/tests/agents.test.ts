import { describe, expect, test } from 'claude-code/testing'

import { agentsOf, draftWith, mentionOf, mentionedIn, scopeOf, shownOf, commandNameOf, draftWithCommand, invokedIn } from '../hooks'

describe('the subagents list', () => {
  test('keeps the global and project agents, grouped then sorted, once each, and none from a plugin', async () => {
    const agents = agentsOf([
      { agentType: 'scanner:triager', source: 'plugin' },
      { agentType: 'reviewer', source: 'projectSettings' },
      { agentType: 'writer', source: 'userSettings' },
      { agentType: 'docflow:writer', source: 'plugin' },
      { agentType: 'writer', source: 'projectSettings' },
      { agentType: 'locked', source: 'policySettings' },
    ])

    expect(agents).toEqual([
      { type: 'writer', scope: 'user' },
      { type: 'reviewer', scope: 'project' },
    ])
    expect(scopeOf('flagSettings')).toBeUndefined()
    expect(scopeOf('plugin')).toBeUndefined()
  })

  test('a frame shows three agents until expanded, then all', async () => {
    const agents = agentsOf(['a', 'b', 'c', 'd', 'e'].map(agentType => ({ agentType, source: 'userSettings' })))

    expect(shownOf(agents, 'user', false)).toEqual({ shown: agents.slice(0, 3), hidden: 2, count: 5 })
    expect(shownOf(agents, 'user', true)).toEqual({ shown: agents, hidden: 0, count: 5 })
    expect(shownOf(agents, 'project', false)).toEqual({ shown: [], hidden: 0, count: 0 })
  })

  test('a command is named by its file, a subfolder its namespace, and a pick heads the draft', async () => {
    expect(commandNameOf('/git/commit.md')).toBe('git:commit')
    expect(commandNameOf('/deploy.MD')).toBe('deploy')
    expect(commandNameOf('/notes.txt')).toBeUndefined()
    expect(draftWithCommand('fix the bug', 'review')).toBe('/review fix the bug')
    expect(draftWithCommand('/deploy now', 'review')).toBe('/review now')
    expect(invokedIn('  /review x')).toBe('review')
    expect(invokedIn('@agent-x hi')).toBeUndefined()
  })

  test('a pick puts the mention at the head of the draft, in place of one already there', async () => {
    expect(mentionOf('docflow:writer')).toBe('@agent-docflow:writer')
    expect(draftWith('', 'reviewer')).toBe('@agent-reviewer ')
    expect(draftWith('check the diff', 'reviewer')).toBe('@agent-reviewer check the diff')
    expect(draftWith('@agent-writer  check the diff', 'reviewer')).toBe('@agent-reviewer check the diff')
  })

  test('reads which agent a draft is addressed to', async () => {
    expect(mentionedIn('@agent-scanner:triager look')).toBe('scanner:triager')
    expect(mentionedIn('look @agent-writer')).toBeUndefined()
  })
})
