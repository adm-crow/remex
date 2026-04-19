# Remex licensing

Remex is an open-core project. Different parts of the repo use different licenses.

| Path                    | License                   | Meaning                                                          |
|-------------------------|---------------------------|------------------------------------------------------------------|
| `remex/` (Python CLI + library, published to PyPI as `remex-cli`) | Apache-2.0 | Free for any use, including commercial. Indefinitely.            |
| `studio/` (desktop app, v1.3.0 and later)                         | FSL-1.1-MIT | Free for any use, **except** commercially competing with Remex Studio. Each release auto-converts to MIT two years later. |
| `studio/` releases **prior to v1.3.0**                            | Apache-2.0 | Remain Apache-2.0 forever. Never retroactively changed.          |
| Everything else (docs, scripts, examples)                         | Apache-2.0 | Same as the root `LICENSE`.                                      |

FSL (Functional Source License) is a source-available license designed for companies that want to keep their source open while protecting against fork-and-commercialize competitors. You can read, modify, build, and use the Studio source for your own projects. You cannot ship a commercial product that competes with Remex Studio. Two years after each release, that release's source converts to MIT.

For commercial licensing questions: support@getremex.com.
