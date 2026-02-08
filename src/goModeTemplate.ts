import type { TResult } from './tresult'
import type { TConfig, TPromptTemplateRead } from './config'
import { Ai } from './ai'
import { dualReplace } from './util/dualReplace'
import { convertAnswer } from './util/segmentConvertAnswer'

export async function goModeTemplate(config: TConfig, payloadText: string, promptTemplate: TPromptTemplateRead): Promise<TResult<{relativeFileName: string, fileText: string}[]>> {
    try {
        const res = [] as {relativeFileName: string, fileText: string}[]
        for (const templateItem of promptTemplate.list) {
            const prompt = {
                ...templateItem.prompt,
                system: dualReplace(
                    templateItem.prompt.system,
                    { find: config.prompt.templateReplacePayload, replace: payloadText },
                ),
                user: dualReplace(
                    templateItem.prompt.user,
                    { find: config.prompt.templateReplacePayload, replace: payloadText },
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

            res.push({
                relativeFileName: `answer-${templateItem.idxFile.toString().padStart(3, '0')}-${templateItem.idxInFile.toString().padStart(3, '0')}.txt`,
                fileText: convertRes.result
            })
        }
        return {ok: true, result: res}
    } catch (err) {
        return { ok: false, error: `${err}` }
    }
}
