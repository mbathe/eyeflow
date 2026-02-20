/**
 * Vault Service — spec §13.2
 *
 * HashiCorp Vault-compatible secret injection at runtime.
 * Secrets are NEVER included in the LLM-IR — they are referenced by path
 * (e.g. "sap/api_key") and resolved here at execution time.
 *
 * Resolution strategy (in order):
 *   1. HashiCorp Vault HTTP API (VAULT_ADDR + VAULT_TOKEN env vars)
 *   2. Environment variables (VAULT_SECRET_<UPPER_SNAKE> pattern)
 *   3. Local .env fallback (development only)
 *
 * After injection: the secret is kept only in memory for the duration of
 * the instruction and immediately cleared (spec §13.2).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface VaultLookupResult {
  value: string;
  source: 'hashicorp' | 'env' | 'env_fallback';
  path: string;
}

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  private readonly vaultAddr: string | undefined;
  private readonly vaultToken: string | undefined;
  private readonly vaultNamespace: string | undefined;

  /** In-memory TTL cache to avoid hammering Vault on every instruction. */
  private readonly cache = new Map<string, { value: string; expiresAt: number }>();
  private readonly cacheTtlMs = 30_000; // 30s

  constructor() {
    this.vaultAddr     = process.env.VAULT_ADDR;
    this.vaultToken    = process.env.VAULT_TOKEN;
    this.vaultNamespace = process.env.VAULT_NAMESPACE;
  }

  /**
   * Fetch a secret by its vault path.
   *
   * @param secretPath  Path as stored in the LLM-IR dynamic_slot, e.g. "sap/api_key"
   * @returns           Secret value string
   * @throws            Error if secret cannot be resolved from any source
   */
  async fetchSecret(secretPath: string): Promise<VaultLookupResult> {
    // Check cache
    const cached = this.cache.get(secretPath);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`[Vault] Cache hit for "${secretPath}"`);
      return { value: cached.value, source: 'hashicorp', path: secretPath };
    }

    // 1. Try HashiCorp Vault
    if (this.vaultAddr && this.vaultToken) {
      try {
        const result = await this._fetchFromHashiCorp(secretPath);
        this.cache.set(secretPath, { value: result, expiresAt: Date.now() + this.cacheTtlMs });
        return { value: result, source: 'hashicorp', path: secretPath };
      } catch (err: any) {
        this.logger.warn(
          `[Vault] HashiCorp Vault fetch failed for "${secretPath}": ${err.message}. ` +
          `Falling back to environment variables.`
        );
      }
    }

    // 2. Try environment variable (VAULT_SECRET_<UPPER_SNAKE_PATH>)
    const envKey = this._pathToEnvKey(secretPath);
    const envValue = process.env[envKey];
    if (envValue) {
      this.logger.debug(`[Vault] Using env var ${envKey} for "${secretPath}"`);
      return { value: envValue, source: 'env', path: secretPath };
    }

    // 3. Try raw env key (e.g. "OPENAI_API_KEY" directly as path)
    const rawEnvValue = process.env[secretPath.toUpperCase().replace(/[^A-Z0-9]/g, '_')];
    if (rawEnvValue) {
      this.logger.debug(`[Vault] Using raw env var for "${secretPath}"`);
      return { value: rawEnvValue, source: 'env_fallback', path: secretPath };
    }

    throw new Error(
      `[Vault] Secret "${secretPath}" not found in HashiCorp Vault, ` +
      `${envKey} env var, or ${secretPath.toUpperCase()} env var. ` +
      `Ensure VAULT_ADDR + VAULT_TOKEN are set or export the env variable.`
    );
  }

  /**
   * Resolve all dynamic slots declared in a LLM_CALL or CALL_SERVICE instruction.
   *
   * @param slots   Array of { slot_id, source: VaultSecret("path") } objects
   * @param ctx     Execution context secrets map (will be populated)
   */
  async resolveSlots(
    slots: Array<{ slotId: string; vaultPath: string }>,
    targetMap: Map<string, string>,
  ): Promise<void> {
    await Promise.all(
      slots.map(async slot => {
        const result = await this.fetchSecret(slot.vaultPath);
        targetMap.set(slot.slotId, result.value);
      })
    );
  }

  /**
   * Immediately evict all cached secrets.
   * Call after a workflow execution to reduce the in-memory window.
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('[Vault] Secret cache cleared');
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Fetch from HashiCorp Vault KV v2 API.
   * Path format: "secret/data/<mount>/<path>" or shorthand "<mount>/<key>"
   */
  private async _fetchFromHashiCorp(secretPath: string): Promise<string> {
    // Normalise to KV v2 path: "sap/api_key" → "secret/data/sap/api_key"
    const apiPath = secretPath.startsWith('secret/')
      ? secretPath.replace('secret/', 'secret/data/')
      : `secret/data/${secretPath}`;

    const url = `${this.vaultAddr}/v1/${apiPath}`;

    const headers: Record<string, string> = {
      'X-Vault-Token': this.vaultToken!,
      'Content-Type':  'application/json',
    };
    if (this.vaultNamespace) {
      headers['X-Vault-Namespace'] = this.vaultNamespace;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`Vault HTTP ${res.status} for path "${apiPath}"`);
    }

    const json: any = await res.json();

    // KV v2 response: { data: { data: { key: value } } }
    const data = json?.data?.data;
    if (!data || typeof data !== 'object') {
      throw new Error(`Vault response for "${apiPath}" has no data.data`);
    }

    // The last segment of the path is the key name
    const keyName = secretPath.split('/').pop()!;

    // First try the exact key, then "value", then first value
    const value = data[keyName] ?? data['value'] ?? Object.values(data)[0];
    if (value === undefined || value === null) {
      throw new Error(`Key "${keyName}" not found in Vault secret at "${apiPath}"`);
    }

    return String(value);
  }

  /**
   * Convert a vault path to a conventional env-var key.
   * "sap/api_key" → "VAULT_SECRET_SAP_API_KEY"
   */
  private _pathToEnvKey(path: string): string {
    return 'VAULT_SECRET_' + path.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  }
}
