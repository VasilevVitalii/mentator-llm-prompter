import { vvConfigJsonc, Type, type Static } from 'vv-config-jsonc'
import { join } from 'path'
import { fsWriteFileSync } from './util/fsWriteFile'
import { readFileSync } from 'fs'
import { ELoggerMode } from './logger'
import { type TPrompt, PromptConvFromString, defVal, defValJson, PromptConvToString } from 'vv-ai-prompt-format'
import type { TResult } from './tresult'
import { fsReadFileSync } from './util/fsReadFile'

export const SConfigAi = Type.Object({
	kind: Type.Union([Type.Literal('openapi'), Type.Literal('mentator'), Type.Literal('ollama')], {
		description: 'USE openapi or ollama or mentator-llm-service API',
	}),
	url: Type.String({
		default: 'http://localhost:12345',
		description: 'API URL',
	}),
	api_key: Type.Optional(
		Type.String({
			description: 'API key (optional for Ollama, required for OpenAI/Azure OpenAI)',
		}),
	),
	timeout: Type.Number({
		default: 600000,
		description: 'default request timeout in milliseconds',
	}),
	model: Type.String({ default: 'deepseek-coder:6.7b', description: 'default model name' }),
})
export type TConfigAi = Static<typeof SConfigAi>

export const SConfig = Type.Object({
	log: Type.Object({
		dir: Type.String({ description: 'full path to log directory', default: 'path/to/log' }),
		mode: Type.Enum(ELoggerMode, {
			description: 'REWRITE - write log to "mentator-llm-prompter.log"; APPEND - write log to "mentator-llm-prompter.YYYYMMDD-HHMMSS.log"',
			default: 'REWRITE',
		}),
	}),
	ai: SConfigAi,
	prompt: Type.Object({
		dir: Type.String({ description: 'full path to directory with payload for prompt files', default: 'path/to/prompts' }),
		templateReplacePayload: Type.Optional(Type.String({ description: 'placeholder in prompt to replace with payload content', default: '{{payload}}' })),
		templateReplaceJson: Type.Optional(
			Type.String({
				description: 'only for ai.kind="mentator" - placeholder in prompt to replace with json (prev response) content',
				default: '{{json}}',
			}),
		),
		templateFile: Type.Optional(
			Type.Array(Type.String({ description: 'full path to file with prompt template file', default: 'path/to/prompt.template.txt' })),
		),
	}),
	answer: Type.Object({
		dir: Type.String({ description: 'full path to directory for storing answer files', default: 'path/to/answers' }),
		hashDir: Type.Optional(Type.String({ description: 'full path to directory for storing hash files', default: 'path/to/hash' })),
	}),
})
export type TConfig = Static<typeof SConfig>

export function ConfigGerenate(fullPath: string): { error?: string; success?: string } {
	const fullFileName = join(fullPath, `mentator-llm-prompter.config.TEMPLATE.jsonc`)
	try {
		const conf = new vvConfigJsonc(SConfig).getDefault()
		const resWrite = fsWriteFileSync(fullFileName, conf.text)
		if (!resWrite.ok) {
			return { error: `on create default config: ${resWrite.error}` }
		}
		return { success: `config create "${fullFileName}"` }
	} catch (err) {
		return { error: `on create default config: ${err}` }
	}
}

export function ConfigRead(fullFileName: string): { error?: string; conf?: TConfig } {
	try {
		const text = readFileSync(fullFileName, 'utf-8')
		const conf = new vvConfigJsonc(SConfig).getConfig(text)
		if (conf.errors.length > 0) {
			return { error: `error(s) in config "${fullFileName}": ${conf.errors.join('; ')}` }
		}
		fsWriteFileSync(fullFileName, conf.text)
		return { conf: conf.config }
	} catch (err) {
		return { error: `error read config "${fullFileName}": ${err}` }
	}
}

export type TPromptTemplateReadItem = { idxFile: number; idxInFile: number; prompt: TPrompt }
export type TPromptTemplateRead = { jsonPipe: boolean; list: TPromptTemplateReadItem[] }

export function promptTemplateRead(config: TConfig): TResult<TPromptTemplateRead> {
	const res = [] as { idxFile: number; idxInFile: number; prompt: TPrompt }[]
	let idxFile = 0
	for (const fileName of config.prompt.templateFile || []) {
		const readFileRes = fsReadFileSync(fileName)
		if (!readFileRes.ok) {
			return { ok: false, error: `on read template file: ${readFileRes.error}` }
		}
		res.push(
			...PromptConvFromString(readFileRes.result).map((prompt, idxInFile) => {
				return {
					idxFile,
					idxInFile,
					prompt,
				}
			}),
		)
		idxFile++
	}
	if (config.ai.kind === 'mentator') {
		const hasJsonY = res.filter(f => f.prompt.jsonresponse).length > 0 ? true : false
		const hasJsonN = res.filter(f => !f.prompt.jsonresponse).length > 0 ? true : false
		if (hasJsonY && hasJsonN) {
			return { ok: false, error: `all templates must either have a jsonresponse or not have a jsonresponse simultaneously` }
		}
		return { ok: true, result: { jsonPipe: hasJsonY, list: res } }
	} else {
		return { ok: true, result: { jsonPipe: false, list: res } }
	}
}

export function promptTemplateGerenate(fullPath: string, isJson: boolean): { error?: string; success?: string } {
	const fullFileName = join(fullPath, `mentator-ll-prompter.prompt.TEMPLATE.txt`)
	try {
		const prompt: TPrompt = {
			llm: {
				model: 'file-model-name.gguf',
			},
			system: 'Read the story and answer the question',
			user: [
				'Get all people (name, age, etc.) from this text:',
				'I am Bob, I am 9 years old and I live on Sunny Street.',
				'My friend Diana lives across from me, she is 8 years old and does gymnastics.',
				'A little further away lives my friend John, he is a year older than me. We like to play tennis with him.',
				'We ask Mr. Smith to judge our game. He is a former tennis referee. And although he is already 92 years old, he still loves his former job and is happy to help us.',
			].join('\n'),
			options: isJson ? defValJson : defVal,
			jsonresponse: isJson
				? [
						`{`,
						`	"type": "array",`,
						`	"items": {`,
						`		"type": "object",`,
						`		"properties": {`,
						`			"name": { "type": "string" },`,
						`			"age": { "type": "integer" },`,
						`			"sex": { "type": "string", "enum": [ "male", "female" ] },`,
						`			"hobby": { "type": "string" }`,
						`		},`,
						`		"required": [ "name", "age", "sex" ]`,
						`	}`,
						`}`,
					].join('\n')
				: undefined,
			segment: isJson ? { 'mentator-llm-service': '{"useGrammar":true}' } : undefined,
		}

		const resWrite = fsWriteFileSync(fullFileName, PromptConvToString([prompt]))
		if (!resWrite.ok) {
			return { error: `on create default prompt: ${resWrite.error}` }
		}
		return { success: `prompt create "${fullFileName}"` }
	} catch (err) {
		return { error: `on create default prompt: ${err}` }
	}
}
