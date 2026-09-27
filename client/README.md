# Restaurant Reservation System — frontend requirements preview

Run `npm run client` (frontend only) or `npm run dev` (both existing servers) from the project root. Open http://localhost:5173.

This version intentionally runs an isolated frontend preview so every proposed screen can be tested before backend authentication is implemented. It does not send changes to the backend. Accounts and records live in tab memory and reset on refresh. Signing out does not reset the tab's records. Do not enter real credentials or personal information.

## Preview accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@example.com | Admin123! |
| Regular User | guest@example.com | Guest123! |

Registration creates Regular Users only. Admins can create accounts and assign roles through User management. Profile editing changes name, email, and optionally password. No password is returned in record lists or written to browser storage; preview password checks use salted PBKDF2. This still is not production authentication.

## Proposal coverage

| Frontend requirement | Implemented interface |
| --- | --- |
| Registration/login | Forms, validation, password confirmation, sign-in/out, errors |
| Authentication experience | Signed-out gate and preview session |
| Roles | Separate navigation, restricted Admin pages, blocked direct hash navigation |
| Admin manages users | Create, view, edit name/email/password/role, confirm deletion |
| Admin manages system records | Restaurant, table, and reservation CRUD forms |
| Regular User owns records | My Reservations is scoped by account ID, including after email changes |
| Regular User updates information | Profile form; users cannot change their own role |
| Create/read/update/delete | Explicit actions and detail dialogs; deletion and cancellation are separate |
| Basic validation | Required fields, emails, password length, numeric limits, duplicate emails/table labels |
| Restaurant-specific features | Table availability, capacity, booking windows, overlap rejection, cancellation |
| React | Responsive React interface with keyboard-accessible native dialogs |

Preview deletion guards preserve relationships: remove related reservations before a table/user, and tables before their restaurant. Users cannot delete their own account from Admin management. Existing reservations remain accessible if their restaurant becomes inactive.

## Architecture and remaining integration

- `src/services/preview.js`: isolated preview accounts, records, ownership checks, booking rules. A seeded restaurant/table is provided for trying bookings.
- `src/services/api.js`: preserved HTTP adapter from the connected frontend; not used by this preview.
- `src/App.jsx`: account forms, role-specific pages, profile, record and confirmation dialogs.
- `tests/preview.test.js`: account, ownership, permission, and CRUD behavior tests.

Frontend role checks can be bypassed and are not security enforcement. Real JWT authentication, password handling on the server, API authorization/ownership, MongoDB/Mongoose persistence, and backend endpoint alignment remain backend work. The existing server files are unchanged. Its reservation API currently supports cancellation, not hard deletion; the preview's Delete action does not claim to call that endpoint.

The next integration must replace preview calls with real auth/profile/users APIs, authenticated requests, and server-enforced ownership. Keep the proposal's `PUT` update contract in mind; the preserved HTTP adapter currently uses `PATCH`.

## Checks

From the root:

```sh
npm run test --prefix client
npm run lint --prefix client
npm run build --prefix client
```

Browser walkthrough verified registration, login/logout, Admin user create/edit/delete, protected navigation, user booking/edit/delete, profile updates, and mobile layout. The preview can be tested with no backend process.
