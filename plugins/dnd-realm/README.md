# D&D Realm — ChatGPT App

This plugin packages the D&D Realm MCP server for ChatGPT/Codex-compatible plugin hosts.

## OpenAI endpoint

Use the dedicated read-only MCP endpoint:

`https://atlas-infra.ru/mcp/openai`

Authentication is OAuth 2.1/PKCE. The server also retains the legacy `DND_MCP_TOKEN` path for internal smoke tests.

## ChatGPT app registration

OpenAI's Apps SDK requires the remote MCP endpoint to be registered as an app. The resulting technical app identifier is external state and must be supplied by OpenAI; this repository intentionally never contains a fake identifier.

1. Register the endpoint `https://atlas-infra.ru/mcp/openai` in an eligible ChatGPT custom-app/developer environment.
2. Complete the OAuth authorization flow.
3. Copy the real `asdk_app...` / `plugin_asdk_app...` identifier.
4. Create `plugins/dnd-realm/.app.json` from `.app.json.example` and replace the placeholder with that identifier.
5. Add `"apps": "./.app.json"` to `.codex-plugin/plugin.json` when the real app binding exists.

## GitHub marketplace

The repository contains `.agents/plugins/marketplace.json`, so a supported workspace can import the repository as a plugin marketplace. Importing/syncing the marketplace does not itself grant app access; the ChatGPT workspace still controls app availability and authentication.

## Tools

The OpenAI-facing endpoint exposes only read-only campaign tools:

- `get_character`
- `get_game_state`
- `get_recent_history`

No API key is passed to ChatGPT. OAuth access tokens are used for the MCP connection.
