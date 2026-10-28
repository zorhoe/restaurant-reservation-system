# Restaurant reference data

restaurants.json contains the 15 user-supplied restaurant types and weekly schedules.
Hours are interpreted in Asia/Manila. Weekday keys run from 0 (Sunday) to 6 (Saturday).
Each day is an array of { open, close } periods in 24-hour HH:mm format. Empty arrays mean closed.
Reservations must fit entirely within one period, including their full duration.

Run npm run seed:restaurants --prefix server from the project root to import into Atlas.
The seed matches names, preserves existing addresses and active status, and verifies saved records.
No addresses or table inventories were supplied. Admins can add these through the UI.
The seed does not invent tables, capacities, or addresses.

Admins can add and edit restaurant type, address, active status, and daily split-service hours.
Opening-hour edits cannot invalidate upcoming confirmed reservations.
Legacy restaurants without schedules keep their previous unrestricted availability until configured.
