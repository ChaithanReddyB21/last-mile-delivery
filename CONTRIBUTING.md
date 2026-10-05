# Contributing to Nexus

Keep improvements connected to a clear model, usable demonstration or reproducible result.

## Before a pull request

1. Describe the problem using generator settings or a minimal synthetic scenario.
2. Keep the change focused; explain changes to guarantees, units or validation.
3. Run the checks below and add meaningful algorithm tests when computation changes.
4. Include screenshots for interface changes and update behavioral documentation.

```bash
npm test
python -m unittest discover -s python -v
npm run build
```

Issue reports should include expected/actual behavior, scenario settings, closures/delays and browser/runtime version. Attach only data you intend to share publicly.

Keep algorithms pure in `engine.js` and interface state in `app.js`. Preserve Python parity and explicit exact/heuristic labels. Use measured documentation results. Discuss new runtime dependencies before adding them.

No open-source license has been declared; contact the maintainer before redistributing the code under a license.
