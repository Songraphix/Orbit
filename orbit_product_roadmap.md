# Orbit Browser: Strategic Product Roadmap and Implementation Brief

**Product:** Orbit\
**Audience:** Creatives and developers\
**Vision:** A complete work environment inside a Chromium-based browser\
**Product promise:** Open Orbit, find your work, continue where you
stopped, and get the next thing done.

------------------------------------------------------------------------

## 1. Purpose of This Document

Use this document as the strategic direction and implementation roadmap
for Orbit, an Arc-inspired browser intended to help creatives and
developers organize work, research, create, build, and finish projects
without unnecessary app switching.

Orbit already has some features implemented, including:

-   Split screen
-   Side Notes
-   Profiles
-   Spaces similar to Arc
-   A custom New Tab page
-   Other existing browser functionality

**Do not rebuild existing features automatically.** Inspect the current
codebase and evaluate every feature in this roadmap against what already
exists.

For each feature:

1.  **Keep and skip** if the current implementation is reliable,
    complete enough, consistent with the product direction, and tested.
2.  **Improve** if the feature exists but has clear usability,
    reliability, integration, accessibility, or performance gaps.
3.  **Build** only if the feature is missing or the existing
    implementation cannot reasonably support the required behavior.
4.  **Defer** if it is too expensive, risky, or not yet validated.

Do not duplicate functionality, replace working code for cosmetic
reasons, or make broad refactors without a clear need. Preserve user
data and existing browser behavior.

## 2. Product Positioning

Orbit should not be just another browser with a sidebar and a collection
of widgets.

**Orbit is a productivity-first browser that connects browsing, creative
work, development, and project management in one customizable
workspace.**

Modern work is spread across too many tools. A designer may use Figma,
Canva, Drive, an AI assistant, project software, and dozens of reference
tabs. A developer may use GitHub, documentation, a terminal, local
development servers, and AI tools.

Orbit's opportunity is to connect those activities so users can move
between them without losing context.

### Core product promise

**Open Orbit, find your work, continue where you stopped, and get the
next thing done.**

### The product's three pillars

1.  **A browser that understands your work:** Projects connect tabs,
    tasks, notes, and research. Users can resume work without
    reconstructing their context.
2.  **A browser built for making things:** Creative and developer tools
    are easy to access throughout the process of creating, testing,
    refining, and shipping work.
3.  **An assistant that helps you finish:** AI turns selected
    information into useful outputs while users stay in control of
    actions, permissions, and results.

No single pillar is entirely unique by itself. Orbit's differentiation
should come from how reliably these capabilities work together.

## 3. Competitive Landscape and Lessons

Use competitors as reference points, not as templates to copy. Verify
the current status and capabilities of each product before relying on
time-sensitive details.

### Arc and Dia

**Strength:** Browser as a workspace, vertical tabs, Spaces, pinned
tabs, Split View, and an AI-oriented direction.

**Lesson for Orbit:** Preserve the contextual, workspace-first
experience, then connect it to projects, tasks, and creative workflows.
Arc-style tabs and spaces alone are not enough to differentiate Orbit.

### Vivaldi

**Strength:** Customization, Workspaces, tab tiling, web panels, notes,
sessions, and keyboard-driven controls.

**Lesson for Orbit:** Tab organization and split views are table stakes.
Make browser activity and project work meaningfully connected.

### Microsoft Edge

**Strength:** Split Screen, Workspaces, and AI features that can assist
with information in the browser.

**Lesson for Orbit:** AI should be useful in the context of the current
task, not just another disconnected chat window.

### Opera

**Strength:** Integrated services, AI features, split screen,
workspaces, and quick access to tools.

**Lesson for Orbit:** Make useful tools easy to access, but do not
clutter the interface with too many controls.

### Strategic conclusion

Orbit should not compete merely by having a sidebar, AI assistant,
notes, split screen, and workspaces. Competing browsers already cover
many of these features.

The product opportunity is the connected workflow:

**Project → Workspace → Browser tabs → Captured references → Tasks →
Completed work**

This connected experience should be the core of Orbit.

## 4. User Needs: Evidence and Hypotheses

Common browser-productivity pain points include tab overload, switching
between apps, fragmented research, repetitive tasks, customization
needs, and wanting AI to be useful in context.

These themes are supported by existing browser products and user
discussions, but they do **not** prove that users want Orbit's exact
combination of features. Any survey statistics or competitor claims
should be checked against current primary sources before being used in
public marketing or investment materials.

Treat the following as working hypotheses to validate with actual
creatives and developers:

  -----------------------------------------------------------------------
  Opportunity             Current evidence level  How to validate
  ----------------------- ----------------------- -----------------------
  Better tab and          Strong existing product Observe whether users
  workspace organization  precedent               find and resume work
                                                  faster

  Integrated notes and    Established need; exact Test whether users
  tasks                   implementation unproven create and complete
                                                  tasks inside Orbit

  Creative utilities      Plausible niche         Test with working
                          opportunity             designers and content
                                                  creators

  AI that understands     Competitive direction   Compare task completion
  project context         is established; Orbit's with and without
                          value is unproven       contextual AI

  Automated project       Promising but           Test a few simple
  workflows               technically more        workflows before
                          complex                 building a general
                                                  automation engine

  A browser that replaces Unproven and too broad  Measure real app
  most other apps         as an initial goal      switching and
                                                  willingness to adopt
  -----------------------------------------------------------------------

**Product rule:** Do not prioritize a feature only because it looks
impressive in a mockup. Prioritize it when it saves time, reduces
friction, improves continuity, or helps users complete work.

## 5. Feature Roadmap

The roadmap below is a proposed direction for a small team or solo
developer. The time windows are planning estimates, not guaranteed
delivery dates. Adjust them after auditing the current implementation.

### Phase 1: Make Orbit Dependable

**Proposed window: Months 0--2**

**Goal:** Turn the existing browser into a reliable workspace with
persistent state.

Potential work:

-   Finish and verify Side Notes, preserving existing notes and
    behavior.
-   Implement Projects and Tasks with reliable persistence.
-   Connect Spaces/workspaces to project records where useful.
-   Save and restore tabs and browsing sessions.
-   Add or improve a universal command palette.
-   Make the productivity dock customizable and collapsible.
-   Improve empty states, onboarding, keyboard navigation, and settings.
-   Establish baseline performance, crash reporting, and error handling.

**Acceptance criteria:**

A user can open a project, continue a previous session, capture a note,
complete a task, close Orbit, and return without losing context.

### Phase 2: Connect the Workflow

**Proposed window: Months 2--4**

**Goal:** Reduce the number of steps between browsing and doing useful
work.

Potential work:

-   Orbit Capture for URLs, selected text, screenshots, and code
    snippets.
-   Project-linked research collections.
-   Universal search across tabs, notes, tasks, projects, and saved
    items.
-   Improve Split Screen with saved layouts and easy tab-to-pane
    movement if those capabilities are missing.
-   Pinned web apps and quick launch.
-   Focus mode tied to a selected project and task.
-   Reusable workspace templates.

**Acceptance criteria:**

A user can research a subject, save useful findings to a project, turn a
finding into a task, and resume the work from a saved workspace.

### Phase 3: Make Orbit Intelligent

**Proposed window: Months 4--7**

**Goal:** Help users act on the information already in their browser.

Potential work:

-   AI side panel with explicit access to the current page.
-   Page summarization with source references.
-   Convert selected text into notes and tasks.
-   Ask questions across user-selected saved research.
-   Creative Toolkit: color tools, contrast checks, image metadata,
    screenshot annotation, and CSS helpers.
-   Developer utilities: JSON formatting, responsive viewport controls,
    and local preview shortcuts.
-   AI provider configuration, usage controls, and privacy settings.

**Acceptance criteria:**

AI completes a few useful, clearly defined workflows with user
permission, reliable source references, and transparent data handling.

### Phase 4: Build the Orbit Ecosystem

**Proposed window: Months 7--12**

**Goal:** Make Orbit adaptable without making it bloated.

Potential work:

-   Project templates for design, development, and research.
-   Optional GitHub integration for issues, pull requests, and
    repositories.
-   Supported integrations with cloud storage and task services.
-   User-defined automation rules.
-   Advanced tab and workspace management.
-   Additional creative and developer extensions.
-   Optional sync and backup, with a clear privacy model.

**Acceptance criteria:**

Users can adapt Orbit to their workflows, and integrations provide clear
value without hurting reliability or performance.

**Important:** Do not start later phases just because they are more
exciting. The foundation must be reliable first. A solo developer may
need longer than the suggested windows.

## 6. Feature Inventory: Keep, Improve, Build, or Defer

Audit these areas before making changes. The current codebase is the
source of truth, not this roadmap.

### Existing browser features

  -----------------------------------------------------------------------
  Feature                 Default instruction     What to inspect
  ----------------------- ----------------------- -----------------------
  Split Screen            Keep if it works;       Resizing, navigation,
                          otherwise improve       tab movement,
                                                  responsive behavior,
                                                  persistence, keyboard
                                                  use

  Side Notes              Keep and preserve data; Editing, note
                          improve only where      persistence, panel
                          needed                  sizing, formatting,
                                                  recovery, existing data
                                                  compatibility

  Profiles                Keep if reliable;       Profile separation,
                          improve only if needed  session isolation, data
                                                  boundaries, profile
                                                  switching

  Spaces (Arc-like)       Keep if reliable;       Tab grouping,
                          improve and connect to  switching, saved state,
                          projects if useful      session restoration,
                                                  visual clarity

  Custom New Tab          Preserve existing       Clock/date, search,
                          design and behavior     shortcuts, background
                                                  settings, load
                                                  performance

  Existing browser        Preserve                Navigation, tab
  navigation and tabs                             lifecycle, permissions,
                                                  history, downloads,
                                                  keyboard shortcuts

  Browser settings and    Preserve                Existing settings,
  customization                                   theme behavior,
                                                  discoverability,
                                                  persistence
  -----------------------------------------------------------------------

### New or potentially missing features

  -----------------------------------------------------------------------
  Feature                 Default instruction     Priority
  ----------------------- ----------------------- -----------------------
  Projects and Tasks      Build if missing;       Critical
                          connect to existing     
                          notes/workspaces        

  Project-linked          Integrate with existing Critical
  workspaces              Spaces; do not create a 
                          duplicate workspace     
                          system                  

  Session save and        Improve existing        Critical
  restore                 session behavior or     
                          build if absent         

  Command palette         Improve if one exists;  High
                          otherwise build         

  Orbit Capture           Build a simple version  High

  Universal search        Build after data models High
                          are stable              

  Focus mode              Build a minimal version High
                          after project/task      
                          basics                  

  AI page assistant       Build after permissions High
                          and data architecture   
                          are sound               

  Creative Toolkit        Add lightweight, useful Medium
                          utilities               

  Developer Toolkit       Add lightweight         Medium
                          utilities and shortcuts 

  Project templates       Build after the basic   Medium
                          project workflow works  

  GitHub and cloud        Add only where user     Later
  integrations            demand and official     
                          APIs justify them       

  General-purpose         Defer until simple      Later
  automation engine       workflows have been     
                          validated               

  Sync and backup         Defer until local data  Later
                          and conflict handling   
                          are reliable            
  -----------------------------------------------------------------------

For every existing feature, record one status: **Keep**, **Improve**,
**Build**, or **Defer**. Include evidence and a short reason. Do not
rewrite a feature that already meets the product requirements.

## 7. Native Versus Integrated

### Build natively inside Orbit

These capabilities define the product and should remain useful even if
external services are unavailable:

-   Projects and Tasks
-   Notes and Capture
-   Command Center
-   Focus mode
-   Workspace/session context
-   Saved research collections
-   Basic creative utilities that can run locally
-   Browser-native navigation and tab organization

### Integrate rather than rebuild

Use established services for capabilities they already handle well:

-   **Design:** Figma and Canva
-   **Development:** GitHub, documentation, code editors, and local
    development servers
-   **Communication:** Email, messaging, and meeting services
-   **Files:** Google Drive and other supported storage providers
-   **AI:** External models through supported APIs, with local models as
    a possible future option

A website opening inside Orbit does not mean its data is integrated. A
Figma tab is an app shortcut. A deeper Figma integration would use an
authorized, supported API to access relevant file details and associate
them with a project.

Start with reliable website access and links. Add deeper integrations
only when they provide a clear user benefit and there is an official,
secure access method.

Do not assume all sites can be embedded in an iframe. Some block
embedding or rely on authentication, cookies, pop-ups, or browser
capabilities that make embedded use unreliable. Use a normal tab or
split view when that is more robust.

## 8. Technical Architecture and Dependencies

The exact Chromium framework and architecture must be confirmed by
inspecting the repository. Do not assume Orbit uses Electron, Tauri, or
a particular storage engine.

### Suggested logical layers

1.  **Browser shell:** Tabs, navigation, windows, profiles, sessions,
    permissions, and downloads.
2.  **Workspace layer:** Spaces, dock, Split Screen, project context,
    and Focus mode.
3.  **Local data layer:** Projects, tasks, notes, captures, settings,
    and session metadata.
4.  **Integration layer:** AI providers, GitHub, cloud files, and other
    services.
5.  **UI layer:** Reusable components and views that read from shared
    application state.

### Architecture rules

1.  **One source of truth.** Projects, tasks, notes, and captured
    references need clear data models and relationships. Do not keep
    disconnected copies of the same project state in different panels.
2.  **Separate browser content from privileged code.** A website must
    not automatically gain access to local files, project data, or
    internal browser APIs. Preserve Chromium's security boundaries.
3.  **Permissioned AI.** Make it clear which page, selected text, or
    project context will be sent to an AI provider. Let users control
    this access.
4.  **Local-first operation.** Notes, tasks, and projects should remain
    usable without an AI provider or cloud service. Add sync as a
    separate layer.
5.  **Performance by design.** Avoid keeping unnecessary pages active.
    Consider suspending inactive tabs while preserving session state.
6.  **Modular integrations.** Each service needs clear boundaries,
    permissions, error handling, and fallbacks. A broken integration
    must not break Orbit.
7.  **Security and updates are core features.** Keep the browser engine
    current and follow the official security guidance for the actual
    framework in use.
8.  **Migrate data safely.** Back up or migrate existing data before
    changing storage schemas. Never overwrite user data with sample or
    seed data.
9.  **Do not introduce new dependencies casually.** Prefer existing
    libraries and patterns unless there is a clear technical reason to
    add something.
10. **Avoid broad refactors.** Change the smallest practical surface
    area and test affected functionality.

## 9. Privacy, Permissions, and AI Safety

Orbit will potentially handle browsing data, notes, project information,
source code, and client work. Trust is essential.

-   Clearly distinguish local storage from data sent to external
    services.
-   Do not send page contents to AI without an appropriate user action
    or clearly configured permission.
-   Give users control over which page or project context the assistant
    can access.
-   Avoid collecting page contents or browsing history merely to measure
    engagement.
-   Keep website content isolated from privileged browser APIs.
-   Explain what is retained, where it is stored, and how users can
    delete it.
-   Use official APIs and OAuth flows where applicable. Do not collect
    service passwords directly.
-   Provide safe handling of API keys and secrets.
-   Add confirmation for destructive operations.
-   Keep basic productivity features usable when third-party services
    fail.

## 10. Success Metrics

Do not measure progress only by the number of features shipped. Measure
whether Orbit becomes more useful.

  -----------------------------------------------------------------------
  Metric                              What it measures
  ----------------------------------- -----------------------------------
  Weekly active users                 Whether people return

  Workspace resume rate               Whether saved workspaces help users
                                      continue

  Tasks completed in Orbit            Whether the built-in productivity
                                      system is used

  Captures linked to projects         Whether research connects to
                                      execution

  Four-week feature retention         Whether features remain useful
                                      after novelty fades

  Median memory usage and startup     Whether productivity harms
  time                                performance

  Crash-free sessions                 Reliability

  User-reported time saved            Whether Orbit improves actual
                                      workflows
  -----------------------------------------------------------------------

Establish baselines with early testers before setting numerical targets.
Arbitrary targets create the appearance of progress without evidence.
Instrument these metrics with privacy in mind.

## 11. User Validation Plan

Recruit a small group of actual creatives and developers and observe
their normal work.

Test these scenarios:

1.  Open an existing project and resume work from the previous session.
2.  Research a topic and capture useful pages or snippets into the
    project.
3.  Turn a captured finding into a task.
4.  Work with two or more references using Split Screen.
5.  Use AI to summarize or extract information from a user-selected
    page.
6.  Complete a task and return to the project later.
7.  Close and reopen Orbit and verify that data and context persist.

Watch what users do, where they hesitate, which features they ignore,
and what they still switch to other apps to accomplish. Do not rely only
on asking which features sound exciting.

## 12. Development Workflow for Claude

Before making changes:

1.  Inspect the entire relevant codebase, project structure, framework,
    dependencies, and existing data/storage architecture.
2.  Identify how Split Screen, Side Notes, Profiles, Spaces, the New Tab
    page, tabs, sessions, and settings currently work.
3.  Produce a short audit table with **Keep / Improve / Build / Defer**,
    a reason, dependencies, and risk for each feature.
4.  Identify user data and migration risks before changing storage or
    shared components.
5.  Present a phased implementation plan based on the actual state of
    the repository.

Then implement incrementally:

-   Make small, focused changes.
-   Reuse existing components and patterns.
-   Keep working features intact.
-   Do not create duplicate systems for Spaces, tabs, notes, or
    sessions.
-   Do not replace working code just to match a theoretical
    architecture.
-   Do not stop at static mockups; implemented features must be
    connected to real state and persistence.
-   Run existing build, lint, and test commands where available.
-   Test important user workflows, including reloads and application
    restarts.
-   Fix regressions caused by the changes.
-   Report failures and remaining limitations honestly.

After each phase, summarize what changed, what was reused, what was
improved, what remains, and the tests performed.

## 13. Final Acceptance Criteria

Orbit's roadmap is progressing well when:

-   Existing browser functionality continues to work.
-   Split Screen, Side Notes, Profiles, Spaces, and New Tab are
    preserved unless a specific improvement is justified.
-   Projects, tasks, notes, captures, and workspaces connect coherently.
-   Users can save and resume their work without losing context.
-   AI access is useful, explicit, and privacy-conscious.
-   Creative and developer utilities solve real, repeated problems.
-   External services are integrated without trying to rebuild entire
    applications.
-   Performance, stability, accessibility, and data safety are treated
    as requirements.
-   Each phase is validated with real users before expanding scope.

## 14. Strategic Principle

**Orbit should not aim to be a browser that contains everything. It
should be the browser that makes the tools people already use work
together.**

Prioritize connected workflows, not feature count. Keep what works,
improve what is weak, build what is missing, and defer what has not been
validated.
