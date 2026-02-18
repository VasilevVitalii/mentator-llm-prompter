import type { TResult } from "../tresult";

export type TPreparePromptEnv = {
    system?: string,
    user: string
}

export function preparePrompt(rawFn: string | undefined, env: TPreparePromptEnv): TResult<TPreparePromptEnv> {
    if (!rawFn) {
        return { ok: true, result: env }
    }
    try {
        const fn = new Function('env', rawFn) as (env: TPreparePromptEnv) => TPreparePromptEnv;
        return { ok: true, result: fn(env) }
    } catch (err) {
        return { ok: false, error: `prepare thrown: ${err instanceof Error ? err.message : String(err)}` }
    }
}
