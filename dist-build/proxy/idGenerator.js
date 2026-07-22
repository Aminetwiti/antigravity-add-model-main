"use strict";
/**
 * Deterministic ID generation for custom models.
 * Pure functions — no I/O, no side effects, fully testable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLACEHOLDER_ID_RANGE = exports.PLACEHOLDER_ID_BASE = void 0;
exports.generateModelPlaceholderId = generateModelPlaceholderId;
exports.toSlug = toSlug;
/**
 * Base value for placeholder ID generation. Combined with a hash-derived offset
 * to produce IDs in the range [BASE, BASE + RANGE).
 */
exports.PLACEHOLDER_ID_BASE = 400;
exports.PLACEHOLDER_ID_RANGE = 200;
/**
 * Generates a deterministic placeholder ID for a custom model.
 * Used to inject models into the GetAvailableModels response.
 *
 * The same input always produces the same output (idempotent), enabling
 * consistent references across requests.
 *
 * NOTE: Includes provider, apiUrl, externalModelName and displayName in the hash
 * to ensure unique IDs when multiple models share the same displayName but use
 * different providers or endpoints.
 */
function generateModelPlaceholderId(model) {
    // Include provider, apiUrl, and externalModelName to ensure uniqueness
    const input = `${model.provider}-${model.apiUrl}-${model.externalModelName}-${model.displayName || model.name || 'custom-model'}`.toLowerCase();
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) + hash + input.charCodeAt(i);
        hash = hash & hash; // Force 32-bit integer
    }
    const placeholderNum = exports.PLACEHOLDER_ID_BASE + (Math.abs(hash) % exports.PLACEHOLDER_ID_RANGE);
    return `MODEL_PLACEHOLDER_M${placeholderNum}`;
}
/**
 * Generates a URL-safe slug for a custom model.
 * Used for routing and identification (and as the key in the injected models map).
 *
 * NOTE: provider is included in the slug so that two models which share the same
 * apiUrl + externalModelName but use a DIFFERENT provider get distinct slugs.
 * Without this, the models map (keyed by slug) collides and only the last-added
 * model appears in the Antigravity model dropdown.
 */
function toSlug(model) {
    const provider = (model.provider || 'custom').toLowerCase();
    const input = `${provider}-${model.apiUrl}-${model.externalModelName || model.name}`
        .replace(/^models\//, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    return `custom-${input}`;
}
