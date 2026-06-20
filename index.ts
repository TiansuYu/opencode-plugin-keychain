import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir, userInfo } from "node:os"
import { join } from "node:path"

type JsonValue = string | number | boolean | null | JsonObject | JsonArray
type JsonObject = { [key: string]: JsonValue }
type JsonArray = JsonValue[]

interface PluginInput {
  directory?: string
}

interface PluginHooks {
  config?: (cfg: Record<string, unknown>) => void
  "shell.env"?: (input: unknown, output: { env: Record<string, string> }) => void | Promise<void>
}

function isMacOS(): boolean {
  return process.platform === "darwin"
}

/**
 * Keychain account is always the current OS user.
 * Secrets are looked up in the login keychain (security's default) with:
 *   service (-s) = ENV_VAR_NAME
 *   account (-a) = $USER
 */
function keychainAccount(): string {
  return process.env.USER || userInfo().username
}

function stripJsonComments(text: string): string {
  let result = ""
  let i = 0
  let inString = false
  let inSingleLineComment = false
  let inBlockComment = false

  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]

    if (inSingleLineComment) {
      if (ch === "\n") {
        inSingleLineComment = false
        result += ch
      }
      i++
      continue
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false
        i += 2
        continue
      }
      i++
      continue
    }

    if (inString) {
      result += ch
      if (ch === "\\" && next) {
        result += next
        i += 2
        continue
      }
      if (ch === '"') inString = false
      i++
      continue
    }

    if (ch === "/" && next === "/") {
      inSingleLineComment = true
      i += 2
      continue
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true
      i += 2
      continue
    }

    result += ch
    if (ch === '"') inString = true
    i++
  }

  return result
}

function findConfigFiles(): string[] {
  const candidates: string[] = []

  const customPath = process.env.OPENCODE_CONFIG
  if (customPath) candidates.push(customPath)

  candidates.push(
    join(process.cwd(), "opencode.jsonc"),
    join(process.cwd(), "opencode.json"),
    join(process.cwd(), ".opencode", "opencode.json"),
  )

  const home = homedir()
  candidates.push(
    join(home, ".config", "opencode", "opencode.jsonc"),
    join(home, ".config", "opencode", "opencode.json"),
  )

  return candidates
}

function readRawConfig(): { path: string; text: string } | null {
  for (const filePath of findConfigFiles()) {
    try {
      return { path: filePath, text: readFileSync(filePath, "utf-8") }
    } catch {
      continue
    }
  }
  return null
}

type ConfigPath = string[]

function findEnvPlaceholders(
  obj: JsonValue,
  currentPath: ConfigPath,
): Array<{ path: ConfigPath; varName: string }> {
  const results: Array<{ path: ConfigPath; varName: string }> = []

  if (typeof obj === "string") {
    const match = obj.match(/^\{env:(\w+)\}$/)
    if (match) {
      results.push({ path: currentPath, varName: match[1] })
    }
    return results
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      results.push(...findEnvPlaceholders(obj[i], [...currentPath, String(i)]))
    }
    return results
  }

  if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      results.push(...findEnvPlaceholders(value, [...currentPath, key]))
    }
  }

  return results
}

function deepSet(obj: Record<string, unknown>, path: ConfigPath, value: string): void {
  let current: Record<string, unknown> = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[path[path.length - 1]] = value
}

function loadFromKeychain(account: string, varName: string): string | null {
  try {
    const result = execSync(
      `security find-generic-password -a "${account}" -s "${varName}" -w`,
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    )
    return result.trim()
  } catch {
    return null
  }
}

export default async function KeychainPlugin(
  _input: PluginInput,
): Promise<PluginHooks> {
  if (!isMacOS()) {
    return {
      "shell.env": async (_input, output) => {
        // no-op on non-macOS
      },
    }
  }

  const account = keychainAccount()

  const raw = readRawConfig()
  if (!raw) {
    return {
      "shell.env": async (_input, output) => {
        // no config found, no-op
      },
    }
  }

  let rawConfig: JsonValue
  try {
    rawConfig = JSON.parse(stripJsonComments(raw.text))
  } catch {
    return {
      "shell.env": async (_input, output) => {
        // invalid JSON, no-op
      },
    }
  }

  const placeholders = findEnvPlaceholders(rawConfig, [])

  const secrets = new Map<string, string>()
  const attempted = new Set<string>()
  for (const { varName } of placeholders) {
    if (attempted.has(varName)) continue
    attempted.add(varName)

    const secret = loadFromKeychain(account, varName)
    if (secret !== null) {
      secrets.set(varName, secret)
      process.env[varName] = secret
    } else {
      console.warn(
        `[keychain] No Keychain entry for "${varName}" ` +
          `(searched login keychain: service="${varName}", account="${account}"). ` +
          `Add it with: security add-generic-password -a "${account}" -s ${varName} -w`,
      )
    }
  }

  return {
    config: (cfg: Record<string, unknown>) => {
      for (const { path, varName } of placeholders) {
        const secret = secrets.get(varName)
        if (secret) {
          deepSet(cfg, path, secret)
        }
      }
    },
    "shell.env": async (_input: unknown, output: { env: Record<string, string> }) => {
      for (const [varName, secret] of secrets) {
        output.env[varName] = secret
      }
    },
  }
}
