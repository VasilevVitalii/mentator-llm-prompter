import type { TPrompt } from 'vv-ai-prompt-format'
import type { TResult } from './tresult'
import type { TConfig, TPromptTemplateRead } from './config'
import { Ai } from './ai'
import { dualReplace } from './util/dualReplace'
import { isEmptyObj } from './util/isEmptyObj'
import { convertAnswer } from './util/segmentConvertAnswer'

export async function goModeJsonPipe(config: TConfig, payloadText: string, promptTemplate: TPromptTemplateRead): Promise<TResult<string>> {
	try {
		let resultJson = {} as object
		const uniqIdxFile = Array.from(new Set(promptTemplate.list.map(m => m.idxFile)))

		for (const idxFile of uniqIdxFile) {
			let foundWithData = true

			for (const templateItem of promptTemplate.list.filter(f => f.idxFile === idxFile)) {
				const prompt = {
					...templateItem.prompt,
					system: dualReplace(
						templateItem.prompt.system,
						{ find: config.prompt.templateReplacePayload, replace: payloadText },
						{ find: config.prompt.templateReplaceJson, replace: JSON.stringify(resultJson, null, 4) },
					),
					user:
						dualReplace(
							templateItem.prompt.user,
							{ find: config.prompt.templateReplacePayload, replace: payloadText },
							{ find: config.prompt.templateReplaceJson, replace: JSON.stringify(resultJson, null, 4) },
						) || '',
				}
				const aiRes = await Ai(config.ai, prompt)
				if (!aiRes.ok) {
					return { ok: false, error: `on get answer: ${aiRes.error}` }
				}

				const convertRes = convertAnswer(aiRes.result, templateItem.prompt.segment?.['convert'])
				if (!convertRes.ok) {
					return { ok: false, error: convertRes.error }
				}

				try {
					resultJson = JSON.parse(convertRes.result)
				} catch (err) {
					return { ok: false, error: `on convert (template ${templateItem.idxFile}:${templateItem.idxInFile}) answer to JSON: ${err}` }
				}

				if (isEmptyObj(resultJson)) {
					foundWithData = false
					break
				}
			}

			if (!foundWithData) {
				if (idxFile === 0) {
					return { ok: true, result: '' }
				} else {
					return { ok: false, error: `empty result for question (idxFile=${idxFile})` }
				}
			}
		}

		return { ok: true, result: JSON.stringify(resultJson, null, 4) }
	} catch (err) {
		return { ok: false, error: `${err}` }
	}
}
