# File Library connector

Public frontend extension and server plugin for Luker. This repository contains only the connector UI and the turn-scoped Gemini adapter. It does not deploy a file-library service, downloader, Copyparty, GCS credentials, proxy nodes or personalized server configuration.

## Install and update

Install `https://github.com/kj1534/luker-file-library-plugin` in both Luker's official frontend-extension and server-plugin installers. Enable server plugins and restart the host when prompted. Both components must use the same release; frontend automatic updates are enabled in `manifest.json`, and the server component can be updated through the host's plugin update control.

The host operator sets `config/gcs-video/connection.json` (outside this repository):

```json
{"service_url":"https://library.example/library/","users":{}}
```

Use your own file-library URL. In the independent application, sign in and create a dedicated plugin access token. In Luker's attachment menu, open File Library and connect that token. Tokens are stored in the host's private configuration, never in Git. Do not remove that configuration when changing repository URLs.

Existing installations from the old combined repository must switch both installation sources to this public repository once. Keep the plugin ID `gcs-video`, the connection file, and account tokens unchanged. Thereafter public Git updates need no access to the private application repository.

## Features

- Browse, search, sort, preview and select files; upload resumably; submit remote imports and follow live tasks.
- File bytes are handled by the configured independent service and its storage nodes, not routed through the chat host.
- Attach supported video, audio, image, PDF and text to only the current Gemini turn; regeneration preserves that turn's attachment.
- Accounts and permission decisions come from the private service. The plugin does not expose storage/node administrator credentials.

Requires Node 24+ on the host and the host's `node-fetch` dependency. The independent service is configured and maintained separately.

License: AGPL-3.0-only.
