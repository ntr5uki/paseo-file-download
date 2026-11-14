# Project notes

This is a Paseo plugin with separate client, server, and shared code. Keep imports within those runtime boundaries. Use public Paseo APIs only; never import /client/host or scrape the application bundle.

- Validate with npm run check before installing or reloading.
- Reload only paseo-file-download; never restart the daemon for source changes.
- Compatibility is currently >=0.15.4 <0.16.0. Verify daemon and client behavior before widening it.
- Keep downloads streaming through HTTP. Never move installer contents into RPC responses or timeline data.
- Timeline cards contain paths and metadata only. Issue short-lived, single-use tickets when a user clicks Download.
- Preserve workspace containment, hidden-file exclusion, stable file-handle reads, and ticket expiry.
- Use React Native primitives and theme tokens. Browser globals belong only in client/web.ts; native uses the external URL opener.
- Keep English and Chinese labels, overviews, and user-facing documentation aligned.
- Client UI smoke tests use scripts/validate-ui.mjs with a local daemon and an existing validation workspace. The fixture proxies local WebSocket authentication without changing daemon CORS settings; never print or save local credentials.
- Screenshots under assets/ must show only the plugin UI, with no unrelated projects or credentials.
