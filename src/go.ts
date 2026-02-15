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
import { goModeBasic } from './goModeBasic'
import { goModeTemplate } from './goModeTemplate'
import { goModeJsonPipe } from './goModeJsonPipe'
import { fsDeleteFileSync } from './util/fsDeleteFile'

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
		const resultFileList = [] as {fullFileName: string, fileText: string}[]

		for (const payloadFileName of payloadReadDirRes.result) {
			resultFileList.splice(0)

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
				filesSkipped++
				continue
			}

			const hash = gethash(payloadRes.result)
			if (config.answer.hashDir) {
				const hashFileName = join(config.answer.hashDir, `${payloadFileName}.hash`)
				const readCurrentHashRes = fsReadFileSync(hashFileName)
				if (!readCurrentHashRes.ok) {
					logger.error(`on read current hash: ${readCurrentHashRes.error}`)
					filesError++
					continue
				}
				if (hash === readCurrentHashRes.result) {
					if (config.log.debug?.hashNotChange) {
						logger.debug(`(${percent}%) hash not changed, ignore "${payloadFileName}"`)
					}
					filesSkipped++
					continue
				} else {
					fsDeleteFileSync(hashFileName)
				}
			}

			if (promptTemplateReadRes.result.jsonPipe) {
				if (!printPromptMode) {
					logger.debug(`prompt mode - "json pipe"`)
					printPromptMode = true
				}

				const modeJsonMipeRes = await goModeJsonPipe(config, payloadRes.result, promptTemplateReadRes.result)
				if (modeJsonMipeRes.ok) {
					resultFileList.push({fullFileName: join(config.answer.dir, `${payloadFileName}.json`), fileText: modeJsonMipeRes.result})
				} else {
					logger.error(`on process "${payloadFileName}": ${modeJsonMipeRes.error}`)
				}
			} else if (promptTemplateReadRes.result.list.length > 0) {
				if (!printPromptMode) {
					logger.debug(`prompt mode - "template"`)
					printPromptMode = true
				}
				const modeTemplateRes = await goModeTemplate(config, payloadRes.result, promptTemplateReadRes.result)
				if (modeTemplateRes.ok) {
					resultFileList.push(... modeTemplateRes.result.map(m => {
						return {
							fullFileName : join(config.answer.dir, payloadFileName, m.relativeFileName),
							fileText: m.fileText
						}
					}))
				} else {
					logger.error(`on process "${payloadFileName}": ${modeTemplateRes.error}`)
				}
			} else {
				if (!printPromptMode) {
					logger.debug(`prompt mode - "basic"`)
					printPromptMode = true
				}
				const modeBasicRes = await goModeBasic(config, payloadRes.result)
				if (modeBasicRes.ok) {
					resultFileList.push({fullFileName: join(config.answer.dir, `${payloadFileName}.json`), fileText: modeBasicRes.result})
				} else {
					logger.error(`on process "${payloadFileName}": ${modeBasicRes.error}`)
				}
			}


			if (resultFileList.length > 0) {
				let hasSaveResultError = false

				for (const item of resultFileList) {
					const writeItemRes = fsWriteFileSync(item.fullFileName, item.fileText)
					if (!writeItemRes.ok) {
						logger.error(`on save "${item.fullFileName}": ${writeItemRes.error}`)
						hasSaveResultError = true
					}
				}
				if (!hasSaveResultError && config.answer.hashDir) {
					const writeCurrentHashRes = fsWriteFileSync(join(config.answer.hashDir, `${payloadFileName}.hash`), hash)
					if (!writeCurrentHashRes.ok) {
						logger.error(`on write new hash: ${writeCurrentHashRes.error}`)
						hasSaveResultError = true
					}
				}
				if (!hasSaveResultError) {
					logger.debug(`(${percent}%) processed file ${payloadFileName}`)
					filesSuccess++
				} else {
					filesError++
				}

			} else {
				filesError++
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
