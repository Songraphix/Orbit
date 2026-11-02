# ORBIT — Product Evolution, Feature Expansion & UI Refinement Brief

## Instructions for Claude

You are working on **Orbit**, an existing Chromium-based browser and productivity workspace. Your job is to inspect the current codebase, understand what is already implemented, and then improve Orbit in a careful, incremental way.

This document describes the product direction and the features we want to explore. It is **not permission to rebuild everything from scratch**.

### Non-negotiable working rules

1. **Inspect before changing anything.** Read the project structure, identify the framework, architecture, state management, persistence layer, browser integration points, existing components, and current feature implementations.
2. **Do not duplicate existing features.** Orbit already has:
   - Split Screen
   - Side Notes
   - Profiles
   - Spaces / workspaces
   - A custom New Tab page called **Homepage**
   - A sidebar with configurable/pinned services and app shortcuts
   - A Settings area with sections including General, Profiles, Workspaces, Rules, Integrations, Backup, Shortcuts, AI, Privacy, and About
   - A Toolkit panel with utilities such as color tools and other creative/developer tools
   - A **Focus Timer**
   - **Focus Music**
3. For every relevant feature, classify it as:
   - **KEEP**: It already works well. Preserve it.
   - **IMPROVE**: It exists but needs better UX, reliability, organization, or visual quality.
   - **BUILD**: It does not exist and is genuinely needed.
   - **DEFER**: It is expensive, speculative, or not important enough yet.
4. If a feature is already implemented well, **skip it**. Do not rewrite working code just to match this brief.
5. If it exists but is weak, improve the existing implementation rather than creating a second system.
6. Preserve existing user data, settings, sessions, browser functions, and compatibility. Do not introduce destructive migrations.
7. Work in small, testable steps. Avoid broad refactors unless the current architecture makes them necessary.
8. Before implementation, provide a concise audit and proposed plan. Identify relevant files and components. Do not claim a feature is complete until it has been tested.
9. Reuse existing components, tokens, state, and services where practical. Avoid duplicate state sources and duplicate settings.
10. Do not make assumptions about APIs, browser capabilities, or service embedding. Verify technical constraints before implementation.
11. If a requirement is unclear or a decision could cause data loss or a major architectural change, stop and ask before proceeding.
12. Do not replace Orbit's identity with a generic browser dashboard. The goal is a coherent, useful work environment.

---

# 1. Product direction

## Product positioning

**Orbit is a productivity-first browser that connects browsing, creative work, development, and project management in one customizable workspace.**

The core promise:

> Open Orbit, find your work, continue where you stopped, and get the next thing done.

Orbit should feel like a browser that understands the user's work, not simply a browser with many unrelated tools attached.

## Product pillars

### 1. A browser that understands your work
- Projects and workspaces should connect.
- Tabs, notes, tasks, saved references, and relevant apps should be accessible in context.
- Users should be able to return to a project and recover the useful context around it.
- Work should not be scattered across unrelated panels.

### 2. A browser built for making things
- Creative and developer utilities should be easy to reach.
- The Toolkit should support real work without overwhelming the browser.
- Users should be able to move between research, design, development, and communication with minimal friction.

### 3. An assistant that helps users finish work
- AI should understand the current page and, when permitted, the selected project.
- It should help users think, plan, compare, write, and solve problems.
- It should challenge weak assumptions instead of agreeing automatically.
- Users must remain in control of what information is shared and what actions are taken.

## The key differentiator

Orbit's advantage should not be the number of features. Other browsers already have sidebars, workspaces, split views, AI, and customization.

The stronger differentiator is a connected workflow:

**Project → Workspace → Browser tabs → Captured references → Notes → Tasks → Completed work**

Make these connections useful and easy to understand.

---

# 2. Existing product inventory: protect and build on it

The following features are already part of Orbit's current product direction and should be audited, not blindly rebuilt.

| Existing area | Required approach |
|---|---|
| Split Screen | Keep if reliable; improve usability only where needed |
| Side Notes | Keep; consider better links to projects and pages |
| Profiles | Keep; verify session and data isolation |
| Spaces / Workspaces | Keep; improve how they connect to projects and customization |
| Homepage | Keep; extend it with modular widgets and background options |
| Sidebar and service shortcuts | Improve the existing system into a more capable App Hub |
| Settings | Extend and organize existing settings; avoid duplicate settings pages |
| Toolkit | Keep; refine categories, hierarchy, and consistency |
| Focus Timer | Keep; improve only if there are gaps in reliability, controls, or integration |
| Focus Music | Keep; improve organization and usability if needed |

**Important:** Focus Timer and Focus Music already exist. Do not build another timer, another music player, or a competing focus system. The proposed direction is to connect the existing focus tools more deeply with tasks, projects, Homepage, and workspace settings.

---

# 3. App Hub: evolve the existing sidebar integrations

## Goal

Make the existing sidebar service setup feel like a flexible **App Hub**. Users should be able to access the web apps they use without turning the sidebar into a cluttered list.

Do not create a second app launcher. Audit and extend the current sidebar configuration.

## Suggested app groups

These are examples, not a hardcoded list:

- **AI:** ChatGPT, Claude, Gemini, Perplexity
- **Google:** Gmail, Calendar, Drive, Docs, Sheets, Translate
- **Microsoft:** Outlook, OneDrive, Teams
- **Design:** Figma, Canva, Adobe Express, Pinterest
- **Development:** GitHub, GitLab, CodePen, StackBlitz, documentation sites
- **Communication:** WhatsApp, Telegram, Messenger, Slack
- **Productivity:** Notion, Trello, Linear, other project tools

Users should be able to add their own services by entering a URL.

## App Hub capabilities to consider

- Add an app using a URL.
- Choose or upload a custom icon where supported.
- Rename an app.
- Pin or unpin an app.
- Reorder apps by dragging.
- Create, rename, hide, and reorder groups.
- Show or hide categories.
- Set an app's opening mode:
  - Sidebar panel
  - Full browser tab
  - Separate window, if supported
- Configure whether an app appears in all Spaces or only selected Spaces.
- Optionally open selected apps when a Space is activated.
- Support workspace-specific app collections.
- Provide a clear way to edit or remove an app.
- Preserve the user's configuration across restarts and updates.

## Workspace-aware app collections

Examples:

- **Design Space:** Figma, Canva, Pinterest, Google Drive, colour tools.
- **Development Space:** GitHub, StackBlitz, documentation, API tools.
- **Research Space:** search tools, reference sources, notes, AI.
- **Business Space:** Gmail, Calendar, Drive, project management.

These should be user-configurable. Do not force preset app collections.

## Technical and UX cautions

- Not every website allows embedding in a sidebar. Some block framing or require special authentication flows.
- Do not promise that every app can run in a panel.
- Provide graceful fallbacks to a full tab or separate window.
- Consider whether apps share the current browser profile or use isolated sessions. Make the behavior understandable and safe.
- Avoid silently sharing cookies or account sessions between profiles.
- Show useful error states when a service cannot load.

---

# 4. Orbit Backgrounds: wallpaper and Homepage appearance

## Goal

Give users more control over the Homepage background, inspired by the customization available in browsers such as Brave.

Build this as part of Homepage customization and the central Appearance system, not as a disconnected feature.

## Background sources

Potential sources:

1. Built-in Orbit background collection.
2. User-uploaded local images.
3. Unsplash integration, subject to its API rules and attribution requirements.
4. Other sources only after checking their API terms and product-use restrictions.

Do not assume every image provider permits use in a wallpaper feature. Verify current licensing, API rules, attribution, hotlinking, and caching requirements before integrating a provider.

## User controls

- Choose a background manually.
- Search or browse by category.
- Save favourites.
- Shuffle backgrounds.
- Set daily rotation or another user-selected schedule.
- Use a solid colour.
- Create a gradient.
- Upload a local image.
- Adjust:
  - Brightness
  - Blur
  - Saturation
  - Contrast
  - Overlay strength
  - Image positioning
  - Fit, fill, or centre behavior
- Reset to the default background.

Optional ambient backgrounds can include subtle gradients, abstract shapes, aurora-like effects, or particles. Keep them lightweight and respect reduced-motion preferences.

## UX requirements

- Background changes should preview before applying.
- Controls should be easy to discover without taking over the Homepage.
- Text and widgets must remain readable on bright and dark images.
- Provide a default overlay or contrast treatment where needed.
- Avoid loading large images in a way that slows Homepage startup.
- Support a sensible fallback if an image source is unavailable.

---

# 5. Homepage Widget System

## Goal

Turn Homepage into a modular, customizable dashboard while preserving its current identity and existing functionality.

Users should decide what appears, where it appears, and how much space it takes.

## Potential widgets

These are candidates. Audit the existing Homepage first and build only what is missing.

### Core widgets
- Clock and date
- Greeting
- Search
- Quick Links / pinned shortcuts
- Bookmarks
- Recently visited pages
- Reading List

### Work widgets
- Tasks
- Projects
- Notes
- Calendar
- AI prompt / quick assistant
- Recently opened project
- Project progress

### Focus widgets
- Existing Focus Timer
- Existing Focus Music controls
- Focus session status
- Daily focus summary, if the data is already available

### Utility widgets
- Stopwatch
- Weather, if a reliable source is available
- Daily quote
- Colour palette
- Useful developer shortcuts
- Other lightweight utilities

Do not add widgets just to make the Homepage look busy. Each widget should solve a clear user need.

## Widget behavior

Users should be able to:

- Add a widget.
- Remove a widget.
- Hide or show a widget.
- Drag and drop to reorder.
- Resize widgets where the layout supports it.
- Configure widget-specific settings.
- Choose between supported widget styles.
- Reset the Homepage layout.
- Save different layouts for different Spaces, if practical.
- Use a clean empty state when no widgets have been added.

## Layout direction

A possible starting structure:

- Top area: greeting, date, clock, search.
- Main area: shortcuts and user-selected widgets.
- Secondary area: tasks, projects, focus, notes, or other selected widgets.

This is only a reference. Do not hardcode one layout for every user. The layout should adapt to the user's choices and available screen space.

## Workspace-specific Homepage layouts

Examples:

- **Designer:** project progress, Figma shortcut, Pinterest, colour palette, notes.
- **Developer:** GitHub, documentation shortcuts, tasks, timer, recent projects.
- **Researcher:** reading list, saved references, notes, search, AI assistant.
- **Minimal:** clock, search, a few shortcuts, nothing else.

These should be editable presets, not fixed modes.

---

# 6. Connect the existing Focus Timer and Focus Music

## Current state

Orbit already has a Focus Timer and Focus Music. **Do not build replacements.**

First inspect how they work, where their state is stored, whether they continue correctly in the background, and how they interact with the rest of Orbit.

## Potential improvements

- Make the existing timer available as a Homepage widget.
- Add a compact focus status or timer indicator in the sidebar, if it fits the current architecture.
- Allow a focus session to be associated with a project or task.
- Allow users to start a focus session from a task or project.
- Show the active task or project while a session is running.
- Connect Focus Music controls to the focus experience without forcing music to play.
- Preserve timer state when navigating between Spaces or browser panels.
- Provide clear pause, resume, skip, and reset controls if not already present.
- Keep notifications and sounds configurable.
- Respect quiet hours and system notification permissions where applicable.
- Offer session history and simple daily totals only if useful and privacy-conscious.

## Timer reliability

A browser window or background page may be suspended. Do not rely only on frequent interval callbacks to calculate elapsed time.

Use a reliable time-based approach, such as storing the session start timestamp, intended duration, and pause state, then calculating the remaining time from timestamps. Test behavior when:
- The user changes tabs.
- The user switches Spaces.
- The window is minimized.
- The app is idle for several minutes.
- The browser is restarted, if session recovery is intended.

Do not silently change the existing timer's behavior. Preserve current user expectations and settings.

---

# 7. Orbit Customization Engine

## Goal

Create one consistent system for controlling the appearance, layout, visibility, and behavior of Orbit.

Customization should not be implemented separately in every feature. The goal is a central set of preferences that different parts of Orbit can use.

Audit existing Settings and reuse them. Do not create duplicate preference stores.

## A. Feature visibility

Allow users to show or hide relevant Orbit features, where appropriate:

- Projects
- Tasks
- Notes
- App Hub
- Bookmarks
- History
- Downloads
- Focus tools
- AI Assistant
- Toolkit
- Homepage widgets
- Other existing navigation items

Hiding a feature must not delete its data. It should only remove or hide its entry point from the user's interface.

## B. Sidebar customization

Potential controls:

- Show or hide the sidebar.
- Adjust sidebar width.
- Choose icon-only or icon-and-label mode.
- Reorder sections and apps.
- Pin and unpin items.
- Group apps.
- Hide unused categories.
- Configure app visibility by Space.
- Choose sidebar behavior when switching Spaces.
- Support keyboard access and clear focus states.

Only offer position or resizing behavior that the current browser architecture can support reliably.

## C. Appearance settings

Potential controls:

- Light, Dark, and System themes.
- Accent colour.
- Background and surface colours.
- Sidebar and panel transparency.
- Blur strength.
- Corner radius.
- UI density: Compact, Comfortable, Spacious.
- Font size or UI scaling.
- Supported font choices, if practical.
- Icon style, if a coherent icon set is available.
- Animation level.
- Reduced motion.

Use a small number of meaningful controls. Avoid exposing dozens of low-level settings that most users will not understand.

## D. Workspace-specific customization

Allow a Space to have its own configuration where useful:

- Background.
- Accent colour.
- Sidebar app visibility.
- Homepage widget layout.
- Selected tools.
- Optional density or appearance overrides.

Examples:

- Design Space: creative shortcuts and tools.
- Development Space: developer apps and utilities.
- Research Space: reading and reference tools.
- Focus Space: minimal layout and focus controls.

Users should be able to choose whether a setting is global or specific to a Space. Make inheritance clear.

## E. Presets

Possible starting presets:

- Minimal
- Creative Studio
- Developer Workspace
- Productivity
- Research
- Focus

Presets should be starting points. Users must be able to edit them after applying one.

---

# 8. Glass, transparency, and visual appearance

## Goal

Improve Orbit's visual quality without sacrificing readability, performance, or consistency.

Glassmorphism can be an optional visual treatment within the Appearance system. It should not become the entire design language.

## Recommended use

- Use frosted glass for floating panels, overlays, menus, and selected surfaces.
- Use subtle transparency for secondary surfaces.
- Keep primary reading and settings surfaces sufficiently solid.
- Maintain clear borders and contrast.
- Avoid stacking multiple translucent layers.
- Make blur and transparency adjustable.
- Provide a solid-surface option for users who prefer clarity or need better performance.

## Accessibility and performance

- Text must remain readable over every supported background.
- Preserve visible focus indicators.
- Respect reduced-motion preferences.
- Do not use transparency where it makes controls hard to distinguish.
- Test performance on lower-powered hardware.
- Avoid excessive blur filters and large animated effects.

---

# 9. Context Menus and Right-Click Actions

## Goal

Make Orbit's right-click behavior useful and consistent across its own interface and web content.

Use the browser's native context-menu capabilities where possible. Do not break normal website behavior or suppress standard browser actions without a clear reason.

Show only actions relevant to the item or area clicked.

## A. Homepage context menu

Possible actions:

- Customize Homepage
- Add Widget
- Change Background
- Refresh or Shuffle Background
- Edit Shortcuts
- Homepage Settings
- Reset Layout

## B. Pinned app context menu

Possible actions:

- Open
- Open in New Tab
- Open in Sidebar
- Open in New Window, if supported
- Pin or Unpin
- Edit App
- Change Icon
- Move to Group
- Show or Hide
- Remove

## C. Tab context menu

Audit the current browser menu before changing it. Possible actions include:

- New Tab
- Duplicate
- Pin or Unpin
- Move to Space
- Move to New Window
- Split Screen
- Reload
- Mute or Unmute
- Close
- Close Other Tabs
- Reopen Closed Tab

Do not remove existing browser actions that users rely on.

## D. Selected text context menu

Possible actions:

- Copy
- Search the web
- Search with Orbit AI
- Explain Selection
- Summarize Selection
- Translate
- Create Note
- Create Task
- Save to Project

AI actions must make it clear what selected text or page content will be shared with the selected AI provider.

## E. Image context menu

Possible actions:

- Open Image in New Tab
- Copy Image
- Save Image
- Copy Image Address
- Search Image, if supported
- Capture Image
- Add to Project, if supported

## F. Webpage empty-area context menu

Possible actions:

- Back / Forward, where appropriate
- Reload
- Save Page
- Capture Screenshot
- Add Page to Project
- Split Screen
- Inspect Element / Developer Tools, where supported

## Implementation requirements

- Keep native browser behavior intact wherever possible.
- Avoid showing Orbit-specific actions on inputs or controls where they would interfere with expected behavior.
- Support keyboard navigation.
- Ensure menus are positioned within the visible window.
- Use consistent icons, spacing, separators, and hover states.
- Provide clear disabled states and tooltips where necessary.

---

# 10. AI: from page assistant to thinking partner

## Goal

Build AI in stages. Do not begin with a broad autonomous agent that has access to everything.

AI should be useful, contextual, transparent, and user-controlled.

## Layer 1: Page-aware assistance

Potential capabilities:

- Explain the current page.
- Summarize an article or document.
- Explain selected text.
- Explain code.
- Compare two open pages.
- Extract key points or structured information.
- Turn selected text into a note or task.
- Save useful information to a project.

Requirements:
- Clearly show what page or selection is being used.
- Avoid claiming to have read content that was not actually accessible.
- Provide source links or page references when possible.
- Handle pages that block access or contain dynamic content gracefully.

## Layer 2: Project-aware assistance

When a user chooses to share a project context, AI could use relevant project information such as:

- Project brief.
- Tasks and status.
- Notes.
- Saved references.
- Relevant open tabs.
- Project-specific instructions.

Potential actions:

- Summarize project progress.
- Identify unfinished work.
- Help prioritize tasks.
- Review a project brief.
- Prepare a client update.
- Find gaps or contradictions in a plan.
- Turn a discussion into next steps.

Do not automatically send every project detail to an AI provider. Make the selected context visible and controllable.

## Layer 3: Workflow intelligence

Later, Orbit may help users understand and improve their workflows.

Examples:
- Suggest a useful app group for a Space.
- Notice that a user repeatedly opens the same set of tools for a type of work.
- Suggest a reusable workspace layout.
- Suggest a focus session for a selected task.
- Offer a shortcut for a repeated action.

These should be suggestions, not silent changes. Require user approval before applying them.

Do not secretly record all browsing or infer sensitive personal information.

## Layer 4: Thinking partner

Orbit's AI should be able to help users:

- Brainstorm ideas.
- Challenge assumptions.
- Compare options.
- Identify risks and missing information.
- Break complex work into steps.
- Review a strategy.
- Think through a decision.
- Improve a plan without blindly agreeing.

The AI should ask useful questions when key information is missing and explain uncertainty.

## Orbit Memory and privacy controls

If persistent AI context is implemented, it should be:

- Visible to the user.
- Editable and deletable by the user.
- Scoped by project or workspace where possible.
- Optional.
- Clear about what is saved.
- Clear about what is sent to an external AI provider.

Users should be able to choose the AI provider and understand when page or project content is being shared.

---

# 11. Visual quality and design-system refinement

## Current concern

Orbit has many useful features, but the interface may feel visually dense or less polished than the product deserves.

Do not assume the answer is a complete redesign. First inspect the current UI and compare it with the supplied screenshots and design references.

The likely areas to investigate are hierarchy, spacing, typography, component consistency, density, and interaction polish.

## A. Establish or refine design tokens

Use the existing token system if one exists. If it does not, define a small, consistent system.

Suggested spacing scale:

| Token | Suggested value |
|---|---:|
| XS | 4px |
| SM | 8px |
| MD | 12px |
| LG | 16px |
| XL | 24px |
| 2XL | 32px |
| 3XL | 48px |

These are starting values, not a command to replace working spacing everywhere.

Define consistent tokens for:
- Colour and semantic states.
- Typography.
- Spacing.
- Corner radius.
- Borders.
- Shadows.
- Focus rings.
- Transitions.
- Panel and sidebar dimensions.
- Layering and z-index.

## B. Typography hierarchy

Establish clear roles for:

- Display text.
- Page title.
- Section heading.
- Card heading.
- Body text.
- Supporting text.
- Labels.
- Metadata.

Use consistent font sizes, weights, line heights, and letter spacing. Avoid making every heading bold or every label tiny.

## C. Component consistency

Audit and standardize:

- Buttons.
- Icon buttons.
- Inputs.
- Search fields.
- Dropdowns.
- Select menus.
- Checkboxes and toggles.
- Tabs.
- Cards.
- Dialogs.
- Tooltips.
- Context menus.
- Empty states.
- Loading states.
- Toasts and notifications.

Components should share consistent:
- Heights.
- Padding.
- Radius.
- Border treatment.
- Surface colours.
- Hover states.
- Active states.
- Focus states.
- Disabled states.
- Motion behavior.

## D. Settings and Toolkit hierarchy

The Settings interface and Toolkit should be easy to scan.

For Settings:
- Make the active section clear.
- Avoid competing visual emphasis between navigation, content, and secondary panels.
- Give each section a clear title and short description where useful.
- Group related controls.
- Avoid overly dense rows.
- Use progressive disclosure for advanced settings.

For the Toolkit:
- Organize tools into clear categories, such as:
  - Colour
  - Typography
  - Images
  - Layout
  - CSS / Code
  - Screenshots
  - Utilities
- Keep the most-used actions easy to reach.
- Avoid presenting unrelated tools as one long collection.
- Preserve existing tools and their functionality.

## E. Interaction polish

Review:
- Panel opening and closing.
- Sidebar transitions.
- Drag-and-drop feedback.
- Resizing behavior.
- Loading and empty states.
- Hover and active states.
- Keyboard navigation.
- Context menu behavior.
- Dialogs and confirmations.
- Focus indicators.
- Responsive behavior at different window sizes.

Motion should be subtle and purposeful. Do not animate everything.

## Design reference direction

The user will provide saved screenshots and images as visual references. Treat them as references for specific qualities, not as instructions to copy an entire product.

Useful reference qualities may include:
- Arc: spatial organization and browser workspace ideas.
- Vivaldi: customization and web panels.
- Opera: integrated sidebar apps.
- Brave: New Tab customization.
- Linear: clean hierarchy and disciplined spacing.
- Raycast: compact command interactions and polish.
- macOS: native-feeling menus and interactions.

When the user supplies reference images:
1. Identify the specific visual qualities they want to borrow.
2. Separate inspiration from features that do not fit Orbit.
3. Preserve Orbit's own identity.
4. Do not copy proprietary branding or reproduce another product pixel-for-pixel.

---

# 12. Projects, tasks, and connected workflows

Orbit already has workspaces and notes, and Projects and Tasks are part of its intended direction. Audit the current implementation before extending it.

The goal is to make work context connected.

Potential relationships:

- A Project can have one or more Spaces.
- A Project can contain tasks, notes, references, and useful links.
- A task can belong to a project.
- A browser page can be saved to a project.
- A selected page or text can become a note or task.
- A focus session can be associated with a task or project.
- A project can have a set of relevant pinned apps.
- A project can preserve useful tabs or a session.

Do not introduce unnecessary complexity. Start with the relationships that solve real user problems.

## Example workflow

1. User opens a project.
2. Orbit opens or switches to its relevant Space.
3. The project shows its tasks, notes, and saved references.
4. User opens the relevant web apps and pages.
5. User saves a useful page or selection to the project.
6. User starts the existing Focus Timer against a task.
7. User returns later and can continue from the saved context.

This connected experience is more important than adding another isolated feature.

---

# 13. Suggested priorities

This is an order for investigation and delivery, not a request to build every item at once.

| Priority | Area | Direction |
|---|---|---|
| P0 | Codebase and feature audit | Identify what exists, what works, and what needs attention |
| P1 | Design-system refinement | Improve hierarchy and consistency across existing UI |
| P1 | App Hub | Extend the existing sidebar integration system |
| P1 | Homepage widget system | Make Homepage modular and user-configurable |
| P1 | Orbit Backgrounds | Add flexible background controls and sources |
| P1 | Customization Engine | Centralize visibility, layout, and appearance preferences |
| P1 | Context menus | Add relevant right-click actions consistently |
| P1 | Focus integration | Connect the existing Focus Timer and Focus Music to tasks, projects, and Homepage |
| P2 | Workspace-specific customization | Give Spaces their own optional layouts and app collections |
| P2 | Page-aware AI | Add useful, transparent page and selection context |
| P2 | Project-aware AI | Allow explicitly selected project context |
| P3 | Workflow intelligence | Offer user-approved suggestions based on permitted signals |
| P3 | Advanced AI thinking partner | Expand after context, privacy, and reliability foundations are sound |

Do not treat P1 as permission to implement all P1 items in one large change. Break work into small milestones.

---

# 14. Suggested implementation sequence

## Step 1: Audit

Inspect the repository and produce:

- Architecture overview.
- Existing feature inventory.
- Relevant files and components.
- State and persistence overview.
- Existing design tokens and component system.
- Browser-specific APIs and constraints.
- Known bugs or incomplete features.
- Keep / Improve / Build / Defer table.

Do not change code during the initial audit.

## Step 2: Propose architecture

Before implementation, explain:

- Which existing systems can be extended.
- Whether a central customization/preferences layer already exists.
- How Homepage widgets should be registered and persisted.
- How App Hub configuration should be represented.
- How global and Space-specific preferences should interact.
- How existing focus tools can connect to tasks and projects.
- How context menus should integrate with browser-native behavior.
- How the design system can be refined without a risky rewrite.

Prefer the smallest architecture that can support the product direction.

## Step 3: Implement foundations

A sensible order after the audit:

1. Refine shared design tokens and components.
2. Improve the existing Settings and customization structure.
3. Extend the current sidebar into a stronger App Hub.
4. Build or improve the modular Homepage widget system.
5. Add background customization.
6. Add context menus.
7. Connect existing focus tools to projects, tasks, and Homepage.
8. Add page-aware AI.
9. Add project-aware AI.
10. Consider workflow intelligence only after the foundations are stable.

The exact order may change based on what the codebase already supports.

## Step 4: Test each milestone

For every change:
- Run the relevant tests.
- Check for build errors.
- Test persistence after restart.
- Test existing browser behavior.
- Test keyboard and mouse interactions.
- Test small and large window sizes.
- Check for regressions in Spaces, Profiles, Split Screen, Notes, Homepage, sidebar integrations, Focus Timer, and Focus Music.
- Confirm existing user settings and data remain intact.

## Step 5: Report clearly

After each milestone, report:

- What changed.
- Which files changed.
- What was reused.
- What was newly built.
- What was deliberately left untouched.
- Tests performed and their results.
- Known limitations.
- Recommended next step.

Do not say "done" if a feature has only been partially implemented.

---

# 15. Definition of a successful Orbit experience

Orbit is moving in the right direction when:

- Users can shape the browser around the way they work.
- The sidebar gives fast access to their chosen apps without becoming cluttered.
- Homepage is useful, personal, and fast.
- Spaces feel distinct when users want them to.
- Projects connect tabs, notes, references, tasks, and focus.
- Existing Focus Timer and Focus Music work reliably and fit naturally into the workflow.
- Context menus make common actions faster.
- The Toolkit is organized and easy to use.
- The interface feels consistent, intentional, and polished.
- AI helps with real work while making its access to information clear.
- Users remain in control of customization, data, and automation.

**The goal is not to make Orbit look like Arc, Opera, Brave, or another browser. The goal is to make Orbit feel like Orbit: a flexible work environment where browsing and getting work done are part of the same experience.**

---

# 16. First task for Claude

Start with the audit only.

Do not implement features yet.

Return:
1. A concise architecture overview.
2. A current feature inventory.
3. A Keep / Improve / Build / Defer assessment for every area in this brief.
4. A list of relevant files and components.
5. Any technical constraints or risks.
6. The smallest sensible implementation plan, broken into milestones.
7. A list of questions that genuinely need the user's decision.

Pay particular attention to the fact that **Focus Timer and Focus Music already exist**, as do Split Screen, Side Notes, Profiles, Spaces, Homepage, sidebar integrations, Settings, and Toolkit. Do not recommend rebuilding these without evidence that the current implementation is missing or inadequate.
