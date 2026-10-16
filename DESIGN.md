---
name: ComicPerfect console
description: A quiet local workspace for turning series and single comic drafts into finished pages.
colors:
  primary: "#386e69"
  background: "#f7f8fa"
  surface: "#fff"
  ink: "#252d35"
  muted: "#626e79"
  border: "color-mix(in srgb, var(--muted) 20%, var(--surface))"
  tint: "color-mix(in srgb, var(--brand) 8%, var(--surface))"
  error-ink: "#954437"
  error-surface: "#fff4ee"
typography:
  headline:
    fontFamily: '"UX Chinese", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-1px"
  title:
    fontFamily: '"UX Chinese", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "19px"
    fontWeight: 600
  body:
    fontFamily: '"UX Chinese", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: '"UX Chinese", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 500
rounded:
  image: "4px"
  badge: "5px"
  field: "6px"
  control: "7px"
  paper: "10px"
  dialog: "14px"
spacing:
  small: "8px"
  control: "12px"
  medium: "16px"
  card: "20px"
  panel: "24px"
  paper: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "11px 13px"
  navigation-active:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: "12px"
  badge:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.primary}"
    rounded: "{rounded.badge}"
    padding: "2px 8px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.paper}"
    padding: "24px"
---

# Design System: ComicPerfect console

## Overview

**Creative North Star: "ComicPerfect console"**

The user-supplied `/Users/lihaozhe/Downloads/comicperfect-ux.html` is the visual and interaction authority. This document records the shipped implementation in Operate mode; it does not introduce a new visual direction. The source of truth for extracted values is `frontend/css/style.css`, including its production overrides, with the shell direction contract in `index.html`, view patterns in `frontend/js/consoleViews.js`, transitions in `frontend/js/app.js` and draft migration in `frontend/js/consoleStore.js`.

The workspace uses light paper, restrained green accents, fine borders and compact Chinese typography. Persistent navigation and a breadcrumb frame the work. Series context and drafting stay close together; generated pages and historical versions remain readable as their own artifacts.

**Key Characteristics:**
- Quiet paper surfaces with fine neutral borders.
- A persistent desktop sidebar and responsive top navigation.
- Five-stage series planning and three-stage standalone or imported editors.
- Unified chapter rows, purpose-titled documents and selectable image versions.
- Secondary operations revealed through disclosures.

## Colors

The palette is neutral paper with a muted green primary accent. The frontmatter records the final cascade, including the darker production muted-text override.

### Primary

- **Workspace Green** (`primary`): primary actions, active navigation, selected tabs and step numbers, links, carets and focus outlines.
- **Green Wash** (`tint`): the featured series entry, selected navigation, badges, status strips and empty cover surfaces. Its CSS mix stays tied to the source custom properties.

### Neutral

- **Cool Background** (`background`): the surrounding workspace, quiet callouts, sketch panels and secondary control tracks.
- **White Paper** (`surface`): navigation, top bar, cards, editor sheets and dialogs.
- **Reading Ink** (`ink`): headings, body text and default controls.
- **Muted Slate** (`muted`): supporting descriptions, metadata, summaries and placeholders.
- **Fine Border** (`border`): paper edges, section dividers and fields; derived by the incumbent CSS mix.

Error strips use `error-ink` on `error-surface` and retain explicit explanatory text.

**The Reference Rule.** Preserve the supplied green and light paper identity when extending the console.

## Typography

The supplied licensed `UX Chinese` font loads from `frontend/assets/design-0.woff2`, with Arial, PingFang SC, Microsoft YaHei and sans-serif fallbacks. Its declared face supports weights 400–600. Controls inherit the same stack as the page.

Page headlines use the frontmatter headline role, reducing to (25px) on mobile. Section titles use the title role; smaller headings use (16px, weight 600). Entry headings use (21px), editor headings (22px), and document headings (24px / 19px). Body, labels, badges and metadata stay predominantly at the body size. Long document paragraphs use (1.9) line height; editable story text and sketch panels use (1.8). Maintain readable wrapping for long titles, paths and user content.

## Layout

The desktop shell reserves a fixed-width sidebar (236px), sticky at the viewport top and full viewport height. It uses (34px 22px 20px) padding. The white breadcrumb bar is (76px) high with (42px) horizontal padding. Main content is centered within a maximum width of (1380px), with (40px 44px 32px) padding.

Home entry cards use a (1.5fr / 1fr) split and (20px) gap. Series and work galleries have three equal columns with (22px) gaps. The editor pairs flexible paper with a (285px) context aside and (24px) gap; series details use a (280px) aside and (30px) gap. Panels use the panel spacing token, while editor paper uses the paper spacing token. Output pages form three columns with (15px) gaps. Storyboard confirmation uses a full-width, single-column reading stack so each page’s panels and dialogue can be reviewed in order. Its sheets use (24px) padding; document reading blocks stay within (75ch). Steppers wrap with (12px 24px) gaps rather than compressing five stages into a single line.

Responsive behavior follows the implemented breakpoints:

- At (1550px) and above, main top padding becomes (48px), entry padding (30px), and section spacing (40px).
- At (1150px) and below, the sidebar narrows to (205px), main padding becomes (30px), context columns become (245px), and entries use a (1.2fr / 1fr) split.
- At (850px) and below, navigation becomes a (76px) icon rail with small accessible-name captions. Settings remain at its bottom. Editor and detail columns stack; editor aside cards form two columns. Output pages become one column, capped at (450px). The top bar becomes (65px) high. Series and work galleries retain three columns until the mobile breakpoint.
- At (600px) and below, navigation moves to the top and wraps as needed; settings and principles remain reachable. Main padding becomes (25px 20px), the breadcrumb bar becomes (54px) high, entries and galleries become single-column, and editor aside cards stack. Series cards use a horizontal thumbnail treatment; work-library cards retain a full-width cover. Output pages lose the width cap. Steppers hide number circles, retain text labels and use (13px) labels. Actions and metadata wrap; the principles menu scrolls horizontally.

Unified chapter rows pair a (62px × 84px) thumbnail with a wrapping title, status, summary disclosure and adjacent actions. Below (1150px), actions wrap beneath the text with a (78px) inset. Below (600px), the thumbnail becomes (48px × 66px), actions occupy the full row with no inset, titles and status stack, and storyboard sheets reduce padding to (14px). Storyboard panel rows stack vertically on mobile; review actions wrap with a (150px) flexible basis. Keep step labels visible when number circles disappear.

## Elevation & Depth

Paper surfaces are flat at rest, separated by borders and tonal backgrounds. Gallery cards lift slightly on hover (translateY -3px) while their border turns green, using (0.18s) transitions. The selected segmented control uses a small shadow (`0 1px 3px var(--border)`). Toasts use `0 8px 35px var(--border)`; dialogs use a backdrop mixing ink at (35%) with transparency. Sticky job status remains above the work while generation runs.

Reduced-motion preferences disable animation, transitions and smooth scrolling. Keep this behavior when adding states.

## Shapes

Large paper surfaces use the paper radius; controls and callouts use the control radius, fields the field radius, badges the badge radius and image corners the image radius. Dialogs use the larger dialog radius. Fine (1px) borders repeat throughout. Step numbers and the profile avatar are circular; reference upload areas use a dashed border. Preserve these modest shapes and the reference's proportions.

## Components

### Buttons and fields

Primary buttons use green with white text; secondary buttons use white paper with ink text and a fine border. Both use (10px 17px) padding, weight (500), and a minimum height of (44px). Hover applies brightness (0.96). Disabled buttons have opacity (0.48) and a not-allowed cursor. Quiet actions and text links remain visually lighter.

Inputs, textareas and selects use white paper, fine borders and (11px 13px) padding. Textareas resize vertically; the main textarea has a minimum height of (140px). Keyboard focus uses a green (2px) outline with (4px) offset on links, buttons, fields and disclosure summaries. Keep explicit labels, the skip-to-content link, accessible button names and status announcements.

### Navigation, tabs and badges

Active navigation uses the green wash, green text and weight (600). Inactive links use muted text; hover uses the workspace background. Tabs use a green (2px) bottom border for the active item. Segmented controls place a small white selected surface over a background track. Green and neutral badges distinguish states without dominating cards.

### Cards, history and reading

Series and library cards display real covers when available; empty covers use a green wash and explicit text. Recent activity rows pair compact cover thumbnails with titles and metadata. Series detail tabs expose chapters, settings and creation history. A chapter ID has one chapter row: story summary, compiled storyboard, saved draft and comic actions resolve within that row. Ongoing plot plans appear in a separate “正在创作” section; they are drafts, not duplicate chapter entries. Each row communicates story approval separately from page-generation progress.

Settings documents are grouped under **故事与创作方向**, **人物** and **世界观**, with a disclosure for each meaningful purpose or document title. Number prefixes are removed from purpose IDs; generic repeated series headings must not obscure which document will open. The compact creation context shows **创作前需要了解**, covering current state, story thread, constraints and preferences. Documents are available on demand, without adding a checklist gate. History rows show saved drafts, dates, canon decisions and image-version counts, with a concrete viewing action. Principles are readable documents beside a selectable menu.

### Stepped editors and output

Planned series use five stages: **了解系列 → 描述想法 → 调整剧情 → 确认分镜 → 生成漫画**. Standalone comics use **描述想法 → 确认分镜 → 生成漫画**. Imported compiled series use **了解系列 → 调整分镜 → 漫画成品**, since their storyboards already exist. The active stage uses green text and a filled number circle; later stages require the corresponding story or storyboard before they become available. The aside carries context, applied rules and autosave feedback.

Plot editing and storyboard confirmation are separate surfaces. Planned series generate only the selected chapter’s storyboard, then show a reading stack of every page with editable dialogue and panel descriptions. Standalone and imported drafts expose per-page editing disclosures. The explicit **确认分镜，生成漫画** action starts image generation; text generation alone does not start it. Standalone/imported editing also offers a first-page trial when appropriate. Page labels translate technical PAGE IDs into readable page numbers.

**The Review Before Render Rule.** Keep story adjustment, storyboard confirmation and image generation visibly distinct; the primary action must name the next artifact it creates.

Draft changes autosave. Reentering a series resumes its unfinished plan; reentering standalone creation resumes the saved draft and shows a continuation note with an explicit **另起一篇** action. Imported compiled chapters reuse their saved review when available. Output switches between comic and storyboard views. Each page retains a version selector, preview, generation or redraw action, and download action. Story changes mark older images as stale while preserving them for viewing; batch generation targets pending or changed pages. Covers remain browsable as separate versions.

### Disclosures, status and canon review

Language, density, references, export, covers, social copy and story finalization use disclosures. Empty, loading, disconnected and failed states explain the condition and provide a concrete action; error strips use the error palette. Generation shows progress in the sticky status strip. Failed jobs explicitly say completed content is preserved and provide retry, settings and dismiss actions. Settings autosave with visible status and offer a return link to the draft, work or series that opened them; principles use the same return context. Provider/model options remain behind descriptive labels and advanced disclosures. Reconnecting the workspace is a concrete recovery action.

Canon review uses a dialog showing a summary, any conflicts, and the actual proposed file paths and contents in disclosures. Proposed text wraps within a quiet background block using the reading font. Conflicts disable confirmation. A separate explicit confirmation writes approved changes; draft editing and image generation do not serve as canon approval.

## Do's and Don'ts

### Do:

- **Do** preserve the supplied reference's shell, spacing, green accent, light paper and component proportions.
- **Do** keep settings and principles reachable at both compact navigation breakpoints.
- **Do** show real series, resumed drafts, autosave feedback and preserved image versions.
- **Do** keep one row per chapter and label grouped documents by their purpose.
- **Do** show storyboard confirmation before image generation, with readable page labels and explicit next actions.
- **Do** preserve the return path from settings and offer retry without discarding completed content.
- **Do** offer one direct 保存本话到系列 action, with continuity checks and preserved history.
- **Do** retain visible keyboard focus, readable wrapping, status announcements and reduced-motion behavior.

### Don't:

- **Don't** substitute a new visual direction for the user-supplied console.
- **Don't** populate production galleries with prototype examples presented as real work.
- **Don't** hide historical images when the storyboard changes.
- **Don't** repeat the same chapter as separate story and storyboard listings or use identical generic setting titles.
- **Don't** require a second confirmation, rewrite full scripts with AI, or treat every local edit as a global preference.
- **Don't** let advanced settings displace the primary story-editing task.

## Product language

The interface presents one creative workspace. Principles are 创作原则 and persistent series context is 创作记忆. ComicBrain is an internal integration name and must not appear in product chrome, help, synchronization states or canon confirmation. Omit split-product responsibility taglines. Settings explain what is saved and reused rather than naming Wiki or production directories.

## Saving series memory and retrospectives

The output stage exposes 保存本话到系列 above optional cover/export tools. One click checks continuity, extracts a compact plot summary and affected state changes, validates the resulting files, and saves. Authored panels and covers are serialized without AI rewrites. Conflicts block writing and show specific issues. Saved chapters retain their identity when edited and saved again; prior file versions and evidence remain recoverable.

本话复盘 is a separate disclosure: optional direction, generate/regenerate, editable body, explicit save, and previous draft history. Saving a chapter generates or updates its concise retrospective when needed, preserves manually edited prose, and records an assessment of human edits. Local choices stay in the chapter; reusable lessons can become series candidates. Explicit future guidance can update series creative requirements with evidence and exception conditions. The disclosure remains available to read, edit or regenerate the retrospective.


## Series character settings

Series detail includes a 人物设定 tab alongside chapters, setting documents and history. Each row pairs an editable name and upload actions with contained reference thumbnails. On narrow screens the fields and thumbnails stack. Save is explicit and available at the top and bottom of the list; reload recovers saved settings after a revision conflict. Existing confirmed visual sources initialize the list. Character rendering settings remain separate from narrative canon and existing generated pages.

## Contextual creative assistant

The top bar exposes 创作助手 (⌘/Ctrl+J) beside 使用说明. Contextual buttons open it for the current story, a single page, cover description, series document or global principle. The desktop panel occupies the right edge at 460px; at 1700px and above the workspace makes room for it. Mobile uses a full-width panel with modal focus containment, background inertness and an explicit close button. Preserve the existing paper, green accent, typography and button system.

The panel keeps target and impact scope above the scrollable conversation; the instruction composer remains at the bottom. 先讨论 and 提出具体修改 distinguish advice from concrete proposals. Proposals disclose before/after text and rule applications, with explicit adoption and keep-original actions. Draft adoption offers undo; document scope appears in the adoption label. Each target retains its own discussion and unsent instruction, and chapter/document navigation follows context. First-time creators receive a short inline path explanation and discussion entry. Page adjustment, future-series guidance, cover, social copy and export are visible where they are used; direct text editing and the existing quick-revision form remain available.

## Workspace selection and product mark

The sidebar exposes the current workspace name with 选择或切换空间; settings repeat a link to this destination. The workspace page shows its name, folder, series/principle counts, native Finder access, open/create actions and a bounded recent list. Disabled states explain startup configuration locks, unavailable folders and browser-only limitations. Switching saves first and relaunches. On mobile the workspace entry and settings share a compact row.

The logo is the teal and ivory three-panel speech-bubble mark in assets/brand/comicperfect-logo.png, generated with the built-in image tool. It replaces the temporary CP monogram and supplies favicons; desktop/icons/comicperfect.icns supplies macOS and Store builds. Preserve alpha and proportions; the full generation prompt is stored beside the asset.
