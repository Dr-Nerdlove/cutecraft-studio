# AGENTS.md

Instructions for every AI tool working on CuteCraft Studio.

<!-- owner-rules v9: general (AGENTS.md) - begin -->

## General rules

### People

- Unless "Project knowledge" says otherwise, assume that the people you work with **do not program**: they
  build their projects together with AI assistants and rely on you for the code, its quality and its
  explanation. "Project knowledge" lists who works on the project.
- Talk to them in **German**, in plain words, without jargon. Say what changes for them, not which file
  changed.
- When they ask for ideas or something is unclear, **offer choices and let them pick before building**, with
  a recommendation. Do not build a proposal nobody chose.
- **Report honestly**: a test that failed, a step that was skipped, a fix that turned out to be wrong. Say
  what was **really tested** and what was only built or compiled, and what it means for them.
- **Merge, release or publish only when the person asks for it.** Never merge or overwrite the work of
  someone else without their consent; propose it to them (pull request, comment) instead.

### Language

- **Everything in the repository is English**: files and documentation, code comments, commit messages,
  branch names, pull requests, issues and release notes. Only the conversation with the people is German.
- Text that the product itself shows to its users (an app's interface, a device's display, its store page)
  stays in the language or languages the product is made for. "Project knowledge" names them.
- **A product in several languages stays in all of them.** Every new or changed text goes into every
  language the product offers, in the same change; never leave one language behind, drop one, or fall back
  to another language silently. Write each language naturally (not word for word), with its proper
  characters (ä, ö, ü, ß in German). Check that no text is missing in any language before calling the change
  done.
- Where a project still has older content in another language, do not translate it on your own: offer it as
  a choice.

### Testing

- Where the project has automated tests, **every new behaviour that can be tested automatically gets a test,
  and a sabotage check**: break the behaviour on purpose (it must still compile, and it must break the
  behaviour, not just a selector or a text), run the test, see it fail, put the code back and confirm that
  the file is byte for byte what it was (`cmp`). A test that passes against broken code is worthless.
- **What cannot be tested automatically** (hardware, devices, displays, animations, things that need a real
  account or service) gets no test suite of its own. Check it as far as possible (build, compile, a preview),
  then on the real device or service, and say plainly which part is checked how.
- Where the project has no tests at all, do not set up a test suite on your own: when a change would be
  risky without one, offer it to the owner as a choice.
- Run the project's checks before pushing, as "Project knowledge" or the project's own instructions say.
  Where they say nothing: the checks that cover what changed, and the whole suite when the change could have
  effects elsewhere.

### Safety and data

- **Never put secrets into the repository**: passwords, API keys, tokens, private addresses. Use the
  project's way of keeping them out (environment, settings, `.gitignore`); if there is none, ask.
- **Personal data** (of the people or of the product's users) is not sent anywhere new, logged or published
  without asking.
- **What users have stays usable after an update**: their settings, saved data, accounts. When a change
  would break or reset them, say so before building and offer a way to carry them over.
- **Ask before anything hard to undo**: deleting data or files that are not part of the change, rewriting
  history, changing a live service, publishing to a store.
- **New libraries or services** only with a reason, said in plain words; prefer what the project already
  uses.

### Changes

- **One topic per change** (branch, pull request): easier to check, to release and to undo.
- **One branch per task.** Create it from the latest default branch (usually `main`) with a name that says
  what the change is about: `type/short-topic`, lower case, English, words joined by hyphens - `feature/` for
  something new, `fix/` for a bug, `docs/` for documentation, `chore/` for tidying up (e.g.
  `feature/online-update`, `fix/ota-redirect-query`, `docs/ai-rules`). Not who or when, and nothing vague like
  `test` or `update2`. Push to that branch instead of the random branch name the environment gives the
  session; this is the owner's standing permission to push to such branches. A new task in the same session
  gets a new branch. Merge into the default branch only when the person asks for it; where others work on the
  project, propose the merge as a pull request instead. Where the project has its own naming habits, follow
  them.
- **Commit messages and pull request titles** say in one line what changes, e.g. "Fix online update: keep
  the signed download URL"; more detail, and why, goes below.
- Changes that users notice go into the release notes or changelog in plain words (in English, like
  everything in the repository; texts shown to users inside the product or in a store, such as "what's new",
  in every language the product offers).

### Repository

Aim for what is common practice on GitHub, in proportion to the project: a small experiment needs less than
something others install. **Do not restructure an existing repository on your own**: point out what is
missing, with a recommendation, and let the people choose.

- **README**: what the project is (with a picture where it helps), how to install and use it, how to work on
  it (build, test, release), and its licence. Keep it up to date with every change that affects it.
- **Pull request descriptions**: what changes, why, how it was tested (and what was not), and anything the
  reviewer should know.
- **Automatic checks (CI)**: every push and pull request builds the project and runs its tests
  automatically; merge only when they pass. Where a project has none, offer to set it up.
- **Releases**: version numbers `vMAJOR.MINOR.PATCH` (e.g. `v1.4.2`: major for breaking changes, minor for
  new features, patch for fixes). Files that are published are built by CI, never by hand. Each release says
  in plain words what is new and how to install or update.
- **Basics**: a `.gitignore` for build output and local files, a **licence** file (without one, nobody may
  legally reuse the code, even in a public repository; the choice of licence is the people's), and a
  `CHANGELOG.md` where releases alone do not tell the story.

### Showing changes

- Show visual changes rather than describing them: **screenshots** where the result runs on a computer.
- Where no screenshot is possible (a device, a display, a phone app, print): build a **preview** (a mock-up
  page, a pixel preview), or ask for a **photo** of the real thing.

### Checking facts at the source

- Do not build on memory where the real thing can be checked: read the actual source of a library, look at
  the real answer of a server or service, read the real data. Behaviour that "should" be so is often not.
- When a cause is unclear, **ask for a log or an error message before guessing**, and say what it would show.

### Keeping knowledge in the repository

- Sessions end and are deleted; the repository stays. What a later session needs to know goes into the
  project's files ("Project knowledge", the README, other docs, commit messages), not only into the
  conversation: decisions and why, traps that cost time, how to build, test and release, and the limits of
  the environment (what a cloud session cannot do there).

<!-- owner-rules v9: general (AGENTS.md) - end -->

## Project knowledge

- **People:** The owner (GitHub: Dr-Nerdlove) is the only person working on the repository and decides about
  merging and releases. They build the project together with AI assistants and do not program themselves.
  The app is made for the owner's wife; she is the main user and gives feedback on looks and features.
  Do not put her name or other personal details into the repository.
- **Product:** "CuteCraft Studio", a cute character builder: users adjust everything from hair colour and
  facial features to body shape and outfit (similar in spirit to the Sims or Cyberpunk creators). It is
  planned to have several style modes; the first one is an **anime look** mode. Look and feel must be cute.
- **Decisions (Oct 2026):** a **web app** first (runs in the browser on phone, tablet and PC), later also an
  **Android app** built from the same code (planned: Capacitor wrapper, separate change). The character is
  **drawn in 2D** (layered SVG), not 3D. The anime mode has a **proportion slider from chibi to normal anime
  proportions**.
- **Product languages:** **German and English**, switchable in the app. Every user-facing text lives in
  `src/i18n/` (one file per language, the English dictionary is type-checked against the German one, so a
  missing text fails the build).
- **Build and test:** Vite 7 + TypeScript (strict), vanilla TS, no UI framework, no test framework. `npm install`,
  then `npm run dev` (dev server), `npm run build` (`tsc --noEmit` + `vite build`, output in `dist/`),
  `npm run preview` (serves `dist/`), `npm run check` (types only). Visual and browser checks are done by hand
  or with Playwright against `npm run preview`; there are no automated tests yet.
- **Release:** the web app is published to GitHub Pages (https://dr-nerdlove.github.io/cutecraft-studio/) by
  `.github/workflows/pages.yml` on every push to `main` - merging into `main` therefore publishes. Pages source
  in the repository settings must be "GitHub Actions" (set once by the owner; a cloud session cannot change
  repository settings). Version tags and GitHub releases are not used yet.
- **Traps:** (1) Saved characters live in `localStorage` (`cutecraft.gallery.v1`, `cutecraft.current.v1`) and are
  loaded through `migrate()` in `src/core/storage.ts`. Never rename or reuse a parameter `key` from a mode schema
  (e.g. `src/modes/anime/schema.ts`); add new keys with a default instead, so old saves keep working. (2) Every SVG
  `id` must come from `ctx.uid()` (prefixed per render), because the gallery shows many SVGs on one page.
  (3) Figure geometry is computed once in `src/modes/anime/geometry.ts`; positions of hair, clothes and
  accessories derive from it. New parts must derive from it too, and the extents estimate there (`topExtra`,
  `halfW`) must be updated so the figure stays inside the picture.
- **Repository:** licence GPL-3.0 (`LICENSE`). Version scheme `vMAJOR.MINOR.PATCH`. `.gitignore` and
  `CHANGELOG.md` exist. CI: `.github/workflows/pages.yml` runs `npm ci` + `npm run build` on every push and
  pull request; merge only when it passes.
- **Limits of the environment:** cloud sessions have no `gh` CLI; GitHub is reached through the GitHub MCP tools.
  Sessions push to feature branches; merging into `main` only when the owner asks.
