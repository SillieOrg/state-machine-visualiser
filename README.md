# JSM Visualiser

A web app for visualising **JSON State Machine (JSM)** files as interactive flowcharts.

Upload or paste a JSM JSON file and get an editable flowchart — nodes, transitions, entry actions, and nested child states are all rendered automatically with a sensible default layout.

## Features

- Paste or upload a JSM JSON file
- Auto-layout flowchart rendered on load
- Drag nodes to customise the layout
- Nested child states rendered as grouped sub-flows
- Transition labels derived from `exitChecks`

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## JSM Format

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

- `entryStateName` — name of the initial state (also accepts legacy `start` field)
- `entryActions` — run on entering a state; each is either an action (`action`, optional `check`) or an event (`event`, optional `schema`, `goTo`, `check`). Events with a `goTo` are drawn as dashed ⚡ transitions
- `exitChecks` — transitions; `check` is optional (no check = always, shown as "always"); `goTo` uses dot-notation for child states (`"Complete.Success"`, also accepts legacy `goto`)
- `children` — nested child states, rendered as a sub-group

### Backward Compatibility

The app accepts both old and new field names:
- `"start"` is automatically converted to `"entryStateName"`
- `"goto"` in exitChecks and entryActions is automatically converted to `"goTo"`
- Internally, all JSM files are normalized and saved with the canonical field names

## Sharing

Click the **Share** button to copy a URL containing your state machine. The state (positions, layout, transitions) is compressed and embedded in the URL query parameter, making it compact even for large state machines.

- Compressed URLs are ~70-80% shorter than uncompressed equivalents
- All node positions, custom layout, and edge data are preserved in the share link
- Recipients load the shared state automatically when opening the link

## Tech Stack

- [Next.js](https://nextjs.org) (App Router)
- React Flow (flowchart rendering)
- TypeScript
- [pako](https://github.com/nodeca/pako) (Deflate compression)
