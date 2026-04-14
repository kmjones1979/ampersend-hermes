import { config, requireAgentKey, requireAgentAccount } from "../config.js";

export interface McpProxyEntry {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Build a minimal MCP proxy entry pointing at a running ampersend proxy server.
 */
export function buildMcpEntry(proxyPort?: number): McpProxyEntry {
  const port = proxyPort ?? config.ampersendMcpProxyPort;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
  };
}

export {
  patchHermesConfig,
  patchHermesModel,
  unpatchHermesModel,
  buildHermesMcpServerEntry,
  buildHermesStdioMcpEntry,
  HERMES_AMPERSEND_SERVER_KEY,
  type HermesMcpEntry,
  type PatchHermesOptions,
  type PatchHermesModelOptions,
  type HermesMcpTransport,
} from "./hermes-config.js";
