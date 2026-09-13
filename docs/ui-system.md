# HackSync — Phase 7: Design System Specification

**Document Status:** Production Baseline  
**Phase:** 7 — Complete Productization + Professional UI/UX Redesign  
**Theme:** Austere Developer Engineering Platform

---

## 1. Design Thesis & Visual Identity

HackSync is an engineering control platform designed for professional software engineers, security researchers, and developer teams. Its user interface rejects generic SaaS templates, "AI chatbot" tropes, and flashy design slop in favor of:
- **High information density** with clear visual rhythm
- **Austere dark neutral palette** optimized for prolonged development sessions
- **Monospace precision** for code, paths, AST symbols, commit hashes, and tabular metrics
- **Predictable geometry** with strict border-radius scaling
- **Calm, purposeful motion** strictly reserved for state transitions and feedback

---

## 2. Color Palette & Tokens

The color architecture is built around deep charcoal/slate surfaces, a restrained electric blue primary accent, and unambiguous semantic indicators.

### 2.1 Surfaces & Backgrounds
| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `--background` | `#0B0F14` | Main application void background, deepest surface |
| `--surface` | `#11161D` | Standard panels, cards, sidebar, table rows |
| `--surface-raised` | `#171D26` | Active tab items, hovered surfaces, dropdowns |
| `--popover` | `#171D26` | Modal popovers, context menus, tooltips |
| `--border` | `#252D38` | Standard structural borders, dividers |
| `--border-strong` | `#374151` | Focused inputs, active cards, emphasis lines |

### 2.2 Accent & Brand
| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `--primary` | `#4F8CFF` | Primary action buttons, active navigation indicator, AST symbol highlights |
| `--primary-foreground` | `#0B0F14` | High-contrast text on primary blue buttons |
| `--ring` | `#4F8CFF` | Keyboard focus ring |

### 2.3 Semantic Indicators
| Status | Hex Value | Tint Background | Usage |
| :--- | :--- | :--- | :--- |
| **Success** | `#22C55E` | `rgba(34, 197, 94, 0.10)` | Passing test suites, clean merge branches, healthy security score |
| **Warning** | `#F59E0B` | `rgba(245, 158, 11, 0.10)` | Pending approvals, branch drift warnings, medium SAST findings |
| **Danger** | `#EF4444` | `rgba(239, 68, 68, 0.10)` | Critical/High SAST vulnerabilities, test failures, merge conflicts |
| **Info** | `#38BDF8` | `rgba(56, 189, 248, 0.10)` | Benchmark dataset hashes, documentation references, API tags |

### 2.4 Typography Hierarchy
| Token | Hex Value | Usage |
| :--- | :--- | :--- |
| `--foreground` | `#F3F4F6` | Primary headers, active labels, body text |
| `--muted-foreground` | `#9CA3AF` | Secondary descriptions, timestamps, inactive icons |
| `--text-muted` | `#6B7280` | Line numbers, subtle breadcrumbs, disabled states |

---

## 3. Typography Architecture

### 3.1 Font Families
- **Interface & Prose:** `Inter`, `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  - High legibility at 11px–13px micro-sizes
  - Open counters, balanced x-height, neutral letterforms
- **Code & Metrics:** `JetBrains Mono`, `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
  - Used for AST symbol names, file paths, diffs, line numbers, JSON schemas, and tabular numbers

### 3.2 Type Scale
- `text-2xl` (24px / font-semibold): Page titles (`PageHeader`)
- `text-base` (16px / font-semibold): Panel headers, modal titles
- `text-sm` (14px / font-medium): Section subtitles, metric values
- `text-xs` (12px / font-normal): Primary body text, table cells, form labels
- `text-[11px]` (11px / font-medium / mono): File paths, status badges, timestamps
- `text-[10px]` (10px / font-bold / mono / uppercase): Category tags, severity tags

---

## 4. Geometry, Spacing & Elevation

### 4.1 Border Radiuses
- **Controls & Buttons:** `rounded-[6px]` (radius-sm)
- **Cards, Panels & Code Blocks:** `rounded-[8px]` (radius-md)
- **Modals, Dialogs & Command Palette:** `rounded-[10px]` (radius-lg)
- **Containers & Shell:** `rounded-[12px]` (radius-xl)
- **Status Pills:** `rounded-full` (the only pill-shaped element)

### 4.2 Elevation & Shadows
- **Flat Elevation Philosophy:** Zero heavy dropshadows or neon glows.
- **Subtle Surface Definition:** Borders (`1px solid var(--border)`) provide primary separation.
- **Floating Modals:** Clean, restrained shadow:
  ```css
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.6), 0 0 0 1px #252D38;
  ```

---

## 5. Anti-Patterns & Prohibitions

1. **❌ No SaaS Gradients:** Rainbow or multi-color gradients on text or card backgrounds are strictly forbidden.
2. **❌ No Glowing Borders:** Box shadows with bright colored spreads (`shadow-glow`, neon halos) are removed.
3. **❌ No Emoji In Chrome:** Interface buttons, tabs, and headers must use precision vector icons (`lucide-react`) rather than arbitrary Unicode emojis.
4. **❌ No Chatbot Bubbles:** AI interactions must render structured engineering cards, diff views, and evidence lists.
