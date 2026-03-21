# Design System Document: The Athletic Editorial

## 1. Overview & Creative North Star
**Creative North Star: "The Kinetic Lab"**
This design system moves away from the static, boxy nature of traditional fitness trackers. We are building a "Kinetic Lab"—an environment that feels like a high-end sports science facility. The aesthetic is defined by **Atmospheric Depth** and **Asymmetric Energy**. Instead of a rigid grid, we utilize intentional white space and overlapping data layers to create a sense of motion. This is not just a dashboard; it is a high-performance instrument for the body.

The interface must feel "weightless." We achieve this by rejecting heavy borders and solid dividers in favor of tonal shifts and soft, ambient glows that mimic the sophisticated display of a premium stopwatch or a medical monitor.

---

## 2. Colors: The High-Contrast Palette
The palette is rooted in deep, obsidian slates to allow vibrant performance metrics to "pop" with clinical precision.

### Functional Roles
*   **The Foundation:** Use `surface` (#0e0e0e) for the global background. It provides the "void" that makes data feel luminous.
*   **The Triple-Accent Strategy:** 
    *   **Fitness (Electric Blue):** Use `primary` (#72dcff) and its variants for high-energy growth metrics.
    *   **Fatigue (Energy Orange):** Use `secondary` (#fd8b00) to signal intensity and load.
    *   **Readiness (Recovery Green):** Use `tertiary` (#c3ffcd) for health, recovery, and "Go" signals.

### The "No-Line" Rule
**Explicit Instruction:** Prohibit the use of 1px solid borders for sectioning. 
*   Boundaries must be defined solely through background color shifts. 
*   Place a `surface_container_high` card on a `surface` background to create a visual edge. 
*   Lines are for data (axes, trends), not for structural containment.

### The "Glass & Gradient" Rule
To elevate beyond standard flat design, floating action elements or high-priority cards should utilize **Glassmorphism**.
*   **Implementation:** Use `surface_variant` at 60% opacity with a `backdrop-blur` of 20px. 
*   **Gradients:** Use a subtle linear gradient from `primary` to `primary_container` for primary CTAs to give them a "machined" metallic finish.

---

## 3. Typography: Strong & Bi-Directional
We use a dual-font system to balance technical precision with editorial authority.

*   **Display & Headlines (Be Vietnam Pro):** This is our "Athletic" voice. It is used for large metrics and section headers. Its geometric construction handles RTL (Hebrew) transitions with a powerful, modern stance.
*   **Body & Labels (Inter):** This is our "Scientific" voice. It provides maximum legibility for small data points and instructional text.

**RTL Logic:** In Hebrew contexts, the typeface weight should be monitored; Hebrew characters often appear heavier than Latin. Ensure `headline-md` and `title-sm` maintain clear internal counters (the "holes" in letters) to prevent ink-clogging on dark backgrounds.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to lift objects; we use light and layers.

*   **The Layering Principle:** Depth is achieved by "stacking" the surface tiers.
    *   **Level 0 (Background):** `surface` (#0e0e0e)
    *   **Level 1 (Sections):** `surface_container_low` (#131313)
    *   **Level 2 (Cards):** `surface_container` (#1a1a1a)
    *   **Level 3 (Interactive Elements):** `surface_container_highest` (#262626)
*   **The Ghost Border Fallback:** If a component (like an input field) risks disappearing, use a "Ghost Border": `outline_variant` (#484847) at **15% opacity**.
*   **Ambient Glow:** For the most critical metric (e.g., Daily Readiness Score), apply a subtle outer glow using the metric's accent color (e.g., `tertiary`) at 5% opacity and a 40px blur.

---

## 5. Components
All components are designed with **RTL-First** logic. Icons that indicate direction (arrows, progress) must be mirrored.

### Progress Rings & Data Visualization
*   **The Kinetic Ring:** Use a stroke width of `spacing.2`. The background track should be `surface_container_highest`. The active track should use a gradient of `primary` to `primary_dim`.
*   **Data Density:** Use `spacing.4` between data points within a card to ensure the UI feels "breathable" despite high information density.

### Cards & Containers
*   **Constraint:** No dividers. Use `spacing.6` (1.3rem) of vertical white space to separate groups.
*   **Corner Radius:** Use `lg` (1rem) for main dashboard cards and `md` (0.75rem) for internal nested elements. This "nested rounding" creates a sophisticated, organic feel.

### Buttons (Performance Grade)
*   **Primary:** Filled with `primary_container`. Text in `on_primary_container`. Use `full` (9999px) rounding for an aerodynamic look.
*   **Secondary:** Ghost style. No fill. "Ghost Border" (15% opacity `outline`) with text in `primary`.

### Navigation (Mobile iOS)
*   **The Floating Dock:** Use a glassmorphic bar at the bottom. 
*   **RTL Orientation:** The "Home" or "Primary" tab must sit at the far right for Hebrew users, with the sequence flowing right-to-left.

---

## 6. Do's and Don'ts

### Do
*   **Do** mirror all layouts for RTL. The "Fitness" metric ring should fill clockwise in LTR, but counter-clockwise in RTL if it represents a timeline.
*   **Do** use `surface_bright` sparingly to highlight "Active States" in lists.
*   **Do** leverage the `display-lg` type for singular, heroic data points (e.g., "98" BPM).

### Don't
*   **Don't** use pure white (#FFFFFF) for body text. Use `on_surface_variant` (#adaaaa) to reduce eye strain on the dark background. Reserve `on_surface` (Pure White) for headlines.
*   **Don't** use standard iOS blue. Use our `primary` (#72dcff) to maintain the custom, high-end feel.
*   **Don't** use "Drop Shadows" with black. If a shadow is needed, tint it with the background hue to maintain the "Kinetic Lab" atmosphere.

---

## 7. Spacing & Rhythm
We use a tight 4px-based system but apply it with editorial "breathing room."
*   **Component Internal Padding:** `spacing.4` (0.9rem).
*   **Section Gaps:** `spacing.10` (2.25rem).
*   **RTL Gutters:** Ensure the right-side gutter (the start of the line in Hebrew) has a slightly larger visual weight than the left to anchor the eye.