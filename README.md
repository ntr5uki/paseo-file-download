# Paseo file download

[中文说明](README.zh-CN.md)

Download installers, archives and other files from cards below agent replies. File bytes travel over HTTP directly from the Paseo daemon host to the device saving the file.

## Requirements

- Paseo daemon and app 0.15.4 through 0.15.x.
- A direct network path from your device to the download service, normally TCP port 6768.
- Node.js 22+ and npm for development. Runtime production dependencies are installed automatically for Git/npm sources.

## Local development and installation

Run these commands in the project directory:

~~~sh
npm ci
npm run check
paseo plugin install "$PWD"
~~~

Open Settings → Plugins → File downloads → Download settings. Set Public download URL to an address your downloading device can reach, for example http://192.168.1.20:6768. The service listens on all interfaces by default. For a remote host, localhost points to the device running your browser, not to the daemon.

The plugin uses a separate listener; Paseo itself stays on its existing port. Changing the plugin's port or listen address automatically rebinds only this service.

## Use

Ask the agent to link its output, for example:

~~~markdown
[Download installer](dist/setup.exe)
[Download archive](<dist/release package.zip>)
~~~

After the agent finishes, a card lists existing files with their sizes and download buttons. Relative links resolve from the agent's working directory. Absolute paths and local file URLs work when the resulting file is inside its workspace. Reference links work; images, code examples, external URLs and ordinary unlinked filenames do not generate cards. A card contains at most 12 files.

For an earlier reply, run /download without arguments. For a specific file, use /download dist/setup.exe. Paths containing spaces may be quoted. These client commands do not send a prompt to the model. The Command Center also has Add download card for the latest reply and Download settings.

Each click creates a fresh, single-use link with a five-minute lifetime. Browser download handling determines the final save location. Installers over 64 MiB use this HTTP path without the built-in session-transfer cap. The plugin imposes no file-size cap and streams from one open file handle with bounded buffering. Cancel a download using your browser's download controls.

## HTTPS and reverse proxies

For a web client on HTTPS, configure an HTTPS download URL to avoid browser mixed-download restrictions. The plugin itself serves HTTP. You can keep the listener on 127.0.0.1 and proxy it, for example with nginx:

~~~nginx
location /paseo-downloads/ {
    proxy_pass http://127.0.0.1:6768/;
    proxy_buffering off;
    proxy_read_timeout 1h;
}
~~~

Set Public download URL to https://your-host.example/paseo-downloads. The proxy must preserve Content-Disposition and Content-Length. Browser navigation downloads do not require CORS. Do not log download URL paths at the proxy if you want to keep bearer links out of access logs.

## Boundaries

Files must be non-hidden regular files in the agent's workspace. Path traversal and symlinks leaving that root are rejected. A modified or replaced file invalidates the issued link. There is no unauthenticated file listing: a ticket is created through authenticated Paseo plugin RPC, and authorizes only one file. Anyone who receives a valid link can use it until it expires or is consumed. Tokens stay in memory, are bounded in number, and disappear on reload. The /health route reveals only listener availability.

Cards store file paths, names and sizes, never tokens or file bytes. Auto-cards cover completed replies after the plugin starts; /download can collect the latest historical reply. Card persistence follows Paseo's plugin timeline support. Downloads do not resume with a consumed link; request another one to retry. Native mobile opens a system-browser link and still needs device verification.

## Maintenance and sharing

The plugin uses public Paseo APIs and has no app-bundle scraping or DOM interception. Update and validate with:

~~~sh
npm run check
paseo plugin reload paseo-file-download
paseo plugin logs paseo-file-download
~~~

A daemon restart is not required. Version compatibility is deliberately bounded to 0.15.x; test a newer release before widening paseo-plugin.json.

For sharing, put this directory in a Git repository and share its URL. Users can install with paseo plugin add https://github.com/YOUR_ACCOUNT/paseo-file-download. The manifest installs production dependencies from the lockfile. npm distribution is also prepared: inspect npm pack --dry-run, then publish under an available package name. Neither method uploads any workspace files or download content.

A public Paseo directory listing needs a pinned released commit or npm version. Real light, dark and compact UI screenshots are included in the manifest, along with OVERVIEW.md and its Chinese translation. Choose the repository, validate the exact release, and then submit the listing to https://github.com/getpaseo/plugins.

## Validation

npm run check typechecks both runtimes and exercises real HTTP transfers, including an 80 MiB binary file verified by SHA-256, Unicode filenames, empty files, expired/reused links, changed files, traversal, escaping symlinks, interrupted transfers, and port reuse. Markdown parsing is checked separately.

The live UI smoke test verified a real auto-generated card, configuration errors, saving settings, and browser download filename/hash, with light, dark and 390 px layouts. To repeat it, use scripts/validate-ui.mjs against a local daemon and a workspace titled File download plugin containing a card for artifacts/test-package.zip. Set PASEO_TEST_WORKSPACE to its ID. PASEO_APP_DIST and PLAYWRIGHT_CHROMIUM_EXECUTABLE can select the local Paseo app build and an installed browser. The harness reads the local daemon credential in memory, without writing it or changing daemon CORS settings.

MIT licensed.
