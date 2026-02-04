import type { TPrompt } from 'vv-ai-prompt-format'
import type { TResult } from './tresult'
import type { TConfig } from './config'
import { Ai } from './ai'

export async function goModeBasic(config: TConfig, payloadText: string): Promise<TResult<string>> {
	try {
		const prompt: TPrompt = {
			user: payloadText,
		}
		const aiRes = await Ai(config.ai, prompt)
		if (!aiRes.ok) {
			return { ok: false, error: `on get answer: ${aiRes.error}` }
		}
		return { ok: true, result: aiRes.result }
	} catch (err) {
		return { ok: false, error: `${err}` }
	}
}
