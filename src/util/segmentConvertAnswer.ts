import type { TPrompt } from "vv-ai-prompt-format";
import type { TResult } from "../tresult";

export function convertAnswer(rawAnswer: string, rawFn: string | undefined): TResult<string> {
    if (!rawFn) {
        return { ok: true, result: rawAnswer }
    }
    try {
        const fn = new Function('raw', rawFn) as (raw: string) => string
        return { ok: true, result: fn(rawAnswer) }
    } catch (err) {
        return { ok: false, error: `convert/check thrown: ${err instanceof Error ? err.message : String(err)}` }
    }
}