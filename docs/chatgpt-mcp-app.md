# ChatGPT MCP App Integration

## Goal

The D&D Realm backend exposes campaign data through MCP. ChatGPT must remain the model; MCP is only the tool/data bridge. Codex is not part of this architecture.

## Supported architecture

```text
ChatGPT
  -> custom MCP app / Apps SDK
  -> https://atlas-infra.ru/mcp
  -> D&D Realm
  -> PostgreSQL
```

The MCP endpoint is not an OpenAI model endpoint and must not proxy requests to Codex or an OpenAI API key.

## ChatGPT integration

OpenAI's current Apps SDK flow uses a remote MCP server. In ChatGPT, a custom MCP app is configured with the MCP endpoint and authentication, then its tools are scanned. OAuth is the preferred production authentication mechanism.

The server must remain reachable over HTTPS and must expose MCP transport and authentication metadata required by the ChatGPT app configuration.

## Local smoke test

```bash
curl -i https://atlas-infra.ru/mcp/health
```

For an authenticated MCP request:

```bash
curl -i -X POST https://atlas-infra.ru/mcp \
  -H 'Authorization: Bearer <DND_MCP_TOKEN>' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0.0"}}}'
```

## Security

Never commit `DND_MCP_TOKEN`, ChatGPT credentials, Codex credentials, cookies, refresh tokens, or API keys. The token belongs in the deployment secret store. The MCP endpoint should expose only the minimum read-only D&D tools required by ChatGPT.

## Important limitation

A repository, MCP server, or GitHub Action cannot programmatically attach an external MCP server to an already-open ChatGPT conversation. That final attachment is controlled by ChatGPT's Apps/custom-app capability. The repository therefore provides the production MCP backend and integration metadata, but does not attempt to impersonate ChatGPT or bypass ChatGPT/Codex quotas.
