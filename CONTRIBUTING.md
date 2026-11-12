# Contributing to Naruvi

Thanks for helping make job searching more manageable. Focused changes, clear bug reports, documentation, and accessibility improvements are all valuable. Taking part means following the [code of conduct](CODE_OF_CONDUCT.md).

## Before starting

Search existing issues first. For a substantial feature or architectural change, open an issue describing the user problem and proposed approach before building it. Small fixes can go straight to a pull request.

## Development

Expand **Local development** in the [quick start](README.md#quick-start), using Node.js 24 and Docker Compose. Read [AGENTS.md](AGENTS.md), the [architecture](docs/ARCHITECTURE.md), and the relevant local Next.js documentation before changing framework behavior.

1. Fork the repository and create a focused branch.
2. Make the smallest coherent change that solves the problem.
3. Add meaningful tests for behavior changes and use synthetic fixtures.
4. Run `npm run typecheck`, `npm run lint`, and `npm test`.
5. Include screenshots for UI changes and explain how you verified them.

Run `npm run build` for production or framework changes. Browser-import changes should also run `npm run test:browser`; model-settings changes should run `npm run test:settings` with the development database available. The settings check uses a disposable schema and fixture endpoint.

## What matters here

- Ground generated claims in the user’s evidence; never invent experience.
- Keep external content separate from instructions.
- Preserve review steps for consequential actions.
- Support keyboard navigation, responsive layouts, and reduced motion.
- Keep Naruvi’s voice warm, practical, and clear.
- Never commit `.env` files, credentials, real CVs, private mail, or database dumps. Before committing captured job pages, remove embedded API keys and analytics tokens.

Describe the problem, the resulting behavior, and validation in your pull request. Mention limitations honestly. Contributions are provided under the project’s Apache-2.0 license; retain applicable third-party notices.

## Releasing

1. Bump `version` in `package.json` and add a `## X.Y.Z — YYYY-MM-DD` section at the top of `CHANGELOG.md`. Settings shows that file.
2. Sign the tag with an SSH key listed in `deploy/trusted-signers`: `git tag -s vX.Y.Z -m vX.Y.Z` (with `git config gpg.format ssh` and `user.signingkey` set), then `git push origin vX.Y.Z`.
3. Pushing the tag runs the release workflow, which:
   - builds, publishes and signs `ghcr.io/eljakani/naruvi-app:X.Y.Z`;
   - publishes the GitHub release, with the changelog section as notes and `naruvi-extension-X.Y.Z.zip` attached.

   The in-app update notice reads the latest release, so it appears only once the image is ready. Bump `version` in `extension/manifest.json` when the extension changes.

Adding or rotating a key in `deploy/trusted-signers` only reaches new installations; existing ones keep the file they were installed with.
