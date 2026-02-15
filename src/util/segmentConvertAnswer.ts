import type { TPrompt } from "vv-ai-prompt-format";
import type { TResult } from "../tresult";

export type TConvertAnswerEnv = {
    answerString: string,
    originPayloadString: string
}

export function convertAnswer(rawFn: string | undefined, env: TConvertAnswerEnv): TResult<string> {
    if (!rawFn) {
        return { ok: true, result: env.answerString }
    }
    try {
        const fn = new Function('env', rawFn) as (env: TConvertAnswerEnv) => string;
        return { ok: true, result: fn(env) }
    } catch (err) {
        return { ok: false, error: `convert/check thrown: ${err instanceof Error ? err.message : String(err)}` }
    }
}