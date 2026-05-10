# pg_guardian — Test Report

> Generated: 2026-05-10T00:47:31.950Z

---

## API Routes

### ✅ `api/pg.test.ts`

16 passed · 0 failed · 0 skipped

- **POST /api/pg/test**
  - ✓ returns { ok: true } when SELECT 1 succeeds
  - ✓ returns { ok: false, error } when connection throws
  - ✓ returns 400 when connection is missing
- **POST /api/pg/databases**
  - ✓ returns database list from getDatabases
  - ✓ returns 400 when connection is missing
- **POST /api/pg/roles**
  - ✓ returns all roles when action is "list"
  - ✓ returns all roles when action is omitted (default list)
  - ✓ creates a role and returns 201
  - ✓ drops a role and returns 200
  - ✓ returns 400 for unknown action
  - ✓ returns 400 when connection is missing
- **POST /api/pg/users**
  - ✓ returns { users, currentUser } on success
  - ✓ returns 400 when connection is missing
- **POST /api/pg/permissions**
  - ✓ returns the permissions matrix for the given role
  - ✓ returns 400 when connection is missing
  - ✓ returns 400 when rolename is missing

### ✅ `api/servers.test.ts`

6 passed · 0 failed · 0 skipped

- **GET /api/servers**
  - ✓ returns an empty array (superseded stub)
- **GET /api/servers/[id]/test**
  - ✓ returns 410 Gone (deprecated endpoint)
- **GET /api/servers/[id]/databases**
  - ✓ returns 410 Gone (superseded stub)
- **/api/servers/[id]/roles**
  - ✓ GET returns 410 Gone
  - ✓ POST returns 410 Gone
  - ✓ DELETE returns 410 Gone

## DB Queries

### ✅ `queries.test.ts`

23 passed · 0 failed · 0 skipped

- **getRoles**
  - ✓ returns roles with memberof normalized to an array
  - ✓ normalizes null memberof to an empty array
  - ✓ returns empty array when no roles exist
- **getDatabases**
  - ✓ returns databases from query result
  - ✓ returns empty array when no databases
- **getUsers**
  - ✓ returns only login-enabled roles with normalized memberof
- **getCurrentUserInfo**
  - ✓ returns combined user info from three sequential queries
  - ✓ falls back to safe defaults when pg_roles returns no row
- **getTablePrivileges**
  - ✓ returns rows from information_schema
- **createRole**
  - ✓ sends CREATE ROLE without options
  - ✓ includes LOGIN when canLogin is true
  - ✓ includes SUPERUSER when superuser is true
  - ✓ includes CREATEDB when createDb is true
  - ✓ escapes single quotes in passwords
- **dropRole**
  - ✓ sends DROP ROLE IF EXISTS with quoted name
- **getPermissionsMatrix**
  - ✓ maps all 8 sections from parallel queries
  - ✓ returns empty array for a section when its query throws (safe wrapper)
  - ✓ correctly maps field aliases for databases (create_db → create)
  - ✓ correctly maps field aliases for schemas (create_schema → create)
  - ✓ correctly maps table field aliases (sel/ins/upd/del/trunc/refs/trig)
  - ✓ returns empty arrays for all sections when every query throws
- **grantRole**
  - ✓ sends GRANT role TO role
- **revokeRole**
  - ✓ sends REVOKE role FROM role

## Hooks

### ✅ `useServers.test.ts`

4 passed · 0 failed · 0 skipped

- **useServers**
  - ✓ starts with an empty list
  - ✓ adds a server and persists it when persist=true
  - ✓ adds a server without persisting when persist=false
  - ✓ removes a server and updates localStorage

## Pure Utilities

### ✅ `lib.test.ts`

6 passed · 0 failed · 0 skipped

- **poolKey**
  - ✓ produces a consistent key from connection fields
  - ✓ produces different keys for different users
- **memberof normalization**
  - ✓ passes arrays through unchanged
  - ✓ converts null to empty array
  - ✓ converts undefined to empty array
  - ✓ converts unexpected string to empty array

## Components

### ✅ `ServerSwitcher.test.tsx`

1 passed · 0 failed · 0 skipped

- **ServerSwitcher**
  - ✓ shows "No servers added" when the list is empty

### ✅ `components/AddServerDialog.test.tsx`

8 passed · 0 failed · 0 skipped

- **AddServerDialog — form fields**
  - ✓ renders all form inputs
  - ✓ pre-fills host=localhost
  - ✓ pre-fills port=5432
  - ✓ renders persist checkbox checked by default
- **AddServerDialog — successful add**
  - ✓ calls onOpenChange(false) and adds server after successful connection test
- **AddServerDialog — connection failure**
  - ✓ shows error message when connection test fails
- **AddServerDialog — cancel**
  - ✓ calls onOpenChange(false) when Cancel is clicked
- **AddServerDialog — closed state**
  - ✓ does not render form when open=false

### ✅ `components/DatabasesPage.test.tsx`

5 passed · 0 failed · 0 skipped

- **DatabasesPage — no server configured**
  - ✓ shows "No servers configured" message
- **DatabasesPage — loading state**
  - ✓ shows loading indicator while fetching
- **DatabasesPage — databases table**
  - ✓ renders a row for each database
  - ✓ shows database owner name
  - ✓ renders table headers

### ❌ `components/PermissionsMatrix.test.tsx`

3 passed · 14 failed · 0 skipped

- **PermissionsMatrix — no server configured**
  - ✓ shows "No servers configured" message
  - ✓ does not call fetch when no server is configured
- **PermissionsMatrix — auto-selection**
  - ✗ auto-selects the only user when there is one
  - ✗ auto-selects the first user when multiple users exist
  - ✗ fetches the matrix for the auto-selected role
- **PermissionsMatrix — section headings**
  - ✗ renders all 8 section titles after data loads
- **PermissionsMatrix — permission display**
  - ✗ shows ✓ for granted permissions
  - ✗ shows — for denied permissions
  - ✗ renders table/view object names
  - ✗ renders schema names
- **PermissionsMatrix — kind badges**
  - ✗ shows TABLE badge for regular tables
  - ✗ shows VIEW badge for views
  - ✗ shows FN badge for functions
  - ✗ shows ENUM badge for enum types
- **PermissionsMatrix — loading and empty states**
  - ✓ shows loading indicator while users are being fetched
  - ✗ shows "No login roles found" when the server has no login roles
- **PermissionsMatrix — summary strip**
  - ✗ shows resource counts in the summary strip

### ✅ `components/RolesPage.test.tsx`

6 passed · 0 failed · 0 skipped

- **RolesPage — no server configured**
  - ✓ shows "No servers configured" message
- **RolesPage — loading state**
  - ✓ shows loading indicator while fetching
- **RolesPage — roles table**
  - ✓ renders a row for each role
  - ✓ shows superuser badge for superuser role
  - ✓ shows memberof badge for roles with group membership
- **RolesPage — error state**
  - ✓ shows error message when fetch fails

### ✅ `components/ServerSelect.test.tsx`

4 passed · 0 failed · 0 skipped

- **ServerSelect — hidden cases**
  - ✓ returns null when no servers are configured
  - ✓ returns null when exactly one server is configured
- **ServerSelect — with two servers**
  - ✓ renders a combobox trigger when two servers are present
  - ✓ trigger contains the name of the auto-selected first server

### ✅ `components/ServersPage.test.tsx`

8 passed · 0 failed · 0 skipped

- **ServersPage — empty state**
  - ✓ shows "No servers added" message
  - ✓ renders the "Add Server" button
- **ServersPage — with a server**
  - ✓ displays the server name and connection string
  - ✓ renders a "Test connection" button for the server
  - ✓ shows ✓ Connected after a successful connection test
  - ✓ shows error message after a failed connection test
- **ServersPage — remove server**
  - ✓ removes the server card when the trash button is clicked
- **ServersPage — Add Server dialog**
  - ✓ opens AddServerDialog when "Add Server" is clicked

### ✅ `components/UsersPage.test.tsx`

7 passed · 0 failed · 0 skipped

- **UsersPage — no server configured**
  - ✓ shows "No servers configured" message
- **UsersPage — current user panel**
  - ✓ shows "Connected as" with the username
  - ✓ shows member-of group badge
  - ✓ renders the database privileges table
- **UsersPage — all users table**
  - ✓ renders a row for each user
  - ✓ highlights the connected user row with a "you" badge
- **UsersPage — error state**
  - ✓ shows error when fetch fails

## Context

### ✅ `context.test.tsx`

10 passed · 0 failed · 0 skipped

- **ServerContext — initial state**
  - ✓ starts with an empty servers list and no selection
- **ServerContext — auto-selection**
  - ✓ auto-selects the first server after addServer
  - ✓ keeps selection when a second server is added
  - ✓ auto-selects from localStorage on mount
- **ServerContext — manual selection**
  - ✓ updates selected when setSelectedId is called
- **ServerContext — removeServer**
  - ✓ removes the server and clears selection when it was the only one
  - ✓ falls back to the first remaining server after removing the selected one
- **ServerContext — addServer persistence**
  - ✓ persists to localStorage when persist=true
  - ✓ does not write to localStorage when persist=false
- **useServerContext — throws outside provider**
  - ✓ throws when used without ServerProvider

## User Flows

### ✅ `flows/data-browsing.test.tsx`

8 passed · 0 failed · 0 skipped

- **Flow: View Roles**
  - ✓ automatically fetches and renders roles when a server is selected
  - ✓ shows table header columns
- **Flow: View Users**
  - ✓ shows connected-user section and all-users table
  - ✓ shows DB privilege rows for the connected user
  - ✓ shows "Member of" section with groups
  - ✓ shows Superuser attribute badge when current user is a superuser
- **Flow: View Databases**
  - ✓ fetches and displays the database list
- **Flow: No server selected**
  - ✓ does not call fetch on RolesPage when no server is configured

### ✅ `flows/server-management.test.tsx`

5 passed · 0 failed · 0 skipped

- **Flow: Add a new server**
  - ✓ opens the dialog, fills the form, submits successfully, and shows the server card
  - ✓ keeps dialog open and shows error when connection fails
- **Flow: Test existing server connection**
  - ✓ shows ✓ Connected badge after successful test
  - ✓ shows error detail after a failed test
- **Flow: Remove a server**
  - ✓ removes server card and shows empty state after clicking remove

---

## Summary

| Category | Files | Passed | Failed | Skipped |
|----------|------:|-------:|-------:|--------:|
| ✅ API Routes | 2 | 22 | 0 | 0 |
| ✅ DB Queries | 1 | 23 | 0 | 0 |
| ✅ Hooks | 1 | 4 | 0 | 0 |
| ✅ Pure Utilities | 1 | 6 | 0 | 0 |
| ❌ Components | 8 | 42 | 14 | 0 |
| ✅ Context | 1 | 10 | 0 | 0 |
| ✅ User Flows | 2 | 13 | 0 | 0 |
| **Total** | **16** | **120** | **14** | **0** |

### ❌ Failed Tests

- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — auto-selection > auto-selects the only user when there is one**
  > `Unable to find role="combobox"`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — auto-selection > auto-selects the first user when multiple users exist**
  > `Unable to find role="combobox"`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — auto-selection > fetches the matrix for the auto-selected role**
  > `expected undefined to be defined`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — section headings > renders all 8 section titles after data loads**
  > `Unable to find an element with the text: Tables, Views & Materialized Views. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — permission display > shows ✓ for granted permissions**
  > `Unable to find an element with the text: ✓. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — permission display > shows — for denied permissions**
  > `Unable to find an element with the text: —. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — permission display > renders table/view object names**
  > `Unable to find an element with the text: public.users. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — permission display > renders schema names**
  > `Unable to find an element with the text: public. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — kind badges > shows TABLE badge for regular tables**
  > `Unable to find an element with the text: TABLE. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — kind badges > shows VIEW badge for views**
  > `Unable to find an element with the text: VIEW. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — kind badges > shows FN badge for functions**
  > `Unable to find an element with the text: FN. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — kind badges > shows ENUM badge for enum types**
  > `Unable to find an element with the text: ENUM. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — loading and empty states > shows "No login roles found" when the server has no login roles**
  > `Unable to find an element with the text: /no login roles found/i. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
- `components/PermissionsMatrix.test.tsx` — **PermissionsMatrix — summary strip > shows resource counts in the summary strip**
  > `Unable to find an element with the text: Tables & Views. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`
