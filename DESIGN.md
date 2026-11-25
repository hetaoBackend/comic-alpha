---
name: ComicPerfect studio
description: A compact comic creation studio with authored work at its center.
colors:
  brand: "#28665b"
  brand-hover: "#1e5449"
  tint: "#eaf2ee"
  background: "#f3f5f5"
  surface: "#fff"
  chrome: "#fbfcfb"
  ink: "#24332f"
  muted: "#62716d"
  border: "#dfe5e2"
  field-border: "#cfd9d3"
  danger: "#954437"
  danger-tint: "#faeeec"
typography:
  headline:
    fontFamily: '"UX Chinese", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "25px"
    lineHeight: 1.4
    letterSpacing: "-.025em"
  title:
    fontFamily: '"UX Chinese", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "17px"
    letterSpacing: "-.015em"
  body:
    fontFamily: '"UX Chinese", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "13px"
    lineHeight: 1.65
  label:
    fontFamily: '"UX Chinese", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 500
rounded:
  badge: "4px"
  step: "5px"
  control: "6px"
  panel: "8px"
spacing:
  tight: "8px"
  compact: "12px"
  inset: "16px"
  section: "24px"
  canvas: "28px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 11px"
    height: "38px"
  navigation-active:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.brand}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  badge:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.brand}"
    rounded: "{rounded.badge}"
    padding: "3px 7px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "22px"
---

# Design System: ComicPerfect studio

## Overview

**Creative North Star: "The Comic Creation Studio"**

The creator selected “像创作软件一样，作品在中间、工具在两侧”: navigation on the left, authored work in the center, contextual tools and assistance on the right. This studio implementation supersedes the old comicperfect-ux.html reference. PRODUCT.md and the direction contract in index.html record that authority; surface seed 30115194 is subordinate to the creator’s choice.

Cool neutral surroundings and white working paper keep real comic artwork prominent. Compact Chinese typography, restrained teal actions and fine borders give the interface the density of a creation tool. The visual source of truth is frontend/css/studio.css loaded after frontend/css/style.css; view composition and tool relocation live in frontend/js/consoleViews.js, app.js, workspaceUI.js and creativeAssistant.js.

**Key Characteristics (revised 2026-11-24 at the creator's request):**

- Authored work stays central; navigation and contextual tools frame it.
- Cool neutral studio surfaces, white paper and restrained teal actions.
- Compact controls, clear artifact stages and quiet status labels.
- Real workspace artwork and preserved versions supply the imagery.
- Parameters sit inline beside the work; one primary action per screen.

The refreshed record is based on final sources and desktop, editor, series, workspace, settings, 1067px, mobile and assistant-parameter screenshots in .impeccable/review/. Both findings in the scoped finish review were resolved; the reviewer’s scoped verdict is ship. This record does not claim full runtime accessibility verification.

## Colors

Primary is muted teal: brand identifies meaningful actions, selected navigation and links; brand-hover deepens primary buttons, and tint supports selected states. Neutral background separates the studio from white paper; chrome subtly distinguishes the sidebar, toolbar and assistant thread. Ink and muted provide reading hierarchy. Border divides surfaces; field-border makes editable controls recognizable. Frontmatter values are normative. Real comic images provide expressive color rather than decorative interface gradients.

## Typography

The local UX Chinese font, with the existing system fallbacks, remains the shared reading and control family. Body and editable fields use compact type (13px); buttons, field labels and tabs are generally smaller (12px). Page headings use the headline role, section headings the title role, and small metadata ranges from 10–11px. On mobile page headings reduce to 22px. Editor titles and resume headings use 20px; document copy favors a relaxed reading line height (1.9). Avoid introducing an unrelated display face.

## Layout

The desktop shell has a sticky full-height left sidebar (196px), toolbar (56px), and centered main area capped at 1400px with 28px padding. Editor and series detail views use one working column: text steps cap the paper at 960px and the comic output uses the full width. The editor paper has 28px padding and a sticky bottom action strip. There is no separate inspector; every control sits with the work it changes. Home uses a resume panel, compact recent-work rows, a right creation-tool column (244px), and horizontal artwork cards for series. Settings form one grouped white surface capped at 880px; workspace management is capped at 900px.

**The Central Work Rule.** Let the authored story or comic be the dominant working surface; side areas support the current task.

At widths up to 1150px the sidebar becomes 180px and main padding 24px. At 761–959px it becomes a 68px navigation rail with icons and small labels and recent series disappear. Settings and workspace identity remain reachable.

At 760px and below navigation moves to a wrapping top header; settings and workspace share the identity row, with the main destinations below. The toolbar reduces to 48px, main padding becomes 22px 16px, and editor, detail and principle layouts stack. The editor paper uses 20px padding, output becomes one column, home series cards stack, and the general series gallery retains two columns. Creation tools follow the main work.

The assistant docks at the right (350px). At 960px and above an open assistant reserves that width in the shell and narrows the working column; home hides its right tools. Below 960px the assistant overlays rather than reserving shell width. At 760px and below its width is min(420px, 100vw). Its modal role, focus containment and background inertness currently activate at 600px and below, a separate behavior threshold from the 760px visual layout.

## Elevation & Depth

White paper, quiet tonal fills and thin borders establish hierarchy. Main panels, series cards, work cards and the assistant have no shadow. Hover changes border or color without translation. The inherited selected-segment shadow (0 1px 3px var(--border)) and toast shadow (0 8px 35px var(--border)) are limited exceptions. Card border changes use a short transition (.18s); reduced-motion rules disable transitions and animations.

**The Flat Studio Rule.** Use tonal surfaces and fine borders for structure; cards and the assistant do not lift on hover.

## Shapes

Soft rectangular corners keep the interface practical: panels use 8px, controls 6px, selected steps 5px and badges 4px. The resume panel uses 9px corners. Dividers are fine single-pixel strokes; artwork stays contained in proportionate thumbnails. Preserve the existing teal and ivory panel/speech-bubble mark in assets/brand/comicperfect-logo.png, its transparency and proportions. This redesign adds no raster assets. Comic thumbnails and generated pages are user data, not interface identity assets.

## Components

Buttons are compact and explicit: standard actions have a 36px minimum height, 12px text and 8px 13px padding; toolbar actions use 32px minimum height. Primary buttons use teal and white with a darker hover. Secondary buttons remain white with a neutral border. Disabled buttons use .48 opacity and a not-allowed cursor. Keyboard focus uses the inherited 2px teal outline with a 4px offset.

Inputs use a 38px minimum height, 13px text, 8px 11px padding, a quiet field border and 6px corners. Text areas use comfortable line spacing (1.8) and padding. Focus turns the border teal with a 2px tint outline and a 1px offset; existing focus-visible selectors provide the stronger keyboard indication.

Navigation uses small outline SVG icons, compact labels and a tinted selected row. Sidebar destinations are at least 42px tall; recent series are 36px. The bottom identity area contains 创作原则 and 创作设置 as secondary destinations above one workspace entry, with current folder name and “选择或切换空间”. Do not add a duplicate identity card. Mobile retains all main destinations with compact labels.

The editor stage strip wraps compact steps on a neutral green-gray track; the current step is white with teal text. An established series starts at 设计剧情 (four steps); only a new series begins with 系列设定. Story adjustment, storyboard confirmation and image generation remain distinct. The central paper contains content and a sticky next-action strip. 设计剧情 opens with the reference-scene picker (按脉络顺序 / 我来选 / AI 自动选段). 调整剧情 shows the source scene and where its reversal landed, the story skeleton with a highlighted 反转 block, then the four beats 起、承、转、合. Rule applications collapse at the end of the step. Each screen has one primary action: rare or destructive actions use quiet text buttons, the ⋯ menu in the editor header, or the danger zone at the end of 创作记录.

**The Inline Parameters Rule.** Page or chapter count and style live in a compact row inside the working paper at every width. Language, rows per page, pages per chapter and the reference image stay in the 更多设置 disclosure directly below. Opening the assistant or changing the viewport moves nothing, so state and a single copy of each field are preserved by construction.

The assistant keeps target and impact scope above the scrollable thread and the instruction composer at its bottom. Discussion and concrete edits remain separate; proposals show before/after text with adoption and keep-original actions. Draft edits offer undo. The global toolbar and contextual entries use the same button system.

Recent work uses thumbnail-led rows, quiet state badges and small metadata, without per-row delete buttons. Series detail keeps each chapter in one row with story, storyboard and image progress; its tabs are 章节与漫画, 人物设定, 参考与脉络 (reference work, 亮点剧情 discovery and the ordered storyline), 系列资料 and 创作记录; grouped documents use purpose-titled disclosures. Settings autosave visibly and retain a return path. Workspace management explains ownership, location and platform availability in readable grouped sections. Error, loading and disconnected states provide concrete recovery actions while preserving completed work.

## Do's and Don'ts

### Do:

- Do keep the authored canvas central and reserve side areas for navigation and contextual tools.
- Do preserve settings and workspace access in the full sidebar, compact rail and mobile header.
- Do keep generation parameters inline in the working paper and show the reversal of a story before its beats.
- Do use real workspace artwork, readable empty states and preserved image versions.
- Do distinguish story editing, storyboard confirmation and image generation with explicit next actions.
- Do retain visible focus, readable wrapping, status feedback and reduced-motion support.

### Don't:

- Don’t restore the superseded HTML reference as visual authority.
- Don’t enlarge routine controls into promotional cards or add decorative artwork to the studio chrome.
- Don’t reintroduce a side inspector, duplicate the primary action on one screen, or place a destructive button beside a primary one.
- Don’t duplicate the workspace identity into a second sidebar card.
- Don’t hide historical images when a story changes or present prototype examples as real work.
