# Restaurant Reservation System

MERN foundation using React/Vite and an Express backend with MongoDB/Mongoose.
Application features (authentication, reservations, models, and pages) are not implemented yet.

## Setup

Use Node.js 22.12+ or a newer supported LTS version, npm, and either a running local MongoDB instance or MongoDB Atlas.

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

Only copy these when the destination does not already exist. Set `MONGO_URI` to your local or Atlas database URL. Keep credentials out of Git; all real environment files are ignored.
The default local URL requires MongoDB to be installed and running separately; installing Mongoose does not install MongoDB.
For Atlas, configure a database user and network access for this computer, then put the connection string in `server/.env`.

## Backend first

```sh
npm run db:check
npm run server
```

The backend listens on port 5000 only after MongoDB connects. A failed connection exits with an error; check the database service and `MONGO_URI`.
There are no application endpoints yet, so requests currently return a JSON 404. A browser 404 at the server root is expected.

## Commands (project root)

| Command | Purpose |
| --- | --- |
| `npm run server` | Backend development with automatic restarts |
| `npm run client` | Vite development server |
| `npm run dev` | Both development servers |
| `npm start` | Backend without automatic restarts |
| `npm run db:check` | Connect to MongoDB, ping it, and disconnect |
| `npm run lint` | Check backend and frontend JavaScript |
| `npm run build` | Build the frontend into client/dist |

`CLIENT_ORIGIN` defaults to `http://localhost:5173`; change it if the frontend uses another origin.
`VITE_API_URL` reserves the future API base URL; no frontend API service is implemented yet.
The Express server does not currently serve the frontend build.

## Architecture

React is the view layer. Backend requests will follow routes → controllers → services → Mongoose models → MongoDB.

- `server/config`: environment and database configuration
- `server/routes`: future API routes
- `server/controllers`: future request/response handlers
- `server/services`: future business rules
- `server/models`: future Mongoose schemas
- `server/middleware`: shared request and error handling
- `server/validators`: future request validation
- `server/utils`: shared helpers
- `client/src`: assets, components, pages, layouts, routes, services, context, hooks, and utils

Empty folders include `.gitkeep` so Git preserves the structure.

## Next backend step

Design User, Restaurant, Table, and Reservation relationships and booking rules before implementing schemas, authentication, and reservation CRUD.
Decide reservation duration, overlapping-booking prevention, cancellation rules, and admin/user permissions first.
