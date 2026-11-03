# Wordbook

A personal English vocabulary notebook for learning words in context: read an English definition, listen to pronunciation, compare related words, write a sentence, and keep useful notes.

The interface is designed for Chinese-speaking English learners. Translation is available on demand rather than replacing the English explanation immediately.

## Features

- Save and search a personal vocabulary list.
- Look up English definitions, parts of speech, and example sentences.
- Listen to available dictionary audio or use device speech synthesis as a fallback.
- Reveal Chinese translations when needed.
- Explore synonyms and turn a comparison into a study question.
- Keep per-word notes, question drafts, and successful tutoring conversations.
- Copy a question for manual use in ChatGPT without configuring an API key.
- Optionally receive explanations directly in the app through a local OpenAI API proxy.
- Export vocabulary, notes, and saved conversations as JSON.

## Run locally

Requires **Node.js 22 or newer**. There are no third-party npm dependencies.

```sh
npm run build
npm start
```

Open **http://127.0.0.1:4173/**. Stop the server with `Ctrl+C`.

On macOS, `Start.command` provides a double-click launcher. It checks for an available bundled Node runtime and then the system `node` command.

For the static notebook and the manual ChatGPT workflow, you can open `dist/index.html` directly. External dictionary requests may be restricted by the browser when using a local file URL. In-app AI answers require the local server.

## Optional AI configuration

The notebook works without an API key. To enable answers inside the app:

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY` and choose an `OPENAI_MODEL` available to your API account.
3. Restart the local server.

```dotenv
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=your_available_model
PORT=4173
```

On macOS, `Configure AI.command` can prompt for the key without displaying it while typing.

API credentials and applicable account access or billing are required for this optional feature. The app does not purchase credits. Never commit a real key: `.env` is ignored and the example file contains no credentials.

## Architecture

A vanilla JavaScript frontend communicates with public dictionary services and, optionally, a small Node.js backend for tutoring. The backend keeps the API key outside the browser and binds to the loopback interface.

| File | Purpose |
| --- | --- |
| `dist/app.js` | Vocabulary selection, notes, pronunciation, and UI behavior |
| `dist/lib.js` | Input normalization and persisted-data compatibility |
| `dist/dictionary.js` | Dictionary lookup and fallback handling |
| `dist/learning.js` | Synonyms, question drafts, and tutoring conversations |
| `dist/app.bundle.js` | Generated browser bundle; edit source modules instead |
| `build.mjs` | Dependency-free frontend bundling |
| `server.mjs` | Local server, API route, and request limits |
| `tutor.mjs` | Tutoring input validation and upstream API handling |
| `tests/` | Data, learning, and server-boundary tests |

After editing frontend source modules, run `npm run build` before refreshing the page.

## Validation

```sh
npm test
```

Tests use mocked tutoring responses to check request shaping, error handling, history limits, data compatibility, and separation of private server files. Passing mocked tests does not verify a live API account or guarantee model answer quality.

## External services

- **Free Dictionary API:** primary dictionary data and available recordings.
- **Wiktionary:** fallback dictionary source; source and license links remain visible in the interface.
- **Datamuse:** additional related words and synonyms.
- **MyMemory:** on-demand Chinese translation.
- **OpenAI API:** optional in-app explanations.

Availability, quotas, and access requirements depend on each provider. Synonyms are suggestions, not guarantees that two words are interchangeable in every context.

## Data and privacy

Words, notes, cached synonyms, drafts, and saved conversations remain in the current browser's `localStorage`. There is no cloud synchronization or database. This version exports JSON but does not include a JSON import interface.

Dictionary queries send the requested word to the relevant provider. Translation is requested only when activated. In-app tutoring sends the current word, selected reference definitions, the current question, and limited recent conversation context through the local server. Unrelated vocabulary entries and private notes are not automatically included.

The API key stays in the server environment or `.env`, outside `dist/`. The server does not write chat logs, and upstream requests disable response storage where configured; provider policies still apply. Different browsers, domains, and ports use different local storage.

## Project notes

A personal learning application developed with AI assistance. Core vocabulary and note-taking features are available without live AI. Static hosting supports the notebook interface, but direct in-app tutoring requires a backend. This repository does not include personal vocabulary exports, private credentials, or a configured live API account.
