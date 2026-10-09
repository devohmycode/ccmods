import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_PREFS, bandOf, hooksOf, mcpOf, pluginsOf, prefsOf, projectStateOf, serverNameOf, toggleCommandOf, withPref } from '../hooks'

describe('the session setup', () => {
  test('a plugin takes its state and scope from the last source naming it', async () => {
    const plugins = pluginsOf([
      ['user', { 'b@m': true, 'a@m': true, 'old@m': ['x'] }],
      ['project', { 'a@m': false }],
      ['project', undefined],
    ])

    expect(plugins).toEqual([
      { name: 'b@m', scope: 'user', isOn: true },
      { name: 'a@m', scope: 'project', isOn: false },
    ])
  })

  test('hooks are counted per event and scope, project and local summed', async () => {
    const group = { matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }

    expect(
      hooksOf([
        ['user', { Stop: [group, group], Empty: [] }],
        ['project', { PreToolUse: [group] }],
        ['project', { PreToolUse: [group] }],
      ]),
    ).toEqual([
      { name: 'Stop', scope: 'user', count: 2 },
      { name: 'PreToolUse', scope: 'project', count: 2 },
    ])
  })

  test('MCP servers are listed once, project-scoped where configured there, off where disabled', async () => {
    expect(mcpOf({ connected: ['gh', 'docs'], user: ['gh'], project: ['db'], disabled: ['db'] })).toEqual([
      { name: 'docs', scope: 'user', isOn: true },
      { name: 'gh', scope: 'user', isOn: true },
      { name: 'db', scope: 'project', isOn: false },
    ])
  })

  test('a claude.ai connector is named as /mcp takes it', async () => {
    expect(serverNameOf('claude_ai_Claude_Docs')).toBe('claude.ai Claude Docs')
    expect(serverNameOf('claude-in-chrome')).toBe('claude-in-chrome')
  })

  test('the project is found in the state file whatever the slashes and case', async () => {
    const state = { projects: { 'C:/Work/app': { disabledMcpServers: ['db'] } } }

    expect(projectStateOf(state, 'c:\\Work\\app')).toEqual({ disabledMcpServers: ['db'] })
    expect(projectStateOf(undefined, 'x')).toEqual({})
  })

  test('a click runs the command that turns it the other way', async () => {
    expect(toggleCommandOf('plugins', { name: 'a@m', scope: 'user', isOn: true })).toEqual({
      argv: ['claude', 'plugin', 'disable', 'a@m'],
    })
    expect(toggleCommandOf('mcp', { name: 'db', scope: 'project', isOn: false })).toEqual({
      command: 'mcp',
      args: 'enable db',
    })
  })

  test('compact mode is off unless set on; the band keeps the parts it knows, in its order', async () => {
    expect(prefsOf({}).compact).toBe('off')
    expect(prefsOf({ compact: 'junk' }).compact).toBe('off')
    expect(withPref(DEFAULT_PREFS, 'compact', 'maybe')).toEqual({ error: 'compact' })
    expect(prefsOf({}).band).toBe('')
    expect(prefsOf({ band: 'session, junk,Model' }).band).toBe('model,session')
    expect(withPref(DEFAULT_PREFS, 'band', 'session,model')).toEqual({ prefs: { ...DEFAULT_PREFS, band: 'model,session' } })
    expect(withPref(DEFAULT_PREFS, 'band', 'model,clock')).toEqual({ error: 'band' })
    expect(bandOf('effort,model')).toEqual(['model', 'effort'])
  })

  test('keyboard mode is off unless set on, and takes nothing else', async () => {
    expect(prefsOf({}).keyboard).toBe('off')
    expect(prefsOf({ keyboard: 'junk' }).keyboard).toBe('off')
    expect(prefsOf({ keyboard: 'on' }).keyboard).toBe('on')
    expect(withPref(DEFAULT_PREFS, 'keyboard', 'on')).toEqual({ prefs: { ...DEFAULT_PREFS, keyboard: 'on' } })
    expect(withPref(DEFAULT_PREFS, 'keyboard', 'maybe')).toEqual({ error: 'keyboard' })
  })
})
