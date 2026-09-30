<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Be terse in your responses, but ensure you cover all necessary details. Avoid unnecessary explanations or justifications. Focus on providing clear, concise information relevant to the task at hand. Do not provide summaries of file changes or code snippets unless explicitly asked. When asked for code, provide only the code without any additional commentary or formatting.

# JSM Visualiser — Project Overview

A Next.js web app for visualising **JSON State Machine (JSM)** files as interactive flowcharts.

## What it does

- Users upload or paste a JSM JSON file into the UI
- The app renders a flowchart representation of the state machine
- Users can edit node positions and customise the layout
- A sensible auto-layout is applied on first render

## JSM format

```json
{
  "entryStateName": "Pending",
  "states": [
    {
      "name": "Pending",
      "entryActions": [
        { "check": "Truthy Statement", "action": "Perform Logic" }
      ],
      "exitChecks": [
        { "check": "Truthy Statement", "goTo": "Complete.Success" },
        { "check": "Error Case",       "goTo": "Complete.Error" }
      ]
    },
    {
      "name": "Complete",
      "children": [
        { "name": "Success" },
        { "name": "Error" }
      ]
    }
  ]
}
```

Key concepts:
- **`entryStateName`** — name of the initial state (also accepts legacy `start` field for backward compatibility)
- **`states`** — flat or nested list of state nodes
- **`entryActions`** — run on entering a state; either an action (`action`, optional `check`) or an event (`event`, optional `schema`/`goTo`/`check`). Events with `goTo` become dashed event edges
- **`exitChecks`** — transitions out of a state (optional `check` + `goTo`, also accepts legacy `goto`)
- **`goTo`** — dot-notation reference to a target state, e.g. `"Complete.Success"` for a child state
- **`children`** — nested child states (rendered as a sub-group in the flowchart)

### Backward Compatibility
Both old and new field names are accepted during parsing and automatically normalized:
- `"start"` → `"entryStateName"`
- `"goto"` → `"goTo"` in exitChecks and entryActions

## Architecture notes

- **React Flow**: use `@xyflow/react` v12 (not the older `reactflow` v11 package)
- **Layout**: dagre for auto-layout; designed to be swappable for ELK if needed for complex graphs
- **JSM parsing**: isolated pure function — no side effects, easy to unit test
- **State**: Zustand store holds raw JSM + validated JSM; nodes/edges are derived; layout overrides are out of scope for now
- **Nested states**: rendered flat — child states use `Parent.Child` node IDs/labels, no React Flow grouping
- **Entry actions**: shown as a persistent tooltip on node click (not inline on the node body)
- **Exit checks**: become edges labelled with the `check` condition
- **Validation**: Zod v4 schema; types inferred from the schema

## Implementation phases

1. JSM Zod schema + inferred types + `validateJSM` util (unit-tested)
2. `parseJSM(jsm) → { nodes, edges }` pure parser (unit-tested)
3. Dagre layout util: takes nodes/edges, returns nodes with x/y
4. Zustand store wiring everything together
5. UI: left panel (textarea + validate) / right panel (React Flow canvas)

## Sharing

State machines can be shared via URL with all state preserved:
- **Encoding**: JSM data (positions, layout, edges) is serialized to JSON, compressed via pako Deflate, then base64-encoded
- **Compression**: ~70-80% size reduction enables complex state machines to fit in URL
- **URL format**: `?name=<name>&data=<compressed-encoded-data>`
- **Recipient flow**: User receives link → URL decoded on page load → JSM auto-loaded with state preserved
- **Implementation**: `encodeJSMCompressed()` / `decodeJSMCompressed()` in `src/lib/shareState.ts`, used by ShareButton

## Deployment

**Static Export (Current)**
- `next.config.ts` uses `output: "export"` for static site generation
- Builds to fully static HTML/CSS/JS with no server required
- Deploy to: Cloudflare Pages, Vercel Static, Netlify, GitHub Pages, S3 + CloudFront
- All app logic runs client-side (browser); state persisted to localStorage
- Works offline; no cold starts or server latency

**Build & deploy:**
```bash
pnpm build          # → out/ directory (static HTML + assets)
pnpm start          # local preview (serves from out/)
```

**Future: Server-side features (GitHub integration, etc.)**
- When adding API routes or dynamic server logic (e.g., load JSM files from GitHub):
  1. Remove `output: "export"` from `next.config.ts`
  2. Add API routes in `src/app/api/` (e.g., `src/app/api/github/route.ts`)
  3. Use dynamic rendering/revalidation as needed
  4. Deploy to Vercel, Render, or Node.js-compatible host
- Current client-side code (stores, parsers, UI) requires no changes — only add server handlers alongside
