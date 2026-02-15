import type { TPrompt } from 'vv-ai-prompt-format'
import type { TResult } from './tresult'
import type { TConfig, TPromptTemplateRead, TPromptTemplateReadItem } from './config'
import { Ai } from './ai'
import { dualReplace } from './util/dualReplace'
import { isEmptyObj } from './util/isEmptyObj'
import { convertAnswer } from './util/segmentConvertAnswer'

export async function goModeJsonPipe(config: TConfig, payloadText: string, promptTemplate: TPromptTemplateRead): Promise<TResult<string>> {
	try {
		let answerJson = {} as object
		const uniqIdxFile = Array.from(new Set(promptTemplate.list.map(m => m.idxFile)))
		const convertAnswerSharedFunctionList = [] as string[]

		for (const idxFile of uniqIdxFile) {
			const templateRes = await goPromptTemplate(
				config,
				payloadText,
				JSON.stringify(answerJson, null, 4),
				promptTemplate.list.filter(f => f.idxFile === idxFile),
				convertAnswerSharedFunctionList,
			)
			if (!templateRes.ok) {
				return { ok: false, error: templateRes.error }
			}
			answerJson = templateRes.result.answerJson
			if (templateRes.result.convertAnswerSharedFunction) {
				convertAnswerSharedFunctionList.push(templateRes.result.convertAnswerSharedFunction)
			}
		}

		return { ok: true, result: JSON.stringify(answerJson, null, 4) }
	} catch (err) {
		return { ok: false, error: `${err}` }
	}
}

async function goPromptTemplate(
	config: TConfig,
	payloadText: string,
	prevResult: string,
	promptTemplateList: TPromptTemplateReadItem[],
	convertAnswerSharedFunctionList: string[],
): Promise<TResult<{ answerJson: object; convertAnswerSharedFunction: string | undefined }>> {
	let hasEmptyObject = false
	let convertAnswerSharedFunctionWhenEmptyObject = undefined as string | undefined
	let lastError = undefined as string | undefined

	for (const templateItem of promptTemplateList) {
		const errPrefix = `template [file #${templateItem.idxFile}; prompt #${templateItem.idxInFile}]: `

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
			lastError = `${errPrefix}on get answer: ${aiRes.error}`
			continue
		}

		let answerString = aiRes.result
		let prevConvertAnswerSharedFunctionHasError = false
		for (const prevConvertAnswerSharedFunction of convertAnswerSharedFunctionList) {
			const prevConvertAnswerSharedRes = convertAnswer(prevConvertAnswerSharedFunction, { answerString: answerString, originPayloadString: payloadText })
			if (!prevConvertAnswerSharedRes.ok) {
				lastError = `${errPrefix}${prevConvertAnswerSharedRes.error}`
				prevConvertAnswerSharedFunctionHasError = true
				break
			}
			answerString = prevConvertAnswerSharedRes.result
		}
		if (prevConvertAnswerSharedFunctionHasError) {
			continue
		}

		const convertAnswerSharedFunction = templateItem.prompt.segment?.['convert_shared']
		const convertAnswerSharedRes = convertAnswer(convertAnswerSharedFunction, { answerString: answerString, originPayloadString: payloadText })
		if (!convertAnswerSharedRes.ok) {
			lastError = `${errPrefix}${convertAnswerSharedRes.error}`
			continue
		}

		const convertAnswerFunction = templateItem.prompt.segment?.['convert']
		const convertAnswerRes = convertAnswer(convertAnswerFunction, { answerString: convertAnswerSharedRes.result, originPayloadString: payloadText })
		if (!convertAnswerRes.ok) {
			lastError = `${errPrefix}${convertAnswerRes.error}`
			continue
		}

		let answerJson: object

		try {
			answerJson = JSON.parse(convertAnswerRes.result)
		} catch (err) {
			lastError = `${errPrefix}on external convert: ${err}`
			continue
		}

		if (isEmptyObj(answerJson)) {
			hasEmptyObject = true
			convertAnswerSharedFunctionWhenEmptyObject = convertAnswerSharedFunction
		} else {
			return { ok: true, result: { answerJson: answerJson, convertAnswerSharedFunction: convertAnswerSharedFunction } }
		}
	}

	if (hasEmptyObject) {
		return { ok: true, result: { answerJson: {}, convertAnswerSharedFunction: convertAnswerSharedFunctionWhenEmptyObject } }
	} else {
		return { ok: false, error: lastError || `unknown error parse answer` }
	}
}
