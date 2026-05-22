# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Comic Panel Generator is an AI-powered web application for creating multi-page comic storyboards with script generation, image generation, and social media content export. It uses Google Gemini for image generation and supports both OpenAI and Google Gemini for script generation.

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
python -m http.server 8000
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
  - `comic_service.py` - Uses LangChain + OpenAI/Gemini for structured comic script generation
  - `image_service.py` - Image generation orchestration
  - `social_media_service.py` - Social media content generation
  - `prompt_optimizer_service.py` - Prompt enhancement
- `backend/comic_generator.py` - Core Gemini image generation with `gemini-3-pro-image-preview` model

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
3. Backend `ComicService` generates structured JSON via LangChain (OpenAI) or Google Gemini
4. Frontend `ComicRenderer` renders JSON as sketch preview
5. User can generate final images via `ComicAPI.generateComicImage()` using sketch as reference
6. `comic_generator.py` uses Gemini image generation with reference images for consistency

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

- Image generation uses `gemini-3-pro-image-preview` with reference images for character consistency
- Script generation uses Pydantic models (`ComicScript`, `ComicPage`, `Row`, `Panel`) for structured output
- Frontend stores sessions, configs, and generated images in localStorage
- Backend saves generated images to `backend/static/images/`
- Supports comic styles: doraemon, american, watercolor, disney, ghibli, pixar, shonen

## Reference Character Onboarding

When the user adds new character reference images and asks Codex to make them usable, Codex should complete the metadata and verification work end to end. The intended workflow is: the user places image files in `assets/refer_image/<style>/`, then Codex updates the corresponding metadata so the user can immediately generate comics with those characters.

### Character Image Rules

- Put character images under `assets/refer_image/<style>/`.
- The image filename without extension is the `reference_name`; keep it short and stable, for example `兔子.jpg`, `狐狸.jpg`, or `detective_luna.png`.
- Supported formats are `.png`, `.jpg`, `.jpeg`, `.webp`, and `.gif`.
- Do not rename or delete user-provided images unless the user explicitly asks.

### Alias Metadata

Each style folder may contain `characters.json`. If it does not exist, create it. If it exists, merge new entries without removing existing ones.

Expected shape:

```json
{
  "characters": [
    {
      "aliases": ["用户会输入的名字", "常用昵称"],
      "reference_name": "图片文件名不含扩展名",
      "safe_id": "stable_snake_case_id",
      "display_name": "脚本里显示的安全名字",
      "role_hint": "角色性格、职业、故事功能"
    }
  ]
}
```

Field rules:

- `reference_name` must exactly match a local image filename without extension.
- `safe_id` must be stable ASCII snake_case and unique inside that style, such as `rabbit_hero` or `fox_partner`.
- `display_name` should be safe for scripts and image prompts. Prefer descriptive original names such as `兔子主角`, `狐狸搭档`, `月亮侦探`.
- `aliases` are input-only shorthand. They may include nicknames or user-facing names, but image-bound prompts should use `safe_id`, `display_name`, and `reference_name`.
- `role_hint` should be concise and useful for story generation, not a visual clothing description.

### If The User Only Provides Images

When the user says they have added images but does not provide aliases or role hints:

1. Inspect `assets/refer_image/<style>/` and identify new image filenames.
2. Infer conservative aliases from the filename, including the filename itself and obvious Chinese/English variants when clear.
3. Generate a safe `safe_id` from the filename. If transliteration is ambiguous, use a simple stable fallback like `character_<reference_name_slug>`.
4. Use a neutral `display_name` based on the filename.
5. Use a modest `role_hint`, such as `主要角色`, unless the filename or user request clearly implies a role.
6. Update `characters.json`.
7. Run a lightweight verification that `ImageService.resolve_reference_characters(style, prompt)` resolves the aliases to the intended `reference_name`.
8. If backend code changed, run `uv run python -m py_compile` for touched backend files.

### Protected Or Brand-Adjacent Names

If a user-facing alias is a known protected, brand, or existing fictional character name, keep it only as an alias for user convenience. Do not use that alias as `safe_id`, `display_name`, panel character ID, dialogue speaker name, or image prompt text. Map it to an original descriptive display name and the local reference image instead.
