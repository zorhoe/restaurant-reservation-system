# Restaurant Reservation System

React/Vite frontend foundation and an Express restaurant reservation API.
The backend currently uses temporary in-memory storage and makes **no database connection**.
Restaurant/table management, reservations, and availability are implemented. Authentication and frontend pages are not implemented yet.

## Setup

Use Node.js 22.12+ or a newer supported LTS version and npm. MongoDB is not required to run this version.

From the project root:

```sh
npm run setup
```

For a fresh clone, copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`.
On PowerShell:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Only copy these when the destination does not already exist. Keep credentials out of Git; all real environment files are ignored.
An existing `MONGO_URI` is not used during application startup. The older database helper remains dormant for future integration; do not run `db:check` at this stage.

## Backend first

```sh
npm run server
```

The backend listens at `http://127.0.0.1:5000`. Open `/api/health` to confirm it is running.
Data starts empty and resets on every restart, including nodemon restarts. No sample data is loaded automatically.
This is a local development API with no authentication; all endpoints are unrestricted. Do not expose it publicly or use real guest data yet.
See [backend API documentation](server/README.md) for routes, rules, and a runnable PowerShell example.

## Commands (project root)

| Command | Purpose |
| --- | --- |
| `npm run server` | Backend development with automatic restarts |
| `npm run client` | Vite development server |
| `npm run dev` | Both development servers |
| `npm start` | Backend without automatic restarts |
| `npm test` | Run backend API and booking-rule tests without a database |
| `npm run lint` | Check backend and frontend JavaScript |
| `npm run build` | Build the frontend into client/dist |

`CLIENT_ORIGIN` defaults to `http://localhost:5173`; change it if the frontend uses another origin.
`VITE_API_URL` reserves the future API base URL; no frontend API service is implemented yet.
The Express server does not currently serve the frontend build.

## Architecture

React is the view layer. Backend requests follow routes → controllers → services → a memory repository.
Storage is separated from HTTP and booking rules. Future MongoDB integration requires an asynchronous repository and atomic conflict handling; simply replacing the memory adapter is not enough for concurrent database writes.

- `server/config`: environment and database configuration
- `server/routes`: API routes
- `server/controllers`: request/response handlers
- `server/services`: booking and resource rules
- `server/repositories`: temporary storage adapter
- `server/models`: future Mongoose schemas
- `server/middleware`: shared request and error handling
- `server/validators`: request validation
- `server/utils`: shared helpers
- `client/src`: assets, components, pages, layouts, routes, services, context, hooks, and utils

Empty folders include `.gitkeep` so Git preserves the structure.

## Next backend step

Add authentication and admin/user ownership rules, restaurant opening schedules and timezone rules, then persistent storage when ready.
Reservations currently use guest details and explicit UTC timestamps. Opening hours, holidays, user accounts, and notifications are not implemented yet.
