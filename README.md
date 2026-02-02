<div id="badges">
  <a href="https://www.linkedin.com/in/vasilev-vitalii/">
    <img src="https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn Badge"/>
  </a>
  <a href="https://www.youtube.com/@user-gj9vk5ln5c/featured">
    <img src="https://img.shields.io/badge/YouTube-red?style=for-the-badge&logo=youtube&logoColor=white" alt="Youtube Badge"/>
  </a>
</div>

[Русский](README.rus.md)

# mentator-llm-prompter

A powerful CLI utility for batch processing prompts through various AI providers with support for multiple operation modes.

## Features

- **Multiple AI Provider Support**: Works with OpenAI-compatible APIs, Ollama, and Mentator LLM Service
- **Three Operation Modes**: Basic, Template, and JSON Pipeline modes for different use cases
- **Batch Processing**: Process multiple files automatically with built-in caching
- **Structured Output**: Support for JSON schema-based responses with grammar enforcement
- **Progress Tracking**: Real-time progress indicators and comprehensive statistics
- **JSONC Configuration**: Human-friendly configuration format with comments support

## Installation

```bash
npm install
npm run build
```

## Quick Start

1. Generate a configuration template:
```bash
node dist/index.js --conf-gen /path/to/directory
```

2. Edit the generated `mentator-llm-prompter.config.TEMPLATE.jsonc` file with your settings

3. Generate a prompt template (optional):
```bash
# For plain text responses
node dist/index.js --prompt-gen /path/to/directory

# For JSON responses
node dist/index.js --prompt-gen-json /path/to/directory
```

4. Run the processor:
```bash
node dist/index.js --conf-use /path/to/your/config.jsonc
```

## Configuration

The configuration file uses JSONC format (JSON with comments). Here's the structure:

```jsonc
{
  "log": {
    "dir": "/path/to/logs",
    "mode": "REWRITE"  // or "APPEND"
  },
  "ai": {
    "kind": "openapi",  // or "ollama" or "mentator"
    "url": "http://localhost:11434",
    "api_key": "your-api-key",  // optional for Ollama, required for OpenAI
    "timeout": 600000,
    "model": "deepseek-coder:6.7b"
  },
  "prompt": {
    "dir": "/path/to/input/files",
    "templateReplacePayload": "{{payload}}",
    "templateReplaceJson": "{{json}}",
    "templateFile": [
      "/path/to/template1.txt",
      "/path/to/template2.txt"
    ]
  },
  "answer": {
    "dir": "/path/to/output",
    "hashDir": "/path/to/hash"  // optional: for change detection
  }
}
```

## Operation Modes

The application automatically selects the operation mode based on your configuration. Each mode serves different use cases.

### Mode 1: Basic (Simple Processing)

**When it activates**: No template files specified (`templateFile` is empty or not set)

**How it works**:
- Each file in `prompt.dir` is treated as a complete prompt
- File content is sent directly to the AI as a user message
- One response per file
- Ideal for simple, standalone questions

**Example Use Case**:
```
prompt.dir/
├── question1.txt ("What is TypeScript?")
├── question2.txt ("Explain async/await")
└── question3.txt ("What are closures?")

→ Each file generates one answer file with the same name
```

**Configuration**:
```jsonc
{
  "prompt": {
    "dir": "/path/to/questions",
    // No templateFile specified
  }
}
```

### Mode 2: Template (Multiple Prompts per File)

**When it activates**: Template files specified AND no JSON response required

**How it works**:
- Uses predefined prompt templates with `{{payload}}` placeholders
- Each input file is processed with ALL templates
- Generates multiple answer files per input (one per template)
- Templates can have system messages and custom options
- Perfect for analyzing the same content from different perspectives

**Example Use Case**:
```
Analyze code files with different aspects:

template1.txt:
---
system: You are a security expert
user: Review this code for security issues: {{payload}}
---

template2.txt:
---
system: You are a performance expert
user: Analyze performance issues in: {{payload}}
---

Input: code.js
Output:
  - code.js/answer-000-000.txt (security review)
  - code.js/answer-001-000.txt (performance analysis)
```

**Template Format** (using vv-ai-prompt-format):
```
---
system: System message here
user: User message with {{payload}} placeholder
options:
  temperature: 0.7
  max_tokens: 1000
---
```

**Configuration**:
```jsonc
{
  "prompt": {
    "dir": "/path/to/files",
    "templateReplacePayload": "{{payload}}",
    "templateFile": [
      "/path/to/security-review.txt",
      "/path/to/performance-analysis.txt"
    ]
  }
}
```

### Mode 3: JSON Pipeline (Chained Structured Queries)

**When it activates**:
- AI provider is `mentator`
- Templates have `jsonresponse` (JSON schema) defined
- All templates must consistently use or not use `jsonresponse`

**How it works**:
- Processes input through a chain of prompts
- Each prompt must return JSON matching the schema
- Result from prompt N becomes `{{json}}` variable for prompt N+1
- Multiple prompts in one template file = variants of the same question (tries until non-empty result)
- Different template files = sequential questions in the pipeline
- Accumulates and enriches the result progressively
- **Special rule**: If first question returns empty result - saves empty and stops (success)
- **Special rule**: If subsequent questions return empty result - error

**Example Use Case**:
```
Extract structured data through multiple refinement steps:

Step 1 (template1.txt - extract basic info):
---
user: Extract all people from this text: {{payload}}
jsonresponse:
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "name": {"type": "string"},
      "age": {"type": "integer"}
    }
  }
}
---

Step 2 (template2.txt - enrich with additional data):
---
user: Add occupations for these people: {{json}}
Context: {{payload}}
jsonresponse:
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "name": {"type": "string"},
      "age": {"type": "integer"},
      "occupation": {"type": "string"}
    }
  }
}
---

Result: Single enriched JSON file with complete information
```

**Variant Questions** (multiple prompts in one file):
```
All prompts in ONE template file are variants of the same question.
The system tries them sequentially until one returns non-empty JSON.

Example - trying different extraction strategies:
---
user: Extract people using formal language: {{payload}}
jsonresponse: {...}
---
user: Extract people using simple language: {{payload}}
jsonresponse: {...}
---
user: List all person mentions: {{payload}}
jsonresponse: {...}
---
```

**Configuration**:
```jsonc
{
  "ai": {
    "kind": "mentator",  // Required for JSON Pipeline mode
    "url": "http://localhost:12345"
  },
  "prompt": {
    "dir": "/path/to/documents",
    "templateReplacePayload": "{{payload}}",
    "templateReplaceJson": "{{json}}",
    "templateFile": [
      "/path/to/step1-extract.txt",
      "/path/to/step2-enrich.txt",
      "/path/to/step3-validate.txt"
    ]
  }
}
```

**Template with JSON Response**:
```
---
system: Extract structured data
user: Get all people from: {{payload}}
options:
  temperature: 0
segment:
  mentator-llm-service: '{"useGrammar":true}'
jsonresponse:
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "name": {"type": "string"},
      "age": {"type": "integer"}
    },
    "required": ["name"]
  }
}
---
```

## Mode Comparison Table

| Feature | Basic | Template | JSON Pipeline |
|---------|-------|----------|---------------|
| **Configuration** | No templates | Templates without JSON | Templates with JSON + Mentator |
| **Input → Output** | 1 → 1 | 1 → N | 1 → 1 (enriched) |
| **Use Case** | Simple Q&A | Multi-aspect analysis | Data extraction pipeline |
| **Chaining** | No | No | Yes ({{json}}) |
| **Structured Output** | Optional | Optional | Required |
| **Variants Support** | No | No | Yes (within one template) |
| **Empty Result Handling** | Error | Error | First: OK, Others: Error |

## AI Provider Configuration

### OpenAI (and compatible APIs)

```jsonc
{
  "ai": {
    "kind": "openapi",
    "url": "https://api.openai.com",
    "api_key": "sk-...",
    "model": "gpt-4",
    "timeout": 600000
  }
}
```

### Ollama

```jsonc
{
  "ai": {
    "kind": "ollama",
    "url": "http://localhost:11434",
    "model": "llama2:13b",
    "timeout": 600000
  }
}
```

### Mentator LLM Service

```jsonc
{
  "ai": {
    "kind": "mentator",
    "url": "http://localhost:19777",
    "model": "model-name.gguf",
    "timeout": 600000
  }
}
```

## Hash-Based Change Detection

Enable smart caching to skip unchanged files:

```jsonc
{
  "answer": {
    "dir": "/path/to/answers",
    "hashDir": "/path/to/hash"  // Store SHA-256 hashes here
  }
}
```

When enabled:
- Computes SHA-256 hash of each input file
- Compares with stored hash
- Skips processing if content hasn't changed
- Saves time and API costs

## Output and Logging

### Console Output
- Real-time progress with percentage: `(25%) answer saved for "file.txt"`
- Final statistics: `FILES STATISTICS: total=100, success=95, skipped=3, error=2`

### Log Files
- **REWRITE mode**: Single `mentator-llm-prompter.log` file (overwritten each run)
- **APPEND mode**: Timestamped logs like `mentator-llm-prompter.20240115-143022.log`

### Answer Files
- **Basic mode**: `answer/file.txt`
- **Template mode**: `answer/file.txt/answer-000-000.txt`, `answer/000-001.txt`, ...
- **JSON Pipeline mode**: `answer/file.txt` (JSON format)

## Command Reference

```bash
# Generate configuration template
--conf-gen /path/to/directory

# Generate prompt template (plain text)
--prompt-gen /path/to/directory

# Generate prompt template (JSON mode)
--prompt-gen-json /path/to/directory

# Run processing
--conf-use /path/to/config.jsonc

# Show help
# (no arguments)
```

## Use Cases and Examples

### Use Case 1: Code Review (Template Mode)
Review multiple code files from different perspectives:
- Create templates for: security, performance, best practices, documentation
- Process all `.js` files in repository
- Get 4 review files per source file

### Use Case 2: Document Analysis (Basic Mode)
Analyze a collection of documents:
- One question per document in separate files
- Process in batch
- Each document gets one answer

### Use Case 3: Structured Data Extraction (JSON Pipeline)
Extract and enrich data from unstructured text:
- Step 1: Extract entities (people, places, dates)
- Step 2: Add relationships
- Step 3: Validate and normalize
- Get single enriched JSON per document

### Use Case 4: Content Translation Pipeline (JSON Pipeline)
- Step 1: Extract key phrases
- Step 2: Translate with context preservation
- Step 3: Validate terminology consistency
- Uses previous results at each step

## Troubleshooting

### Templates not activating
- Check `templateFile` array is not empty
- Verify file paths are absolute
- Ensure files exist and are readable

### JSON Pipeline not working
- Verify `ai.kind` is set to `"mentator"`
- Check all templates have `jsonresponse` defined
- Validate JSON schema syntax
- Don't mix templates with/without JSON response

### Empty results in JSON Pipeline
- First question returning empty: This is normal, result saved as success
- Subsequent questions empty: Check error logs, this indicates a problem
- Try using variant questions (multiple prompts in one template)

### Performance issues
- Enable `hashDir` to skip unchanged files
- Reduce `timeout` for faster failure detection
- Process smaller batches
- Check AI provider response times

## Dependencies

- **vv-config-jsonc**: JSONC configuration handling
- **vv-ai-prompt-format**: Prompt template parsing
- **@sinclair/typebox**: Schema validation
- **minimist**: CLI argument parsing

## License

See LICENSE file for details.

## Links

- GitHub: https://github.com/VasilevVitalii/mentator-prompter
- Mentator LLM Service: [link to mentator service]
- Issues: https://github.com/VasilevVitalii/mentator-prompter/issues
