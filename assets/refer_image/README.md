# Character Reference Images

This directory contains character reference images for each comic style. When generating comics or covers, the system will automatically load reference images from the corresponding style folder and pass them to the AI model.

## Directory Structure

```
refer_image/
├── doraemon/       # Doraemon style character references
├── american/       # American comic style character references
├── watercolor/     # Watercolor style character references
├── disney/         # Disney animation style character references
├── ghibli/         # Studio Ghibli style character references
├── pixar/          # Pixar animation style character references
├── shonen/         # Japanese shonen manga style character references
├── tom_and_jerry/  # Tom and Jerry style character references
├── nezha/          # Nezha (哪吒) style character references
└── langlangshan/   # Little Monster of Langlang Mountain (浪浪山小妖怪) style character references
```

## How to Use

1. Place your character reference images in the corresponding style folder
2. **Name the file with the character's name** (e.g., `Nobita.png`, `Tom.jpg`)
3. Supported image formats: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`
4. When generating comics with that style, the system will automatically:
   - Load matching reference images from the style folder
   - Extract character names from filenames
   - Resolve configured aliases into stable internal character IDs
   - Pass only the relevant images to the AI model with instructions to match the character appearances

## Optional Character Alias Metadata

Each style folder may include a `characters.json` file. This lets users type familiar creative shorthand while the generation pipeline uses safe internal names and the correct local reference image.

Example:

```json
{
  "characters": [
    {
      "aliases": ["兔子警官", "小兔"],
      "reference_name": "兔子",
      "safe_id": "rabbit_hero",
      "display_name": "兔子主角",
      "role_hint": "敏捷、认真、善于观察的主角"
    }
  ]
}
```

Rules:

- `reference_name` must match an image filename without extension, such as `兔子.jpg`.
- `safe_id` is used in panel scripts and continuity tracking.
- `display_name` is used in generated script text instead of alias strings.
- `aliases` are input-only shortcuts and should not be used in image prompts.

## Example

To add character references for Doraemon style comics:

```
refer_image/doraemon/
├── Doraemon.png      # AI will know this character is named "Doraemon"
├── Nobita.png        # AI will know this character is named "Nobita"
└── Shizuka.jpg       # AI will know this character is named "Shizuka"
```

When generating a Doraemon-style comic, the AI will use these images as references to ensure character consistency throughout the comic.

## Notes

- Use high-quality, clear images for best results
- Images should show the character clearly (preferably front-facing or 3/4 view)
- The filename (without extension) becomes the reference image name
- Multiple characters can be added to each style folder
