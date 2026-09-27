import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./services/api";
import "./App.css";

const dateLabel = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const timeLabel = (value) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
const localDate = (value) => {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
function Icon({ name, size = 20 }) {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    calendar: "M5 5h14v16H5z M8 2v6 M16 2v6 M5 11h14",
    table: "M4 6h16v8H4z M6 14v7 M18 14v7",
    people:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    plus: "M12 5v14 M5 12h14",
    search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    arrow: "M5 12h14 M13 6l6 6-6 6",
    leaf: "M20 3C7 2 1 9 6 17s16-1 14-14 M5 21L16 9",
    refresh: "M20 7a9 9 0 1 0 1 9 M20 2v6h-6",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}
function Empty({ title, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="calendar" size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

const titles = {
  overview: "Overview",
  reservations: "Reservations",
  restaurants: "Restaurants",
  tables: "Tables & spaces",
  users: "User management",
  profile: "My profile",
};
const go = (route) => {
  window.location.hash = route;
};
function useRoute() {
  const [route, setRoute] = useState(
    () =>
      window.location.hash.slice(1) ||
      window.location.pathname.slice(1) ||
      "overview",
  );
  useEffect(() => {
    const change = () => setRoute(window.location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route;
}
function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [sessionError, setSessionError] = useState("");
  const rawRoute = useRoute();
  const route = ["home", ""].includes(rawRoute) ? "overview" : rawRoute;
  useEffect(() => {
    let active = true;
    const check = () =>
      api
        .me()
        .then((value) => {
          if (active) {
            setUser(value);
            setSessionError("");
            setReady(true);
          }
        })
        .catch((err) => {
          if (active) {
            setSessionError(err.message);
            setReady(true);
          }
        });
    check();
    const expired = () => {
      setUser(null);
      go("login");
    };
    const visibility = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("gather:unauthorized", expired);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(check, 60000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("gather:unauthorized", expired);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!ready || sessionError) return;
    if (!user && !["login", "register"].includes(route)) go("login");
    if (user && ["login", "register"].includes(route)) go("overview");
  }, [ready, user, route, sessionError]);
  const signedIn = (value) => {
    setUser(value);
    setSessionError("");
    go("overview");
  };
  const signOut = async () => {
    try {
      await api.logout();
      setUser(null);
      setSessionError("");
      go("login");
    } catch (err) {
      setSessionError(err.message);
    }
  };
  if (!ready)
    return (
      <div className="loading" role="status">
        Checking your session…
      </div>
    );
  if (sessionError)
    return (
      <div className="empty">
        <h2>Connection interrupted</h2>
        <p role="alert">{sessionError}</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Retry connection
        </button>
      </div>
    );
  if (!user)
    return (
      <AuthScreen registerMode={route === "register"} onSignIn={signedIn} />
    );
  const permitted =
    user.role === "admin"
      ? Object.keys(titles)
      : ["overview", "reservations", "restaurants", "profile"];
  const effectiveRoute = ["login", "register"].includes(route)
    ? "overview"
    : route;
  return (
    <Workspace
      key={`${user.id}:${user.role}`}
      user={user}
      onUser={setUser}
      onLogout={signOut}
      route={effectiveRoute}
      allowed={permitted.includes(effectiveRoute)}
    />
  );
}
function AuthScreen({ registerMode, onSignIn }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (registerMode && values.password !== values.confirm)
        throw new Error("Passwords do not match.");
      onSignIn(
        registerMode
          ? await api.register(values)
          : await api.login(values.email, values.password),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <a className="brand" href="#login">
          <Icon name="leaf" size={30} />
          Gather.
        </a>
        <span className="eyebrow">RESTAURANT RESERVATION SYSTEM</span>
        <h1>
          A place for you.
          <br />A moment to gather.
        </h1>
        <p>
          Find a table, plan your visit, and keep every reservation in one
          thoughtful space.
        </p>
        <div className="auth-features">
          <span>
            <Icon name="calendar" />
            Easy reservations
          </span>
          <span>
            <Icon name="table" />
            The right table
          </span>
          <span>
            <Icon name="people" />
            Good company
          </span>
        </div>
        <small>Group 5 · C3A</small>
      </section>
      <section className="auth-panel">
        <div className="preview-banner">
          <strong>Welcome to your reservation account</strong>
          <span>
            Sign in to manage your reservations. Your session stays active when
            you refresh or switch pages.
          </span>
        </div>
        <div className="auth-form">
          <span className="eyebrow">WELCOME TO GATHER</span>
          <h2>{registerMode ? "Create your account" : "Welcome back"}</h2>
          <p>
            {registerMode
              ? "Start planning your next visit."
              : "Sign in to your reservation workspace."}
          </p>
          <form onSubmit={submit} key={String(registerMode)}>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <fieldset disabled={busy}>
              {registerMode && (
                <label>
                  Full name
                  <input
                    name="name"
                    autoComplete="name"
                    maxLength={200}
                    required
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete={
                    registerMode ? "new-password" : "current-password"
                  }
                  required
                />
              </label>
              {registerMode && (
                <>
                  <p className="form-help">
                    At least 8 characters. New accounts are Regular Users.
                  </p>
                  <label>
                    Confirm password
                    <input
                      name="confirm"
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                </>
              )}
              <button className="primary wide">
                {busy
                  ? "Please wait…"
                  : registerMode
                    ? "Create account"
                    : "Sign in"}
                <Icon name="arrow" size={18} />
              </button>
            </fieldset>
          </form>
          <p className="auth-switch">
            {registerMode ? "Already have an account?" : "New to Gather?"}{" "}
            <a
              href={registerMode ? "#login" : "#register"}
              onClick={() => setError("")}
            >
              {registerMode ? "Sign in" : "Create an account"}
            </a>
          </p>
          <p className="form-help">
            New accounts are Regular Users. Administrator access is assigned by
            an administrator.
          </p>
        </div>
      </section>
    </div>
  );
}
function Workspace({ user, onUser, onLogout, route, allowed }) {
  const isAdmin = user.role === "admin";
  const [data, setData] = useState({
    restaurants: [],
    tables: [],
    reservations: [],
    users: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      Promise.all([
        api.list("restaurants"),
        api.list("tables"),
        api.list("reservations"),
        isAdmin ? api.list("users") : Promise.resolve([]),
      ]).then(([restaurants, tables, reservations, users]) => {
        setData({ restaurants, tables, reservations, users });
        setSelected((current) =>
          restaurants.some((r) => r.id === current)
            ? current
            : restaurants[0]?.id || "",
        );
        setLoading(false);
      }),
    [isAdmin],
  );
  useEffect(() => {
    load().catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }, [load]);
  const venue = data.restaurants.find((r) => r.id === selected);
  const reservations = data.reservations.filter(
    (r) => !selected || r.restaurantId === selected,
  );
  const shown = reservations
    .filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        `${r.guestName} ${r.guestEmail}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
  const tables = data.tables.filter((t) => t.restaurantId === selected);
  const confirmed = reservations.filter((r) => r.status === "confirmed");
  const nav = isAdmin
    ? ["overview", "reservations", "restaurants", "tables", "users", "profile"]
    : ["overview", "restaurants", "reservations", "profile"];
  const label = (key) =>
    key === "reservations" && !isAdmin ? "My Reservations" : titles[key];
  async function action(task, message) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      setNotice(message);
      await load();
      onUser(api.currentUser());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function remove(resource, record) {
    setModal({ kind: "delete", resource, record });
  }
  function edit(resource, record) {
    setModal({ kind: "edit", resource, record });
  }
  async function saved(message) {
    setModal(null);
    setNotice(message);
    await load();
    onUser(api.currentUser());
  }
  const tableName = (id) => data.tables.find((t) => t.id === id)?.label || "—";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-mark">
            <Icon name="leaf" size={25} />
          </span>
          Gather<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          {isAdmin ? "ADMIN WORKSPACE" : "YOUR DINING PLANS"}
        </div>
        <nav aria-label="Main navigation">
          {nav.map((key) => (
            <a
              key={key}
              href={`#${key}`}
              className={`nav-item ${route === key ? "active" : ""}`}
              aria-current={route === key ? "page" : undefined}
            >
              <Icon
                name={
                  key === "reservations"
                    ? "calendar"
                    : key === "tables"
                      ? "table"
                      : key === "users" || key === "profile"
                        ? "people"
                        : "grid"
                }
              />
              {label(key)}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="leaf" />
          <h3>A little more hospitality.</h3>
          <p>
            Less time organizing.
            <br />
            More time welcoming.
          </p>
        </div>
        <div className="workspace-user">
          <span className="avatar">{user.name[0]}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{isAdmin ? "Administrator" : "Regular User"}</small>
          </div>
        </div>
        <button className="secondary logout" onClick={onLogout}>
          Sign out
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">{isAdmin ? "Admin" : "Guest"}</span>
            <span className="slash">/</span>
            {label(route) || "Page not found"}
          </div>
          <span className="badge confirmed">
            {isAdmin ? "Admin" : "Regular User"}
          </span>
        </header>
        <main>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          {!allowed ? (
            <Empty title="This page is not available">
              This account cannot access this page.{" "}
              <a href="#overview">Return to overview.</a>
            </Empty>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">RESTAURANT RESERVATION SYSTEM</span>
                  <h1>
                    {route === "overview"
                      ? `Welcome, ${user.name.split(" ")[0]}.`
                      : label(route)}
                  </h1>
                  <p>
                    {isAdmin
                      ? "Manage your restaurant, records, and guests."
                      : "Find your table and manage your own reservations."}
                  </p>
                </div>
                {["overview", "reservations", "restaurants"].includes(
                  route,
                ) && (
                  <button
                    className="primary"
                    disabled={!venue?.active || !tables.some((t) => t.active)}
                    onClick={() =>
                      setModal({ kind: "edit", resource: "reservations" })
                    }
                  >
                    <Icon name="plus" />
                    New reservation
                  </button>
                )}
              </div>
              {["overview", "reservations", "tables"].includes(route) && (
                <div className="restaurant-bar">
                  <div className="restaurant-picker">
                    <span className="venue-icon">
                      <Icon name="table" />
                    </span>
                    <label>
                      <span>YOUR RESTAURANT</span>
                      <select
                        aria-label="Restaurant"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        {!data.restaurants.length && (
                          <option value="">No restaurants available</option>
                        )}
                        {data.restaurants.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                            {r.active ? "" : " (inactive)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <span className="muted">{venue?.address}</span>
                </div>
              )}
              {loading ? (
                <div role="status" className="loading">
                  Loading your workspace…
                </div>
              ) : (
                <>
                  {route === "overview" && (
                    <>
                      <section className="stats">
                        {[
                          {
                            name: isAdmin ? "Reservations" : "My reservations",
                            value: reservations.length,
                            icon: "calendar",
                          },
                          {
                            name: "Confirmed",
                            value: confirmed.length,
                            icon: "leaf",
                          },
                          {
                            name: isAdmin ? "Expected guests" : "My guests",
                            value: confirmed.reduce(
                              (sum, r) => sum + r.guestCount,
                              0,
                            ),
                            icon: "people",
                          },
                          {
                            name: "Active tables",
                            value: tables.filter((t) => t.active).length,
                            icon: "table",
                          },
                        ].map((s) => (
                          <article className="stat" key={s.name}>
                            <div className="stat-label">
                              {s.name}
                              <Icon name={s.icon} />
                            </div>
                            <strong>{String(s.value).padStart(2, "0")}</strong>
                            <small>
                              For the selected restaurant · all dates
                            </small>
                          </article>
                        ))}
                      </section>
                      <section className="welcome-banner">
                        <div>
                          <span className="eyebrow">A SEAT AT YOUR TABLE</span>
                          <h2>Good moments begin with a reservation.</h2>
                          <p>
                            {isAdmin
                              ? "Set up your space and make every guest feel welcome."
                              : "Choose your time, find a table, and make it a date."}
                          </p>
                          <button
                            onClick={() =>
                              go(isAdmin ? "tables" : "restaurants")
                            }
                          >
                            {isAdmin
                              ? "Manage your tables"
                              : "Explore restaurants"}
                            <Icon name="arrow" size={17} />
                          </button>
                        </div>
                        <div className="table-art" aria-hidden="true">
                          <div className="dining-table">
                            <i />
                            <i />
                            <span className="plate plate-one" />
                            <span className="plate plate-two" />
                            <span className="vase">✳</span>
                          </div>
                        </div>
                      </section>
                    </>
                  )}
                  {["overview", "reservations"].includes(route) && (
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            {isAdmin ? "Reservation book" : "My Reservations"}
                            <span className="count">{reservations.length}</span>
                          </h2>
                          <p>
                            {isAdmin
                              ? "View and manage every booking."
                              : "Only reservations belonging to your account appear here."}
                          </p>
                        </div>
                        <label className="search">
                          <Icon name="search" />
                          <input
                            aria-label="Search reservations"
                            placeholder="Search reservations…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="tabs">
                        {["all", "confirmed", "completed", "cancelled"].map(
                          (status) => (
                            <button
                              key={status}
                              className={filter === status ? "selected" : ""}
                              aria-pressed={filter === status}
                              onClick={() => setFilter(status)}
                            >
                              {status === "all"
                                ? "All reservations"
                                : status[0].toUpperCase() + status.slice(1)}
                            </button>
                          ),
                        )}
                      </div>
                      {!shown.length ? (
                        <Empty title="No reservations to show">
                          Create a booking or try a different filter.
                        </Empty>
                      ) : (
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Guest</th>
                                <th>Date & time</th>
                                <th>Party / table</th>
                                <th>Status</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shown.map((r) => (
                                <tr key={r.id}>
                                  <td>
                                    <strong>{r.guestName}</strong>
                                    <small>{r.guestEmail}</small>
                                  </td>
                                  <td>
                                    <strong>{dateLabel(r.startAt)}</strong>
                                    <small>
                                      {timeLabel(r.startAt)} –{" "}
                                      {timeLabel(r.endAt)}
                                    </small>
                                  </td>
                                  <td>
                                    {r.guestCount} guests
                                    <small>{tableName(r.tableId)}</small>
                                  </td>
                                  <td>
                                    <span className={`badge ${r.status}`}>
                                      {r.status}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="row-actions">
                                      <button
                                        onClick={() =>
                                          setModal({
                                            kind: "details",
                                            resource: "reservations",
                                            record: r,
                                          })
                                        }
                                      >
                                        View
                                      </button>
                                      {r.status === "confirmed" && (
                                        <>
                                          <button
                                            onClick={() =>
                                              edit("reservations", r)
                                            }
                                          >
                                            Edit
                                          </button>
                                          <button
                                            disabled={busy}
                                            onClick={() =>
                                              setModal({
                                                kind: "cancel",
                                                resource: "reservations",
                                                record: r,
                                              })
                                            }
                                          >
                                            Cancel
                                          </button>
                                          {isAdmin &&
                                            new Date(r.endAt) <= new Date() && (
                                              <button
                                                disabled={busy}
                                                onClick={() =>
                                                  action(
                                                    () =>
                                                      api.status(
                                                        r.id,
                                                        "completed",
                                                      ),
                                                    "Reservation completed.",
                                                  )
                                                }
                                              >
                                                Complete
                                              </button>
                                            )}
                                        </>
                                      )}
                                      <button
                                        className="danger-link"
                                        onClick={() =>
                                          remove("reservations", r)
                                        }
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="panel-footer">
                        <span>{shown.length} records</span>
                        <span>
                          Times shown in{" "}
                          {Intl.DateTimeFormat().resolvedOptions().timeZone}
                        </span>
                      </div>
                    </section>
                  )}
                  {route === "restaurants" && (
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            {isAdmin
                              ? "Restaurant records"
                              : "Find your next table"}
                          </h2>
                          <p>
                            {isAdmin
                              ? "Create, view, update, and delete restaurants."
                              : "Explore restaurants accepting reservations."}
                          </p>
                        </div>
                        {isAdmin && (
                          <button
                            className="primary"
                            onClick={() => edit("restaurants")}
                          >
                            Add restaurant
                          </button>
                        )}
                      </div>
                      <div className="table-cards">
                        {data.restaurants.map((r) => (
                          <article className="table-card" key={r.id}>
                            <span
                              className={`badge ${r.active ? "confirmed" : "cancelled"}`}
                            >
                              {r.active ? "Accepting bookings" : "Inactive"}
                            </span>
                            <div className="table-symbol">
                              <Icon name="leaf" size={44} />
                            </div>
                            <h3>{r.name}</h3>
                            <p>{r.address}</p>
                            <div className="card-actions">
                              <button
                                className="secondary"
                                onClick={() =>
                                  setModal({
                                    kind: "details",
                                    resource: "restaurants",
                                    record: r,
                                  })
                                }
                              >
                                View details
                              </button>
                              {isAdmin ? (
                                <>
                                  <button
                                    className="secondary"
                                    onClick={() => edit("restaurants", r)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="secondary danger-link"
                                    onClick={() => remove("restaurants", r)}
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <button
                                  className="primary"
                                  onClick={() => {
                                    setSelected(r.id);
                                    setModal({
                                      kind: "edit",
                                      resource: "reservations",
                                      venue: r,
                                    });
                                  }}
                                >
                                  Book a table
                                </button>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                      {!data.restaurants.length && (
                        <Empty title="No restaurants yet">
                          {isAdmin
                            ? "Add your first restaurant."
                            : "Please check back later."}
                        </Empty>
                      )}
                    </section>
                  )}
                  {route === "tables" && isAdmin && (
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            Your tables
                            <span className="count">{tables.length}</span>
                          </h2>
                          <p>Manage seating capacity and availability.</p>
                        </div>
                        <button
                          className="primary"
                          disabled={!venue}
                          onClick={() => edit("tables")}
                        >
                          Add table
                        </button>
                      </div>
                      <div className="table-cards">
                        {tables.map((t) => (
                          <article className="table-card" key={t.id}>
                            <span
                              className={`badge ${t.active ? "confirmed" : "cancelled"}`}
                            >
                              {t.active ? "Active" : "Inactive"}
                            </span>
                            <div className="table-symbol">
                              <Icon name="table" size={48} />
                            </div>
                            <h3>{t.label}</h3>
                            <p>{t.capacity} seats</p>
                            <div className="card-actions">
                              <button
                                className="secondary"
                                onClick={() =>
                                  setModal({
                                    kind: "details",
                                    resource: "tables",
                                    record: t,
                                  })
                                }
                              >
                                View details
                              </button>
                              <button
                                className="secondary"
                                onClick={() => edit("tables", t)}
                              >
                                Edit
                              </button>
                              <button
                                className="secondary danger-link"
                                onClick={() => remove("tables", t)}
                              >
                                Delete
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                      {!tables.length && (
                        <Empty title="Make room for your guests">
                          Add a table to start accepting reservations.
                        </Empty>
                      )}
                    </section>
                  )}
                  {route === "users" && isAdmin && (
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>User accounts</h2>
                          <p>Manage account information and assigned roles.</p>
                        </div>
                        <button
                          className="primary"
                          onClick={() => edit("users")}
                        >
                          Add user
                        </button>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Role</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.users.map((u) => (
                              <tr key={u.id}>
                                <td>
                                  {u.name}
                                  {u.id === user.id ? " (you)" : ""}
                                </td>
                                <td>{u.email}</td>
                                <td>
                                  <span className="badge confirmed">
                                    {u.role === "admin"
                                      ? "Admin"
                                      : "Regular User"}
                                  </span>
                                </td>
                                <td>
                                  <div className="row-actions">
                                    <button
                                      onClick={() =>
                                        setModal({
                                          kind: "details",
                                          resource: "users",
                                          record: u,
                                        })
                                      }
                                    >
                                      View
                                    </button>
                                    <button onClick={() => edit("users", u)}>
                                      Edit
                                    </button>
                                    <button
                                      disabled={u.id === user.id}
                                      className="danger-link"
                                      onClick={() => remove("users", u)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                  {route === "profile" && (
                    <Profile
                      key={user.email}
                      user={user}
                      onSave={async (values) => {
                        await api.profile(values);
                        await saved("Profile updated.");
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Gather · Restaurant Reservation System</span>
            <span>Group 5 · C3A</span>
          </footer>
        </main>
      </div>
      {modal && (
        <RecordDialog
          modal={modal}
          user={user}
          venue={modal.venue || venue}
          tables={data.tables}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
function Profile({ user, onSave }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (values.password !== values.confirm)
        throw new Error("Passwords do not match.");
      await onSave(values);
      e.target.reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel profile-panel">
      <h2>Personal information</h2>
      <p>Update your name, email, and password.</p>
      <form onSubmit={submit}>
        {error && (
          <div role="alert" className="alert error">
            {error}
          </div>
        )}
        <fieldset disabled={busy}>
          <AccountFields record={user} />
          <label>
            Current password (required to change email or password)
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label>
            Confirm new password
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
            />
          </label>
          <p className="form-help">
            Your role is{" "}
            {user.role === "admin" ? "Administrator" : "Regular User"}. Role
            changes are managed by an administrator.
          </p>
          <button className="primary">
            {busy ? "Saving…" : "Save profile"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
function AccountFields({ record, admin = false, self = false }) {
  return (
    <>
      <label>
        Full name
        <input
          name="name"
          defaultValue={record?.name || ""}
          maxLength={200}
          required
          autoComplete="name"
        />
      </label>
      <label>
        Email address
        <input
          name="email"
          type="email"
          defaultValue={record?.email || ""}
          maxLength={254}
          required
          autoComplete="email"
        />
      </label>
      <label>
        {record ? "New password (optional)" : "Password"}
        <input
          name="password"
          type="password"
          minLength={8}
          required={!record}
          autoComplete="new-password"
        />
      </label>
      {record && (
        <p className="form-help">
          Leave the password blank to keep it unchanged.
        </p>
      )}
      {admin && (
        <label>
          Role
          <select
            name="role"
            defaultValue={record?.role || "user"}
            disabled={self}
          >
            <option value="user">Regular User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      )}
    </>
  );
}
function RecordDialog({ modal, user, venue, tables, onClose, onSaved }) {
  const { kind, resource, record } = modal;
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(null);
  const [booking, setBooking] = useState(null);
  const [tableId, setTableId] = useState(record?.tableId || "");
  const [opened] = useState(() => Date.now());
  const settings = api.config();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const title =
    kind === "delete"
      ? "Delete record?"
      : kind === "cancel"
        ? "Cancel reservation?"
        : kind === "details"
          ? "Record details"
          : `${record ? "Edit" : "Add"} ${resource === "users" ? "user" : resource.slice(0, -1)}`;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (kind === "delete") {
        await api.remove(resource, record.id);
        await onSaved("Record deleted.");
      } else if (kind === "cancel") {
        await api.status(record.id, "cancelled");
        await onSaved("Reservation cancelled.");
      } else if (resource === "reservations" && !available) {
        const query = {
          ...values,
          restaurantId: record?.restaurantId || venue.id,
          startAt: new Date(values.startAt).toISOString(),
          guestCount: Number(values.guestCount),
          durationMinutes: Number(values.durationMinutes),
        };
        const result = await api.availability(query, record?.id);
        setAvailable(result);
        setBooking(query);
        setTableId(
          result.some((t) => t.id === record?.tableId)
            ? record.tableId
            : result[0]?.id || "",
        );
      } else {
        let payload = { ...values };
        if (resource === "restaurants" || resource === "tables")
          payload.active = values.active === "on";
        if (resource === "tables") payload.restaurantId = venue.id;
        if (resource === "users" && record?.id === user.id)
          payload.role = user.role;
        if (resource === "reservations")
          payload = { ...booking, ...values, tableId };
        await api.save(resource, payload, record?.id);
        await onSaved(
          `${resource === "reservations" ? "Reservation" : "Record"} ${record ? "updated" : "created"}.`,
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="editor"
      aria-labelledby="record-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">GATHER WORKSPACE</span>
          <h2 id="record-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {kind === "details" ? (
        <>
          <dl className="details-list">
            {Object.entries(record)
              .filter(
                ([key]) =>
                  !["id", "userId", "tableId", "restaurantId"].includes(key),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                  <dd>
                    {typeof value === "boolean"
                      ? value
                        ? "Yes"
                        : "No"
                      : String(value || "—")}
                  </dd>
                </div>
              ))}
            {resource === "reservations" && (
              <div>
                <dt>Table</dt>
                <dd>
                  {tables.find((t) => t.id === record.tableId)?.label || "—"}
                </dd>
              </div>
            )}
          </dl>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          <fieldset disabled={busy}>
            {kind === "delete" || kind === "cancel" ? (
              <p className="modal-intro">
                {kind === "delete"
                  ? `Permanently remove ${record.name || record.label || record.guestName} from your records? This cannot be undone.`
                  : "Cancel this booking and release its table? The reservation will remain in your records."}
              </p>
            ) : resource === "users" ? (
              <AccountFields
                record={record}
                admin
                self={record?.id === user.id}
              />
            ) : resource === "restaurants" ? (
              <>
                <label>
                  Restaurant name
                  <input
                    name="name"
                    defaultValue={record?.name || ""}
                    maxLength={200}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  Address
                  <input
                    name="address"
                    defaultValue={record?.address || ""}
                    maxLength={500}
                    required
                  />
                </label>
                <label className="check-label">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={record?.active ?? true}
                  />
                  Accepting reservations
                </label>
              </>
            ) : resource === "tables" ? (
              <>
                <label>
                  Table label
                  <input
                    name="label"
                    defaultValue={record?.label || ""}
                    maxLength={50}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  Seating capacity
                  <input
                    name="capacity"
                    type="number"
                    min="1"
                    max="1000"
                    defaultValue={record?.capacity || 4}
                    required
                  />
                </label>
                <label className="check-label">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={record?.active ?? true}
                  />
                  Active table
                </label>
              </>
            ) : !available ? (
              <>
                <label>
                  Date & time
                  <input
                    type="datetime-local"
                    name="startAt"
                    defaultValue={
                      booking
                        ? localDate(booking.startAt)
                        : record
                          ? localDate(record.startAt)
                          : localDate(opened + 86400000)
                    }
                    min={localDate(opened + 60000)}
                    max={localDate(opened + settings.maxAdvanceDays * 86400000)}
                    required
                    autoFocus
                  />
                </label>
                <div className="form-row">
                  <label>
                    Number of guests
                    <input
                      type="number"
                      name="guestCount"
                      min="1"
                      max="1000"
                      defaultValue={
                        booking?.guestCount || record?.guestCount || 2
                      }
                      required
                    />
                  </label>
                  <label>
                    Duration (minutes)
                    <input
                      type="number"
                      name="durationMinutes"
                      min="1"
                      max={settings.maxDurationMinutes}
                      defaultValue={
                        booking?.durationMinutes ||
                        record?.durationMinutes ||
                        settings.defaultDurationMinutes
                      }
                      required
                    />
                  </label>
                </div>
                <p className="form-help">
                  Local time · up to {settings.maxAdvanceDays} days ahead.
                </p>
              </>
            ) : (
              <>
                <div className="booking-summary">
                  {dateLabel(booking.startAt)} · {timeLabel(booking.startAt)} ·{" "}
                  {booking.guestCount} guests
                  <button
                    type="button"
                    onClick={() => {
                      setAvailable(null);
                      setError("");
                    }}
                  >
                    Change
                  </button>
                </div>
                {available.length ? (
                  <>
                    <label>
                      Available table
                      <select
                        value={tableId}
                        onChange={(e) => setTableId(e.target.value)}
                        required
                      >
                        {available.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label} · {t.capacity} seats
                          </option>
                        ))}
                      </select>
                    </label>
                    {user.role === "admin" ? (
                      <>
                        <label>
                          Guest name
                          <input
                            name="guestName"
                            defaultValue={record?.guestName || ""}
                            required
                            maxLength={200}
                          />
                        </label>
                        <label>
                          Guest email
                          <input
                            name="guestEmail"
                            type="email"
                            defaultValue={record?.guestEmail || ""}
                            required
                            maxLength={254}
                          />
                        </label>
                      </>
                    ) : (
                      <p className="form-help">
                        Booking for {user.name} · {user.email}
                      </p>
                    )}
                    <label>
                      Notes (optional)
                      <textarea
                        name="notes"
                        defaultValue={record?.notes || ""}
                        rows={3}
                        maxLength={1000}
                      />
                    </label>
                  </>
                ) : (
                  <Empty title="No tables available">
                    Choose a different time or party size.
                  </Empty>
                )}
              </>
            )}
            <div className="modal-actions">
              <button className="secondary" type="button" onClick={onClose}>
                Back
              </button>
              <button
                className={kind === "delete" ? "primary danger" : "primary"}
                disabled={
                  resource === "reservations" &&
                  kind === "edit" &&
                  available?.length === 0
                }
              >
                {busy
                  ? "Please wait…"
                  : kind === "delete"
                    ? "Delete record"
                    : kind === "cancel"
                      ? "Cancel reservation"
                      : resource === "reservations" && !available
                        ? "Find a table"
                        : record
                          ? "Save changes"
                          : resource === "reservations"
                            ? "Confirm reservation"
                            : "Create record"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </dialog>
  );
}
export default App;
