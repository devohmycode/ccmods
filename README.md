# ccmods

Claude Code mods written as function hooks, and the marketplace that
offers them. Each `<name>/` folder is a standalone plugin, with its own
README, manifest and tests.

## Mods

| Mod | What it does |
| --- | --- |
| [dash](dash/README.md) | The session's dashboard, in a pane opened by `/dash`: model, effort and presets, ultracode and fast mode, each switched in one click; the context and quota gauges, the cost and the duration, `/compact` behind a confirmation, the session's name; agents, commands, skills, plugins, MCP servers and hooks; the `/config` settings. Its ↧ buttons put the model, the effort or the session's gauges in the band above the prompt, and compact mode folds each list onto its current row. |

<table>
  <tr>
    <th>dash in the terminal</th>
    <th>dash in Claude desktop</th>
  </tr>
  <tr>
    <td valign="top"><img src="dash/assets/dash-terminal.png" alt="dash in the terminal" width="300"></td>
    <td valign="top"><img src="dash/assets/dash-desktop.png" alt="dash in the Claude desktop app" width="300"></td>
  </tr>
</table>

## Install

At the prompt of a Claude Code session in a terminal:

```
/plugin install dash --marketplace devohmycode/ccmods
```

Answer `y` to add the marketplace, then pick a scope. Older versions of
Claude Code take two steps:

```
/plugin marketplace add devohmycode/ccmods
/plugin install dash@ccmods
```

## Develop

```
npm ci
npm run check
```

`npm run check` type-checks each mod on its own, checks that every option
the code reads is declared, then runs `claude plugin validate` on the
marketplace and on each mod, and `claude plugin test` on each mod. The
last three need the Claude Code CLI.

To try a mod from its folder without installing it:

```
claude --plugin-dir ./dash
```

## License

[MIT](LICENSE)
