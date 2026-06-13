---
name: moark-doc-extraction
description: Extract and recognize text from documents, including PDF and DOCX files.
metadata:
  {
    "openclaw":
      {
        "emoji":"📖",
        "requires": { "env": ["GITEEAI_API_KEY"]},
        "primaryEnv": "GITEEAI_API_KEY"
      }
  }
---

# Document Extraction

```bash
python {baseDir}/scripts/perform_doc_extraction.py --file /path/to/document.pdf --api-key YOUR_API
```

解析输出中 `EXTRACTION_RESULT:` 开头的行并展示结果。无 `GITEEAI_API_KEY` 时提示用户提供 `--api-key`。