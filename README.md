# Claude Code Plugins by tsmztech

A plugin marketplace for [Claude Code](https://claude.ai/claude-code) with Salesforce-focused tools.

## Available Plugins

| Plugin | Description |
|---|---|
| [salesforce-cli](./salesforce-cli/) | Salesforce skills for querying data, managing records, bulk operations, and more |

## Installation

Add this marketplace to Claude Code:

```
/plugin marketplace add tsmztech/claude-code-plugins
```

Then install a plugin:

```
/plugin install salesforce-cli@tsmztech
```

## Local Development

Clone the repo and load a plugin directly:

```bash
git clone https://github.com/tsmztech/claude-code-plugins.git
claude --plugin-dir ./claude-code-plugins/salesforce-cli
```

## Author

Tapas Mukherjee
