# pg_guardian

A self-hostable web UI for managing PostgreSQL users, roles, and permissions. Connect to multiple Postgres servers, inspect roles, browse databases, and manage privileges — all from a clean, dark/light-mode interface. No desktop app, no separate backend: just deploy and go.

---

## Features

| Feature | Description |
| --- | --- |
| **Multi-server support** | Add and switch between multiple Postgres connections |
| **Role management** | View all roles with their attributes (login, superuser, createdb, replication, memberships) |
| **Database browser** | List databases on the selected server |
| **Permission matrix** | Inspect table-level privileges per role *(in progress)* |
| **Browser-local storage** | Connection credentials stay in your browser — the server never writes them to disk |
| **Session-only connections** | Opt out of localStorage; credentials live only for the browser session |
| **Theme switcher** | Light, Dark, and System themes — preference stored in localStorage |
| **Connection tester** | Verify a connection before saving it |

---

## Tech Stack

- **Framework** — Next.js 15 (App Router, Turbopack)
- **Language** — TypeScript
- **Database driver** — `pg` (node-postgres)
- **UI** — Tailwind CSS v4 + shadcn/ui + Radix/Base UI
- **State** — TanStack Query v5
- **Theme** — next-themes

---

## Getting Started

### Prerequisites

- Node.js 18+
- A running PostgreSQL server (local or remote)

### Install and run

```bash
git clone <your-repo-url>
cd pg_gaurdian
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### First steps

1. Click **Add Server** on the Servers page.
2. Fill in your Postgres connection details (host, port, database, user, password).
3. Check **"Remember in this browser"** if you want the credentials persisted to localStorage. Uncheck for a session-only connection.
4. Click **Add Server** — the connection is tested before saving. If it fails you'll see the error inline.
5. Your server now appears in the sidebar switcher at the bottom-left. Switch between servers at any time.
6. Navigate to **Roles** or **Databases** to explore the selected server.

---

## Configuration

### Environment variables

Copy `.env.local` and fill in your values:

```bash
cp .env.local .env.local
```

| Variable | Description | Default |
| --- | --- | --- |
| `NEXTAUTH_SECRET` | Secret for NextAuth session signing — **required in production** | `change_me` |
| `NEXTAUTH_URL` | Full URL of your deployment | `http://localhost:3000` |

Generate a strong secret:

```bash
openssl rand -base64 32
```

### Production deployment

**Docker** (recommended for self-hosting):

```bash
docker build -t pg_guardian .
docker run -p 3000:3000 -e NEXTAUTH_SECRET=<secret> pg_guardian
```

**Vercel / any Node.js host:**

```bash
npm run build
npm start
```

> No database is required by pg_guardian itself — it connects to *your* Postgres instances on demand.

---

## How it works

```text
Browser (React + TanStack Query)
    │
    │  fetch (POST /api/pg/*)
    ▼
Next.js API Routes  ←── connection config passed in request body
    │
    │  node-postgres Pool
    ▼
Your PostgreSQL Server(s)
```

- Connection details (including the password) are sent from the browser to the Next.js server on each request — they are **never written to the server's filesystem**.
- If you enable "Remember in this browser", the full connection config is stored in your browser's `localStorage` under the key `pg_guardian_servers`. You can remove any connection at any time from the Servers page.
- Pool connections are cached server-side by `host:port/database@user` for the lifetime of the Node.js process.

---

## Available pages

| Route | Description |
| --- | --- |
| `/` | Server management — add, test, remove connections |
| `/roles` | Role viewer — attributes, memberships |
| `/databases` | Database list for the selected server |
| `/permissions` | Table privilege matrix *(coming soon)* |

---

## Running tests

```bash
npm test            # single run
npm run test:watch  # watch mode
```

Tests use **Vitest** + **Testing Library** and run entirely in-memory (no Postgres connection needed).

---

## Project structure

```text
src/
├── app/
│   ├── api/pg/          # Server-side API routes (test, roles, databases)
│   ├── databases/       # /databases page
│   ├── roles/           # /roles page
│   ├── permissions/     # /permissions page
│   └── layout.tsx       # Root layout (theme, sidebar)
├── components/
│   ├── ui/              # shadcn/ui primitives
│   ├── servers/         # ServersPage, AddServerDialog
│   ├── roles/           # RolesPage
│   ├── ServerSwitcher.tsx
│   ├── ServerSelect.tsx
│   ├── Sidebar.tsx
│   └── ThemeToggle.tsx
├── context/
│   └── ServerContext.tsx  # Global server selection state
├── hooks/
│   └── useServers.ts      # localStorage-backed server list
├── lib/
│   └── db/
│       ├── client.ts      # Pool manager
│       └── queries.ts     # SQL queries
└── types/
    └── index.ts           # Shared TypeScript types
```

---

## Contributing

Contributions are welcome. Here's how to get set up:

1. **Fork** the repo and create a feature branch:

   ```bash
   git checkout -b feat/your-feature
   ```

2. **Install** dependencies: `npm install`

3. **Run** the dev server: `npm run dev`

4. **Test** your changes: `npm test`

5. **Lint** before submitting: `npm run lint`

6. **Open a pull request** with a clear description of what you changed and why.

### Guidelines

- Keep PRs focused — one feature or fix per PR.
- Add or update tests for any logic you change in `src/lib/` or `src/hooks/`.
- Do not commit `.env.local` or any file containing credentials.
- The `data/` directory is gitignored — do not commit it.
- Follow the existing code style (TypeScript strict, no `any`, Tailwind for all styling).

### Reporting bugs

Open an issue with:

- Steps to reproduce
- Expected vs actual behaviour
- Postgres version and browser you're using

---

## License

[MIT](./LICENSE)
