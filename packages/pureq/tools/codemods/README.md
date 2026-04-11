# pureq Codemods and Migration Automations

This directory provides automated ways and recipes to migrate existing `fetch` and `axios` standard usages to `pureq`.

## Contents

- `axios_to_pureq.md` : Contains regular expressions and codemod logic to transform common `axios` calls into `pureq.client` patterns.

## Future Plans
We aim to provide robust `jscodeshift` scripts for full AST transitions. Currently, the most stable way to migrate is using the provided structural search and replace regex formats in your IDE (like VS Code or WebStorm).
