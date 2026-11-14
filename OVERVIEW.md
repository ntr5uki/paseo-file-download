# File downloads

Download files linked in agent replies from a card below the conversation. Installers, archives, documents and other regular files use the same download action. A card appears after a completed reply contains explicit Markdown file links. The /download command can also add a specific file or collect links from the latest reply.

Requires Paseo 0.15.4 through 0.15.x. Configure a public download URL reachable from your device under Download settings. The HTTP service uses port 6768 and listens on all network interfaces by default; both are configurable. A remote device needs access to that port, or to a reverse proxy in front of it. HTTPS web clients should use an HTTPS download URL.

Clicking Download requests a single-use link valid for five minutes. File bytes stream directly from the daemon host to your browser, without passing through the model or being assembled in plugin RPC responses. Desktop and web use the browser download manager. Native clients open the link in the system browser; native saving has not been verified.

Only non-hidden regular files inside the agent's workspace can be downloaded. Symlinks escaping the workspace, hidden directories, folders and external URLs are excluded. A file changed since the link was issued requires a new link. The plugin reads replies and file metadata to build cards, and reads file contents only when you download. File contents and credentials are not stored in cards or sent to an external service. Anyone holding an unexpired link can download that one file once. Resuming a transfer with the same link is not supported.
