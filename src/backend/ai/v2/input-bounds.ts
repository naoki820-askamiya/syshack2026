// User-approved initial limits. Bytes are UTF-8 JSON bytes, not token or monetary estimates.
export const MAX_PROFILE_JSON_BYTES = 64 * 1024;
export const MAX_PROFILE_JSON_DEPTH = 16;
export const MAX_AI_INPUT_JSON_BYTES = 128 * 1024;
export const MAX_AI_OUTPUT_TOKENS = 32_768;

export class AiInputBoundsError extends Error {
    constructor() {
        super('AI入力の情報量が上限を超えているか、参照情報の形式が不正です。参照情報や設定を確認してください。');
        this.name = 'AiInputBoundsError';
    }
}

// Walk before stringify/clone so deep/cyclic/large saved JSON cannot bypass dispatch bounds.
// The byte counter stops on the first excess and includes punctuation, keys and JSON escapes.
function assertJsonBounds(value: unknown, maxBytes: number, maxDepth: number): void {
    let bytes = 0;
    const ancestors = new Set<object>();
    const add = (count: number) => {
        bytes += count;
        if (bytes > maxBytes) throw new AiInputBoundsError();
    };
    const stringBytes = (text: string) => {
        if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new AiInputBoundsError();
        return Buffer.byteLength(JSON.stringify(text), 'utf8');
    };
    const visit = (item: unknown, depth: number): void => {
        if (item === null) { add(4); return; }
        if (typeof item === 'string') { add(stringBytes(item)); return; }
        if (typeof item === 'boolean') { add(item ? 4 : 5); return; }
        if (typeof item === 'number' && Number.isFinite(item)) { add(String(item).length); return; }
        if (typeof item !== 'object') throw new AiInputBoundsError();
        if (depth + 1 > maxDepth || ancestors.has(item)) throw new AiInputBoundsError();
        const array = Array.isArray(item);
        if (array && item.length > maxBytes) throw new AiInputBoundsError();
        // Stored JSON has data properties only. Reject executable serialization hooks/accessors.
        if (Object.getOwnPropertySymbols(item).length > 0) throw new AiInputBoundsError();
        const descriptors = Object.getOwnPropertyDescriptors(item);
        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (array && key === 'length') continue;
            if (!('value' in descriptor) || !descriptor.enumerable ||
                typeof descriptor.value === 'function') throw new AiInputBoundsError();
        }
        if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new AiInputBoundsError();
        ancestors.add(item);
        add(2);
        let count = 0;
        if (array) {
            for (let index = 0; index < item.length; index++) {
                const descriptor = descriptors[String(index)];
                if (!descriptor) throw new AiInputBoundsError();
                const child: unknown = descriptor.value;
                if (count++) add(1);
                visit(child, depth + 1);
            }
        } else {
            for (const key in item) {
                if (!Object.hasOwn(item, key)) continue;
                if (count++) add(1);
                add(stringBytes(key) + 1);
                visit(descriptors[key].value, depth + 1);
            }
        }
        ancestors.delete(item);
    };
    visit(value, 0);
}

export function assertProfileBounds(value: unknown): void {
    if (value !== null) assertJsonBounds(value, MAX_PROFILE_JSON_BYTES, MAX_PROFILE_JSON_DEPTH);
}

export function serializeBoundedAiInput(value: unknown): string {
    // Input envelope adds two object levels above Profile; allow its full approved depth.
    assertJsonBounds(value, MAX_AI_INPUT_JSON_BYTES, MAX_PROFILE_JSON_DEPTH + 4);
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_AI_INPUT_JSON_BYTES) throw new AiInputBoundsError();
    return serialized;
}
