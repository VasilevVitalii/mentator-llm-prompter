import type { TPrompt } from 'vv-ai-prompt-format'
import type { TResult } from './tresult'
import type { TConfig, TPromptTemplateRead, TPromptTemplateReadItem } from './config'
import { Ai } from './ai'
import { dualReplace } from './util/dualReplace'
import { isEmptyObj } from './util/isEmptyObj'
import { convertAnswer } from './util/segmentConvertAnswer'

export async function goModeJsonPipe(config: TConfig, payloadText: string, promptTemplate: TPromptTemplateRead): Promise<TResult<string>> {
	try {
		let resultJson = {} as object
		const uniqIdxFile = Array.from(new Set(promptTemplate.list.map(m => m.idxFile)))

		for (const idxFile of uniqIdxFile) {
			const templateRes = await goPromptTemplate(
				config,
				payloadText,
				JSON.stringify(resultJson, null, 4),
				promptTemplate.list.filter(f => f.idxFile === idxFile),
			)
			if (!templateRes.ok) {
				return { ok: false, error: templateRes.error }
			}
			resultJson = templateRes.result
		}

		return { ok: true, result: JSON.stringify(resultJson, null, 4) }
	} catch (err) {
		return { ok: false, error: `${err}` }
	}
}

async function goPromptTemplate(
	config: TConfig,
	payloadText: string,
	prevResult: string,
	promptTemplateList: TPromptTemplateReadItem[],
): Promise<TResult<object>> {
	let hasEmptyObject = false
	let lastError = undefined as string | undefined

	for (const templateItem of promptTemplateList) {
		const prompt = {
			...templateItem.prompt,
			system: dualReplace(
				templateItem.prompt.system,
				{ find: config.prompt.templateReplacePayload, replace: payloadText },
				{ find: config.prompt.templateReplaceJson, replace: prevResult },
			),
			user:
				dualReplace(
					templateItem.prompt.user,
					{ find: config.prompt.templateReplacePayload, replace: payloadText },
					{ find: config.prompt.templateReplaceJson, replace: prevResult },
				) || '',
		}
		const aiRes = await Ai(config.ai, prompt)
		if (!aiRes.ok) {
			lastError = `on get answer: ${aiRes.error}`
			continue
		}

		const convertRes = convertAnswer(aiRes.result, templateItem.prompt.segment?.['convert'])
		if (!convertRes.ok) {
			lastError = convertRes.error
			continue
		}

		let resultJson: object

		try {
			resultJson = JSON.parse(convertRes.result)
		} catch (err) {
			lastError = `on external convert (template ${templateItem.idxFile}:${templateItem.idxInFile}) answer to JSON: ${err}`
			continue
		}

		if (isEmptyObj(resultJson)) {
			hasEmptyObject = true
		} else {
			return { ok: true, result: resultJson }
		}
	}

	if (hasEmptyObject) {
		return { ok: true, result: {} }
	} else {
		return { ok: false, error: lastError || `unknown error parse answer` }
	}
}
