import { join } from 'path'
import { promptTemplateRead, type TConfig } from './config'
import { GetLogger, Logger } from './logger'
import { fsReadDirSync } from './util/fsReadDir'
import { type TPrompt } from 'vv-ai-prompt-format'
import { fsReadFileSync } from './util/fsReadFile'
import { fsWriteFileSync } from './util/fsWriteFile'
import { gethash } from './util/hash'
import { Ai } from './ai'
import { dualReplace } from './util/dualReplace'
import { isEmptyObj } from './util/isEmptyObj'

export async function Go(config: TConfig): Promise<void> {
	let getLogger: { error?: string; logger?: Logger } = { error: undefined, logger: undefined }
	let filesProcess = 0
	let filesSuccess = 0
	let filesSkipped = 0
	let filesError = 0
	try {
		getLogger = GetLogger('mentator-llm-prompter', config.log.dir, config.log.mode)
		if (getLogger.error) {
			console.error(`${getLogger.error}`)
			return
		}
		const logger = getLogger.logger!
		logger.debug('APP START')
		logger.debug(`model in config: "${config.ai.model}"`)

		const payloadReadDirRes = fsReadDirSync(config.prompt.dir)
		if (!payloadReadDirRes.ok) {
			logger.error(`on read payload dir: ${payloadReadDirRes.error}`)
			return
		}

		const promptTemplateReadRes = promptTemplateRead(config)
		if (!promptTemplateReadRes.ok) {
			logger.error(promptTemplateReadRes.error)
			return
		}
		let printPromptMode = false
		const filesTotal = payloadReadDirRes.result.length

		for (const payloadFileName of payloadReadDirRes.result) {
			filesProcess++
			const percent = Math.floor((filesProcess / filesTotal) * 100).toString().padStart(2, '0')
			const payloadRes = fsReadFileSync(join(config.prompt.dir, payloadFileName))
			if (!payloadRes.ok) {
				logger.error(`on read text from payload file: ${payloadRes.error}`)
				filesError++
				continue
			}
			if (!payloadRes.result) {
				logger.error(`empty data, skip payload file "${payloadFileName}"`)
				filesError++
				continue
			}
			const hash = gethash(payloadRes.result)
			if (config.answer.hashDir) {
				const readCurrentHashRes = fsReadFileSync(join(config.answer.hashDir, `${payloadFileName}.hash`))
				if (!readCurrentHashRes.ok) {
					logger.error(`on read current hash: ${readCurrentHashRes.error}`)
					filesError++
					continue
				}
				if (hash === readCurrentHashRes.result) {
					logger.debug(`(${percent}%) hash not changed, ignore "${payloadFileName}"`)
					filesSkipped++
					continue
				}
			}
			if (promptTemplateReadRes.result.jsonPipe) {
				if (!printPromptMode) {
					logger.debug(`prompt mode - "json pipe"`)
					printPromptMode = true
				}
				let resultJson = {} as object
				let hasError = false
				const uniqIdxFile = Array.from(new Set(promptTemplateReadRes.result.list.map(m => m.idxFile)))
				for (const idxFile of uniqIdxFile) {
					const templatesForFile = promptTemplateReadRes.result.list.filter(f => f.idxFile === idxFile)
				let foundNonEmpty = false

				for (const templateItem of templatesForFile) {
						const prompt = {
							...templateItem.prompt,
							system: dualReplace(
								templateItem.prompt.system,
								{ find: config.prompt.templateReplacePayload, replace: payloadRes.result },
								{ find: config.prompt.templateReplaceJson, replace: JSON.stringify(resultJson, null, 4) },
							),
							user: dualReplace(
								templateItem.prompt.user,
								{ find: config.prompt.templateReplacePayload, replace: payloadRes.result },
								{ find: config.prompt.templateReplaceJson, replace: JSON.stringify(resultJson, null, 4) },
							) || '',
						}
						const aiRes = await Ai(config.ai, prompt)
						if (!aiRes.ok) {
							logger.error(`on get answer (template ${templateItem.idxFile}:${templateItem.idxInFile}) for "${payloadFileName}": ${aiRes.error}`)
							hasError = true
							break
						}
						try {
							resultJson = JSON.parse(aiRes.result)
						} catch(err) {
							logger.error(`on convert (template ${templateItem.idxFile}:${templateItem.idxInFile}) answer to JSON: ${err}`, aiRes.result)
							hasError = true
							break
						}

						if (!isEmptyObj(resultJson)) {
							foundNonEmpty = true
							break
						}
					}

					if (hasError) break

					// Если это первый вопрос и результат пустой - сохраняем пустой результат и останавливаемся
					if (idxFile === uniqIdxFile[0] && !foundNonEmpty) {
						break
					}

					// Если это последующие вопросы и результат пустой - это ошибка
					if (idxFile !== uniqIdxFile[0] && !foundNonEmpty) {
						logger.error(`empty result for question (idxFile=${idxFile}) in "${payloadFileName}"`)
						hasError = true
						break
					}
				}

				const writeAnswerRes = fsWriteFileSync(join(config.answer.dir, payloadFileName), JSON.stringify(resultJson, null, 4))
				if (!writeAnswerRes.ok) {
					logger.error(`on save answer for "${payloadFileName}": ${writeAnswerRes.error}`)
					filesError++
					continue
				}
				if (!hasError) {
					logger.debug(`(${percent}%) answer saved for "${payloadFileName}"`)
					filesSuccess++
				} else {
					filesError++
				}
			} else if (promptTemplateReadRes.result.list.length > 0) {
				if (!printPromptMode) {
					logger.debug(`prompt mode - "template"`)
					printPromptMode = true
				}
				let hasError = false
				for (const templateItem of promptTemplateReadRes.result.list) {
					const prompt = {
						...templateItem.prompt,
						system: dualReplace(
							templateItem.prompt.system,
							{ find: config.prompt.templateReplacePayload, replace: payloadRes.result },
						),
						user: dualReplace(
							templateItem.prompt.user,
							{ find: config.prompt.templateReplacePayload, replace: payloadRes.result },
						) || '',
					}
					const aiRes = await Ai(config.ai, prompt)
					if (!aiRes.ok) {
						logger.error(`on get answer (template ${templateItem.idxFile}:${templateItem.idxInFile}) for "${payloadFileName}": ${aiRes.error}`)
						hasError = true
						continue
					}
					const writeAnswerRes = fsWriteFileSync(
						join(
							config.answer.dir,
							payloadFileName,
							`answer-${templateItem.idxFile.toString().padStart(3, '0')}-${templateItem.idxInFile.toString().padStart(3, '0')}.txt`,
						),
						aiRes.result,
					)
					if (!writeAnswerRes.ok) {
						logger.error(
							`on save answer (template ${templateItem.idxFile}:${templateItem.idxInFile}) for "${payloadFileName}": ${writeAnswerRes.error}`,
						)
						hasError = true
						continue
					}
				}
				if (!hasError) {
					logger.debug(`(${percent}%) answer(s) saved for "${payloadFileName}"`)
					filesSuccess++
				} else {
					filesError++
				}
			} else {
				if (!printPromptMode) {
					logger.debug(`prompt mode - "basic"`)
					printPromptMode = true
				}
				const prompt: TPrompt = {
					user: payloadRes.result,
				}

				const aiRes = await Ai(config.ai, prompt)
				if (!aiRes.ok) {
					logger.error(`on get answer for "${payloadFileName}": ${aiRes.error}`)
					filesError++
					continue
				}
				const writeAnswerRes = fsWriteFileSync(join(config.answer.dir, payloadFileName), aiRes.result)
				if (!writeAnswerRes.ok) {
					logger.error(`on save answer for "${payloadFileName}": ${writeAnswerRes.error}`)
					filesError++
					continue
				}
				logger.debug(`(${percent}%) answer saved for "${payloadFileName}"`)
				filesSuccess++
			}

			if (config.answer.hashDir) {
				const writeCurrentHashRes = fsWriteFileSync(join(config.answer.hashDir, `${payloadFileName}.hash`), hash)
				if (!writeCurrentHashRes.ok) {
					logger.error(`on write new hash: ${writeCurrentHashRes.error}`)
				}
			}
		}
	} catch (error) {
		if (getLogger.logger) {
			getLogger.logger.error(`${error}`)
		} else {
			console.error(`${error}`)
		}
	} finally {
		if (getLogger.logger) {
			getLogger.logger.debug(`FILES STATISTICS: total=${filesProcess}, success=${filesSuccess}, skipped=${filesSkipped}, error=${filesError}`)
			getLogger.logger.debug('APP STOP')
			getLogger.logger.close(() => {
				process.exit()
			})
		}
	}
}
