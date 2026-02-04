#!/usr/bin/env bun

import { Go } from '../src/go'
import { ELoggerMode } from '../src/logger'

Go({
	log: {
		dir: './debug/log',
		mode: ELoggerMode.REWRITE,
	},
	prompt: {
		dir: '/home/vitalii/Work/mentator/test_erp/ddl',
		templateReplaceJson: '{{json}}',
		templateReplacePayload: '{{payload}}',
		templateFile: [
			'/home/vitalii/Work/mentator/test_erp/promt-ddl_1.txt',
			'/home/vitalii/Work/mentator/test_erp/promt-ddl_2.txt',
			'/home/vitalii/Work/mentator/test_erp/promt-ddl_3.txt',
			'/home/vitalii/Work/mentator/test_erp/promt-ddl_4.txt',
			'/home/vitalii/Work/mentator/test_erp/promt-ddl_5.txt'
		]
	},
	answer: {
		dir: '/home/vitalii/Work/mentator/test_erp/answer',
		hashDir: '/home/vitalii/Work/mentator/test_erp/answer_hash'
	},
	ai: {
		kind: 'mentator',
		//url: 'http://localhost:11434',
		model: 'Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf',
		url: 'http://127.0.0.1:19777',
		//model: 'deepseek-coder:6.7b',
		//model: 'qwen2.5-0.5b-instruct-q5_k_m.gguf',
		timeout: 600000
	},
})
