# Doc Cleanup Rules

When processing raw Claude Code docs, strip only the noise. Keep the content.

## Strip these

- `> ## Documentation Index` header block (first 2-3 lines)
- Component wrappers: `<Steps>`, `<Step>`, `<Note>`, `<Warning>`, `<Tip>`, `<Frame>`, `<Tabs>`, `<Tab>`, `<Accordion>` — keep the content inside them
- Image tags and `srcset` blocks
- `theme={null}` from code fences
- "Related resources" / "Next steps" link lists at the end
- Giant demo scripts that aren't about the feature itself (e.g. 130-line Python visualizer in skills.md)
- `export const` JavaScript blocks (React components used for rendering)

## Keep everything else

- All config formats, code examples, and YAML/JSON blocks
- Frontmatter field tables
- Directory structures
- Naming rules and constraints
- Examples (keep all except unrelated demo scripts)
- Troubleshooting sections
- Comparison tables