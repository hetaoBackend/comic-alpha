# AGENTS.md

This file provides guidance to Codex/Claude Code when working with code in this repository.

## Project Overview

Comic Panel Generator is an AI-powered web application for creating multi-page comic storyboards with script generation, image generation, and social media content export. It supports Codex OAuth, OpenAI-compatible APIs, and Google Gemini for text generation. Image generation supports Google Gemini, OpenAI GPT Image, and a local-only Codex credential route that calls GPT Image through Codex.

## Development Commands

### Backend (Python with uv)

```bash
# Install dependencies
cd backend && uv sync

# Run backend server (starts on http://localhost:5003)
cd backend && uv run app.py
```

### Frontend

```bash
# Serve frontend (from project root)
python3 serve_frontend.py
# Then visit http://localhost:8000
```

### One-click Start

```bash
# macOS/Linux
./start.sh

# Windows
start.bat
```

## Architecture

### Backend Structure (Flask)

The backend follows a controller-service pattern:

- `backend/app.py` - Flask entry point, registers all blueprints
- `backend/controllers/` - API endpoint handlers (Flask blueprints)
  - `comic_controller.py` - `/api/generate`, `/api/validate` - comic script generation
  - `image_controller.py` - `/api/generate-image`, `/api/generate-cover` - image generation
  - `social_media_controller.py` - `/api/generate-xiaohongshu` - social content generation
  - `prompt_controller.py` - `/api/optimize-prompt` - prompt optimization
- `backend/services/` - Business logic
  - `comic_service.py` - Uses Codex, LangChain/OpenAI-compatible APIs, or Gemini for structured comic script generation
  - `image_service.py` - Image generation orchestration, reference image selection, and provider dispatch
  - `social_media_service.py` - Social media content generation
  - `prompt_optimizer_service.py` - Prompt enhancement
- `backend/comic_generator.py` - Core provider clients for Codex text/image routes, OpenAI GPT Image, and Gemini image generation

### Frontend Structure (Vanilla JS)

Modular JavaScript with classes exposed on `window`:

- `app.js` - `UIController` - main controller coordinating all modules
- `api.js` - `ComicAPI` - static methods for all backend API calls
- `renderer.js` - `ComicRenderer` - renders JSON scripts into comic panel previews
- `pageManager.js` - `PageManager` - multi-page state management
- `sessionManager.js` - `SessionManager` - localStorage-based session persistence
- `config.js` - `ConfigManager` - API key and settings persistence
- `i18n.js` - Internationalization (Chinese/English)
- `theme.js` - Dark/light mode toggle
- `exporter.js` - html2canvas-based image export

### Data Flow

1. User enters prompt + settings in frontend
2. `UIController` calls `ComicAPI.generateComic()`
3. Backend `ComicService` generates structured JSON via Codex, LangChain/OpenAI-compatible APIs, or Google Gemini
4. Frontend `ComicRenderer` renders JSON as sketch preview
5. User can generate final images via `ComicAPI.generateComicImage()` using sketch as reference
6. `ImageService` selects local style references, the current sketch, and previous generated pages before dispatching to Codex, OpenAI, or Gemini

### Comic Script Schema

```json
{
  "title": "Page Title",
  "rows": [
    {
      "height": "180px",
      "panels": [
        { "text": "Panel description with dialogue" }
      ]
    }
  ]
}
```

## Key Implementation Details

- Image generation providers:
  - `google` uses Gemini image generation and requires `google_api_key`
  - `openai` uses GPT Image-compatible APIs and requires `api_key`
  - `codex` uses local Codex credentials and is restricted to localhost requests
- Script generation uses Pydantic models (`ComicScript`, `ComicPage`, `Row`, `Panel`) for structured output
- Frontend stores sessions, configs, and generated images in localStorage
- Backend saves generated images to `backend/static/images/`
- Local character references live in `assets/refer_image/<style>/`. Filenames are always valid reference names; optional `characters.json` files add aliases, display names, and role hints.
- The embedded ComicBrain workspace provides compiled storyboards from
  `ComicBrain/production/<series-id>/<chapter-id>/storyboard.json`. Set
  `COMICBRAIN_ROOT` only when the workspace is elsewhere.
- Every ComicBrain chapter script has a sibling `04-封面描述.md`; the exporter
  compiles its short title and visual brief into `storyboard.json.cover` for
  cover generation.
- ComicBrain imports bypass AI script generation. Human edits are written to the
  embedded workspace's `review.json` as a draft and must never be treated as an
  automatic write-back to ComicBrain canon.
- For any series, character, worldbuilding, plot, storyboard, continuity, or
  creator-preference work, read `ComicBrain/AGENTS.md` and
  `ComicBrain/.agents/skills/comic-wiki/SKILL.md` completely before acting.
- When the creator approves, rejects, corrects, or requests a revision to comic
  content or collaboration behavior, also read
  `ComicBrain/.agents/skills/comic-feedback/SKILL.md` completely. This skill
  classifies the feedback and applies professional judgment before the Wiki
  skill records evidence or preferences.
- `ComicBrain/.gitignore` deliberately excludes the private vault, including
  evidence, canon, preferences, assets, and production projects. Never force-add
  those paths. Reusable behavior and scaffolding live under `.agents/skills/`;
  only those skills, `AGENTS.md`, and the production contract are eligible for
  Git.
- `serve_frontend.py` is the only supported local frontend server. It binds to
  loopback and serves only `index.html`, `frontend/`, `assets/`, and the exact
  generated-image directory `backend/static/images/`; do not replace it with a
  repository-root static server because that would expose ignored ComicBrain
  knowledge.
- Codex image generation applies reference budgets for performance:
  - `CODEX_MAX_PREVIOUS_PAGE_REFERENCES` defaults to `2`
  - `CODEX_MAX_COVER_PAGE_REFERENCES` defaults to `4`
  - `CODEX_REFERENCE_MAX_SIDE` defaults to `768`
- Supports comic styles: doraemon, american, watercolor, disney, ghibli, pixar, shonen, nezha, langlangshan
