/**
 * Thin wrapper around the Tauri `keyring_*` commands defined in
 * `src-tauri/src/secrets.rs`. All AI API keys are stored in the OS native
 * credential store (Windows Credential Manager / macOS Keychain / libsecret)
 * under the service name `"remex-studio"`.
 *
 * Account naming convention:
 *   - `"ai-api-key"`         — the single built-in AI provider key (Anthropic / OpenAI / Ollama)
 *   - `"custom:<uuid>"`     — one entry per custom OpenAI-compatible provider
 */

import { invoke } from "@tauri-apps/api/core";

export const AI_API_KEY_ACCOUNT = "ai-api-key";

export function customProviderAccount(providerId: string): string {
  return `custom:${providerId}`;
}

/** Read a key from the OS keyring. Returns `null` if not set. */
export async function getSecret(account: string): Promise<string | null> {
  try {
    const value = await invoke<string | null>("keyring_get", { account });
    return value;
  } catch (e) {
    // Keyring lookup failure is non-fatal — the user can re-enter the key.
    // Logged so devs can spot misconfigured Linux Secret Service setups.
    console.warn("[secrets] keyring_get failed for", account, e);
    return null;
  }
}

/** Write a key to the OS keyring. Empty string deletes the entry. */
export async function setSecret(account: string, value: string): Promise<void> {
  try {
    await invoke("keyring_set", { account, value });
  } catch (e) {
    console.warn("[secrets] keyring_set failed for", account, e);
  }
}

/** Delete a key from the OS keyring. No-op if not present. */
export async function deleteSecret(account: string): Promise<void> {
  try {
    await invoke("keyring_delete", { account });
  } catch (e) {
    console.warn("[secrets] keyring_delete failed for", account, e);
  }
}
