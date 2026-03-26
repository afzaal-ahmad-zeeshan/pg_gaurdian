# pg_guardian

A self-hostable web UI for managing PostgreSQL users, roles, and permissions. Connect to multiple Postgres servers, inspect roles, browse databases, and view privileges — all from a clean, dark/light-mode interface.

---

## Features

| Feature | Description |
| --- | --- |
| **Multi-server support** | Add and switch between multiple Postgres connections |
| **User management** | View all login roles with attributes and database privileges |
| **Role management** | View all roles with attributes (superuser, createdb, replication, memberships) |
| **Database browser** | List databases with owner info on the selected server |
| **Permission matrix** | Inspect privileges per role across databases, schemas, tables, sequences, routines, types, FDWs, and foreign servers |
| **SQL inspector** | Hover any section heading to see the exact query that was executed |
| **Browser-local storage** | Connection credentials stay in your browser — the server never writes them to disk |
| **Theme switcher** | Light, Dark, and System themes |
| **Connection tester** | Verify a connection before saving it |

---

## Tech Stack

- **Framework** — Next.js 15 (App Router, Turbopack)
- **Language** — TypeScript
- **Database driver** — `pg` (node-postgres)
- **UI** — Tailwind CSS v4 + Base UI + shadcn/ui
- **State** — TanStack Query v5
- **Theme** — next-themes

---

## Getting Started

### Prerequisites

- Node.js 18+
- A running PostgreSQL server (local or remote)

### Install and run

```bash
git clone https://github.com/afzaal-ahmad-zeeshan/pg_gaurdian
cd pg_gaurdian
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### First steps

1. Click **Add Server** on the Servers page.
2. Fill in your Postgres connection details (host, port, database, user, password).
3. Check **"Remember in this browser"** to persist credentials to localStorage. Uncheck for a session-only connection.
4. Click **Add Server** — the connection is tested before saving. If it fails you'll see the error inline.
5. Your server now appears in the sidebar switcher. Switch between servers at any time.
6. Navigate to **Users**, **Roles**, **Databases**, or **Permissions** to explore the selected server.

---

## Production deployment

```bash
npm run build
npm start
```

Or pull the pre-built image from Docker Hub:

```bash
docker pull afzaalahmadzeeshan/pg_gaurdian
docker run -p 3000:3000 afzaalahmadzeeshan/pg_gaurdian
```

Or build it yourself:

```bash
docker build -t afzaalahmadzeeshan/pg_gaurdian .
docker run -p 3000:3000 afzaalahmadzeeshan/pg_gaurdian
```

> No database is required by pg_guardian itself — it connects to *your* Postgres instances on demand. No environment variables are required.

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
| `/users` | Login role viewer — attributes, database privileges, current user info |
| `/roles` | Role viewer — all roles with attributes and memberships |
| `/databases` | Database list with owner info for the selected server |
| `/permissions` | Full privilege matrix per role across all object types |

---

## Running tests

```bash
npm test              # single run
npm run test:watch    # watch mode
npm run test:ui       # browser UI
npm run test:report   # verbose output
```

Tests use **Vitest** + **Testing Library** and run entirely in-memory (no Postgres connection needed).

---

## Project structure

```text
src/
├── app/
│   ├── api/pg/          # Server-side API routes (test, roles, users, databases, permissions)
│   ├── databases/       # /databases page
│   ├── roles/           # /roles page
│   ├── users/           # /users page
│   ├── permissions/     # /permissions page
│   └── layout.tsx       # Root layout (theme, sidebar)
├── components/
│   ├── ui/              # Base UI / shadcn primitives
│   ├── servers/         # ServersPage, AddServerDialog
│   ├── roles/           # RolesPage
│   ├── users/           # UsersPage
│   ├── permissions/     # PermissionsMatrix
│   ├── SqlQueryButton.tsx
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
- Follow the existing code style (TypeScript strict, no `any`, Tailwind for all styling).

### Reporting bugs

Open an issue with:

- Steps to reproduce
- Expected vs actual behaviour
- Postgres version and browser you're using

---

## License

[MIT](./LICENSE)
