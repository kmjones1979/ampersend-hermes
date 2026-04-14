import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { config, requireAgentKey, requireAgentAccount } from "../config.js";

/** Hermes `mcp_servers` key; tools appear as `mcp_ampersend_*`. */
export const HERMES_AMPERSEND_SERVER_KEY = "ampersend";

/** Default: local stdio proxy — credentials stay local. */
export type HermesMcpTransport = "stdio" | "http";

export interface PatchHermesOptions {
  /**
   * `stdio` (default): `npx @ampersend_ai/ampersend-sdk proxy:start` with env-based
   * credentials; SIWE auth runs inside the proxy process.
   * `http`: connect to an already-running proxy at `http://127.0.0.1:<port>/mcp`.
   */
  transport?: HermesMcpTransport;
  /** Port for HTTP transport (default: 3000). */
  proxyPort?: number;
}

export interface HermesMcpEntry {
  url: string;
  timeout: number;
  connect_timeout: number;
}

export function buildHermesMcpServerEntry(proxyPort?: number): HermesMcpEntry {
  const port = proxyPort ?? config.ampersendMcpProxyPort;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    timeout: 120,
    connect_timeout: 60,
  };
}

/**
 * Stdio entry: runs the ampersend MCP proxy via npx with session key credentials in env.
 * The proxy handles SIWE auth and x402 payments internally.
 */
export function buildHermesStdioMcpEntry(): Record<string, unknown> {
  return {
    command: "npx",
    args: ["-y", "@ampersend_ai/ampersend-sdk", "proxy:start"],
    env: {
      BUYER_SMART_ACCOUNT_ADDRESS: requireAgentAccount(),
      BUYER_SMART_ACCOUNT_KEY_PRIVATE_KEY: requireAgentKey(),
      AMPERSEND_API_URL: config.ampersendApiUrl,
      AMPERSEND_NETWORK: config.ampersendNetwork,
    },
    timeout: 120,
    connect_timeout: 60,
  };
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await fs.promises.writeFile(tmpPath, content, "utf-8");
  await fs.promises.rename(tmpPath, filePath);
}

function backupFile(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) return Promise.resolve();
  const backupPath = `${filePath}.bak.${Date.now()}`;
  return fs.promises.copyFile(filePath, backupPath);
}

function resolveHermesDir(configDir: string): string {
  if (path.isAbsolute(configDir)) return configDir;
  if (configDir.startsWith("~/")) {
    return path.join(os.homedir(), configDir.slice(2));
  }
  return path.resolve(configDir);
}

async function patchYaml(
  yamlPath: string,
  entry: Record<string, unknown>,
): Promise<void> {
  let doc: Record<string, unknown> = {};
  if (fs.existsSync(yamlPath)) {
    const raw = await fs.promises.readFile(yamlPath, "utf-8");
    const parsed = parseYaml(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      doc = parsed as Record<string, unknown>;
    }
  }

  const mcpServers =
    (doc.mcp_servers as Record<string, unknown> | undefined) ?? {};
  doc.mcp_servers = {
    ...mcpServers,
    [HERMES_AMPERSEND_SERVER_KEY]: entry,
  };

  const out = stringifyYaml(doc, { lineWidth: 100 });
  await atomicWrite(yamlPath, out.endsWith("\n") ? out : `${out}\n`);
}

async function patchJson(
  jsonPath: string,
  entry: Record<string, unknown>,
): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.promises.readFile(jsonPath, "utf-8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    existing = {};
  }

  const mcpServers =
    (existing.mcpServers as Record<string, unknown> | undefined) ?? {};
  const merged = {
    ...existing,
    mcpServers: {
      ...mcpServers,
      [HERMES_AMPERSEND_SERVER_KEY]: entry,
    },
  };

  await atomicWrite(jsonPath, JSON.stringify(merged, null, 2));
}

/**
 * Merge ampersend MCP into Hermes config. Prefers `~/.hermes/config.yaml`;
 * falls back to `config.json` if only that exists.
 *
 * **Default (`transport: 'stdio'`)** runs the ampersend MCP proxy via
 * `npx` with agent credentials in `env` — the proxy handles SIWE auth
 * and x402 payments automatically.
 *
 * **`transport: 'http'`** targets an already-running proxy at localhost.
 */
export async function patchHermesConfig(
  configDir: string,
  options: PatchHermesOptions = {},
): Promise<void> {
  const transport = options.transport ?? "stdio";
  const resolved = resolveHermesDir(configDir);

  await fs.promises.mkdir(resolved, { recursive: true });

  const yamlPath = path.join(resolved, "config.yaml");
  const jsonPath = path.join(resolved, "config.json");

  const entry =
    transport === "stdio"
      ? buildHermesStdioMcpEntry()
      : { ...buildHermesMcpServerEntry(options.proxyPort) };

  if (fs.existsSync(yamlPath)) {
    await backupFile(yamlPath);
    await patchYaml(yamlPath, entry);
    return;
  }

  if (fs.existsSync(jsonPath)) {
    await backupFile(jsonPath);
    await patchJson(jsonPath, entry);
    return;
  }

  await patchYaml(yamlPath, entry);
}

// ---------------------------------------------------------------------------
// Hermes model config (for custom model routing if needed)
// ---------------------------------------------------------------------------

export interface PatchHermesModelOptions {
  /** Custom model base URL (e.g. for a local proxy). */
  baseUrl?: string;
  /** Model identifier. */
  model?: string;
}

/**
 * Patch Hermes `config.yaml` so `model.provider = "custom"` and
 * `model.base_url` points at a custom endpoint.
 */
export async function patchHermesModel(
  configDir: string,
  options: PatchHermesModelOptions = {},
): Promise<void> {
  const resolved = resolveHermesDir(configDir);
  await fs.promises.mkdir(resolved, { recursive: true });

  const yamlPath = path.join(resolved, "config.yaml");

  let doc: Record<string, unknown> = {};
  if (fs.existsSync(yamlPath)) {
    await backupFile(yamlPath);
    const raw = await fs.promises.readFile(yamlPath, "utf-8");
    const parsed = parseYaml(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      doc = parsed as Record<string, unknown>;
    }
  }

  const modelSection =
    (doc.model as Record<string, unknown> | undefined) ?? {};

  if (options.baseUrl) {
    modelSection.provider = "custom";
    modelSection.base_url = options.baseUrl;
  }

  if (options.model) {
    modelSection.name = options.model;
  }

  doc.model = modelSection;

  const out = stringifyYaml(doc, { lineWidth: 100 });
  await atomicWrite(yamlPath, out.endsWith("\n") ? out : `${out}\n`);
}

/**
 * Revert custom model overrides from Hermes config.
 */
export async function unpatchHermesModel(
  configDir: string,
): Promise<void> {
  const resolved = resolveHermesDir(configDir);
  const yamlPath = path.join(resolved, "config.yaml");

  if (!fs.existsSync(yamlPath)) return;

  await backupFile(yamlPath);
  const raw = await fs.promises.readFile(yamlPath, "utf-8");
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;

  const doc = parsed as Record<string, unknown>;
  const modelSection = doc.model as Record<string, unknown> | undefined;
  if (!modelSection) return;

  if (modelSection.provider === "custom") {
    delete modelSection.provider;
  }
  if (
    typeof modelSection.base_url === "string" &&
    modelSection.base_url.includes("127.0.0.1")
  ) {
    delete modelSection.base_url;
  }

  doc.model = modelSection;
  const out = stringifyYaml(doc, { lineWidth: 100 });
  await atomicWrite(yamlPath, out.endsWith("\n") ? out : `${out}\n`);
}
