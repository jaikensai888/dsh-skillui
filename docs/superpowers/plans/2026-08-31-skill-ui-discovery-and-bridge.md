# Skill UI discovery and session bridge implementation plan

## Goal

Make the generic `dsh-skillui` plugin load a standard Skill package installed by
`npx skills add`, serve its declared HTML view, open the sibling Sidebar tab for
the current DSH session, and route deterministic UI actions back to that session.
The recruitment repository remains a pure Skill package and does not become a
DSH plugin.

## Architecture

```text
npx skills add jaikensai888/dsh-recruitment --all -g -y
        |
        v
global Skill root/recruitment/{SKILL.md,skillui/manifest.json,views/index.html}
        |
        v
dsh-skillui host: discover + validate manifest + serve only its files
        ^                                      |
        |                                      v
DSH session events / UI command       dsh-better-sidebar Skill UI Tab
```

## Implementation steps

1. Add failing unit tests for manifest validation, root discovery, safe entry
   resolution, and dynamic HTML serving.
2. Implement a small host-side Skill UI registry. It scans explicit roots,
   validates `skillui/manifest.json`, and never follows a path outside a Skill
   directory.
3. Extend the HTTP bridge with generic Skill UI routes while preserving the
   existing demo reducer and compatibility routes.
4. Extend the client contract so Tab metadata selects a discovered Skill entry,
   and add a session-scoped activation listener. The listener consumes an
   explicit `dsh-skillui:open` event and calls `betterSidebar.openTab(..., scope)`.
5. Add a typed iframe command envelope. The parent validates the iframe origin
   and identity, then submits a session-scoped follow-up through the DSH session
   binding. This is the pure-Skill bridge; domain-specific deterministic
   commands remain described by the Skill and can later be promoted to native
   DSH commands without changing Sidebar code.
6. Update the recruitment manifest/view/docs to use the generic protocol and
   document the exact activation path.
7. Run tests, typecheck, build, and inspect both repositories' diffs. Do not
   install or commit global Skill state as part of this change.

## Verification checkpoints

- A malformed manifest, absolute entry, `..` traversal, and symlink escape are
  rejected or return 404.
- `/skillui/views/recruitment/index.html` serves the installed Skill HTML.
- The existing demo tests remain green.
- An `open` event produces one targeted `betterSidebar.openTab` call carrying
  `sessionId`, `skillId`, `workflowId`, and the safe entry path.
- An iframe command is rejected when its identity or origin is wrong and is
  forwarded only for the current session.
- Recruitment package tests remain green and contain no DSH plugin metadata.
