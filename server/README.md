# Backend API — local development

Run `npm run server` from the project root. No MongoDB installation or connection is used.
The default URL is `http://127.0.0.1:5000/api`. Memory storage is empty on startup and all data disappears on restart.
Authentication is not implemented: this API is for local testing, with no user ownership or admin restrictions yet.

## Configuration

Set optional values in `server/.env`, then restart:

| Variable | Default | Meaning |
| --- | --- | --- |
| PORT | 5000 | HTTP port |
| HOST | 127.0.0.1 | Local-only binding by default |
| CLIENT_ORIGIN | http://localhost:5173 | Allowed browser CORS origin; this is not authentication |
| DEFAULT_DURATION_MINUTES | 90 | Reservation duration when omitted |
| MAX_DURATION_MINUTES | 240 | Maximum allowed duration |
| MAX_ADVANCE_DAYS | 90 | Maximum days ahead of the current instant |

Clients can read public booking settings from `GET /api/config`. No environment secrets are returned.
Existing `MONGO_URI` values are ignored by application startup. The old `db:check` command is an explicit database operation, not part of starting or testing this API.

## Endpoints

Paths below are relative to `/api`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /health | Server and storage status |
| GET | /config | Public booking settings |
| GET, POST | /restaurants | List or create restaurants |
| GET, PATCH, DELETE | /restaurants/:id | Read, partially update, or remove a restaurant |
| GET, POST | /tables | List or create tables |
| GET, PATCH, DELETE | /tables/:id | Read, partially update, or remove a table |
| GET, POST | /reservations | List or create reservations |
| GET, PATCH | /reservations/:id | Read or partially update a reservation |
| GET | /availability | Find available tables for a requested time window |

Create bodies:

- Restaurant: `name`, `address`, optional `active` (default true).
- Table: `restaurantId`, `label`, `capacity`, optional `active` (default true).
- Reservation: `tableId`, `guestName`, `guestEmail`, `guestCount`, `startAt`, optional `durationMinutes`, `notes`, `status` (new records must be confirmed).

Use JSON bodies with `Content-Type: application/json`. Unknown fields are rejected; generated IDs and timestamps cannot be overwritten.
IDs are UUID strings. Single-record responses use `{ "data": { ... } }`; errors use `{ "message": "..." }`.
Create returns 201, delete returns 204, invalid input returns 400, missing records return 404, and booking/reference conflicts return 409.

List routes support `page` (default 1) and `limit` (default 20, maximum 100).
Tables can filter by `restaurantId`. Reservations can filter by `restaurantId`, `tableId`, and `status`.
Lists return `data` and `pagination` containing `page`, `limit`, `total`, and `pages`.

Availability requires `restaurantId` and `startAt`; `guestCount` defaults to 1 and `durationMinutes` defaults to the configured duration.
It returns `data` (matching tables) and `window` (normalized start/end and query values).

## Booking rules

- Send `startAt` as a real UTC ISO timestamp ending in `Z`, with seconds and optional three-digit milliseconds. Convert local times to UTC first.
- Start times must be in the future and within the configured booking horizon.
- Table capacity must cover the guest count. Inactive restaurants/tables cannot accept new or edited confirmed bookings.
- Confirmed reservations for one table cannot overlap. Adjacent reservations are allowed: one may begin exactly when another ends.
- Cancel with `PATCH /reservations/:id` and `{ "status": "cancelled" }`. Cancellation releases the time slot.
- Complete with `{ "status": "completed" }` only after the end time. Status changes to cancelled/completed must be sent separately from detail edits.
- Cancelled/completed reservations are final and cannot be edited or reactivated. Reservations are not hard-deleted.
- Table labels are unique within each restaurant, ignoring case. Tables cannot be moved between restaurants.
- Tables with reservation history cannot be deleted. Deactivate them instead. Restaurants with tables cannot be deleted.
- Reducing capacity cannot invalidate an upcoming/ongoing confirmed reservation. Deactivating a resource preserves existing reservations.

Current scope: guest bookings with no opening-hours, holiday, payment, email, login, or ownership rules. Restaurants are treated as bookable at any future time while active.

## Try a complete flow in PowerShell

Start the backend in another terminal, then run:

```powershell
$apiBase = 'http://127.0.0.1:5000/api'
Invoke-RestMethod "$apiBase/health"

$restaurant = (Invoke-RestMethod "$apiBase/restaurants" -Method Post -ContentType 'application/json' -Body (@{
  name = 'Demo Restaurant'; address = 'Manila'
} | ConvertTo-Json)).data

$table = (Invoke-RestMethod "$apiBase/tables" -Method Post -ContentType 'application/json' -Body (@{
  restaurantId = $restaurant.id; label = 'T1'; capacity = 4
} | ConvertTo-Json)).data

$bookingStart = [DateTime]::UtcNow.AddDays(1).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
$encodedStart = [Uri]::EscapeDataString($bookingStart)
Invoke-RestMethod "$apiBase/availability?restaurantId=$($restaurant.id)&startAt=$encodedStart&guestCount=2"

$reservation = (Invoke-RestMethod "$apiBase/reservations" -Method Post -ContentType 'application/json' -Body (@{
  tableId = $table.id; guestName = 'Demo Guest'; guestEmail = 'demo@example.com'
  guestCount = 2; startAt = $bookingStart
} | ConvertTo-Json)).data

Invoke-RestMethod "$apiBase/reservations/$($reservation.id)"
Invoke-RestMethod "$apiBase/reservations/$($reservation.id)" -Method Patch -ContentType 'application/json' -Body '{"status":"cancelled"}'
```

Run `npm test` from the project root for isolated API tests. Tests use a controlled clock and fresh memory store per app instance.

## Future storage integration

`createApp` accepts a store, clock, and settings for testing and configuration. The service owns validation and booking rules; the repository owns records.
The current repository is synchronous and only safe within one Node process. For MongoDB, make repository/service/controller operations asynchronous and enforce booking conflict checks atomically with an appropriate transaction/locking design. Do not use an independent read-then-insert check under concurrent database requests.
