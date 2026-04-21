import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type User = { id: string; email: string; role: "DRIVER" | "OPERATOR" | "ADMIN" };
type AdminUserSummary = {
  id: string;
  email: string;
  role: User["role"];
  emailVerified: boolean;
  createdAt: string;
  bookingsCount: number;
};
type Spot = { id: string; code: string; location: string; pricePerHour: string; isActive: boolean };
type Booking = { id: string; spotId: string; startTime: string; endTime: string; status: string; spot?: Spot };
type LotAvailability = { location: string; totalSpots: number; freeSpots: number; pricePerHour: string };
type AuthMode = "login" | "register" | "verify";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
const roleLabel: Record<User["role"], string> = {
  DRIVER: "Водитель",
  OPERATOR: "Оператор",
  ADMIN: "Администратор"
};

const bookingStatusLabel: Record<string, string> = {
  ACTIVE: "Активно",
  CANCELLED: "Отменено"
};

const BOOKING_DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 12, 24] as const;

function formatHoursRu(hours: number): string {
  const n = Math.floor(hours);
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} часов`;
  if (mod10 === 1) return `${n} час`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} часа`;
  return `${n} часов`;
}

function groupSpotsByLocation(spots: Spot[]): Record<string, Spot[]> {
  return spots.reduce<Record<string, Spot[]>>((acc, s) => {
    (acc[s.location] ??= []).push(s);
    return acc;
  }, {});
}

export function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [token, setToken] = useState<string>(localStorage.getItem("token") ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [message, setMessage] = useState("");
  const [spotCode, setSpotCode] = useState("");
  const [spotLocation, setSpotLocation] = useState("");
  const [spotPrice, setSpotPrice] = useState("100");
  const [editingSpotId, setEditingSpotId] = useState<string | null>(null);
  const [durationByLocation, setDurationByLocation] = useState<Record<string, number>>({});
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [availabilityByLocation, setAvailabilityByLocation] = useState<Record<string, LotAvailability>>({});
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([]);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null);
  const [adminUserBookings, setAdminUserBookings] = useState<Booking[]>([]);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const jsonAuthHeaders = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);
  const canManageSpots = user?.role === "ADMIN" || user?.role === "OPERATOR";
  const canDeleteSpots = user?.role === "ADMIN";
  const canBook = user?.role === "DRIVER" || user?.role === "ADMIN";
  const isAdmin = user?.role === "ADMIN";

  const spotsByLocation = useMemo(() => groupSpotsByLocation(spots), [spots]);
  const sortedLocations = useMemo(
    () => Object.keys(spotsByLocation).sort((a, b) => a.localeCompare(b, "ru")),
    [spotsByLocation]
  );

  const clearSession = useCallback((optionalMessage?: string) => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
    setBookings([]);
    setAdminUsers([]);
    setSelectedAdminUserId(null);
    setAdminUserBookings([]);
    if (optionalMessage) setMessage(optionalMessage);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        /* offline */
      }
    }
    clearSession();
    setAuthMode("login");
    setVerifyCode("");
    setDeleteAccountOpen(false);
    setDeleteAccountPassword("");
  }, [token, clearSession]);

  function isUnauthorized(res: Response) {
    return res.status === 401;
  }

  const handleEmailNotVerifiedResponse = useCallback(async (res: Response) => {
    if (res.status !== 403) return false;
    const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    if (data.code === "EMAIL_NOT_VERIFIED") {
      setAuthModalOpen(true);
      setAuthMode("verify");
      if (data.message) setMessage(data.message);
      return true;
    }
    return false;
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: User;
      message?: string;
      code?: string;
      email?: string;
      issues?: { message?: string }[];
    };
    if (!res.ok) {
      const issues = data.issues;
      if (res.status === 403 && data.code === "EMAIL_NOT_VERIFIED") {
        setAuthMode("verify");
        setAuthModalOpen(true);
        if (typeof data.email === "string" && data.email.length > 0) setEmail(data.email);
      }
      setMessage(issues?.[0]?.message ?? data.message ?? "Ошибка входа");
      return;
    }
    if (!data.token || !data.user) {
      setMessage("Некорректный ответ сервера");
      return;
    }
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
    setAuthModalOpen(false);
    setVerifyCode("");
    setMessage("Вы успешно вошли в систему");
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage("Пароли не совпадают");
      return;
    }
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = (await res.json().catch(() => ({}))) as {
      needsVerification?: boolean;
      token?: string;
      user?: User;
      message?: string;
      issues?: { message?: string }[];
    };
    if (!res.ok) {
      const issues = data.issues;
      setMessage(issues?.[0]?.message ?? data.message ?? "Ошибка регистрации");
      return;
    }
    if (data.needsVerification) {
      setAuthMode("verify");
      setVerifyCode("");
      setPassword("");
      setConfirmPassword("");
      setMessage(data.message ?? "Введите 6-значный код из письма.");
      return;
    }
    if (data.token && data.user) {
      localStorage.setItem("token", data.token);
      setToken(data.token);
      setUser(data.user);
      setConfirmPassword("");
      setAuthModalOpen(false);
      setMessage("Регистрация выполнена. Вы вошли как водитель.");
    }
  }

  async function submitVerifyCode(event: FormEvent) {
    event.preventDefault();
    const code = verifyCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setMessage("Введите все 6 цифр кода");
      return;
    }
    const res = await fetch(`${API_URL}/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code })
    });
    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: User;
      message?: string;
      issues?: { message?: string }[];
    };
    if (!res.ok) {
      const issues = data.issues;
      setMessage(issues?.[0]?.message ?? data.message ?? "Не удалось подтвердить почту");
      return;
    }
    if (!data.token || !data.user) {
      setMessage("Некорректный ответ сервера");
      return;
    }
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
    setVerifyCode("");
    setAuthModalOpen(false);
    setAuthMode("login");
    setMessage("Почта подтверждена. Добро пожаловать!");
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    const res = await fetch(`${API_URL}/auth/account`, {
      method: "DELETE",
      headers: jsonAuthHeaders,
      body: JSON.stringify({ password: deleteAccountPassword })
    });
    if (isUnauthorized(res)) {
      clearSession("Сессия истекла. Войдите снова.");
      return;
    }
    if (await handleEmailNotVerifiedResponse(res)) return;
    if (res.status === 401) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setMessage(data.message ?? "Неверный пароль");
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string; issues?: { message?: string }[] };
      setMessage(data.issues?.[0]?.message ?? data.message ?? "Не удалось удалить аккаунт");
      return;
    }
    setDeleteAccountOpen(false);
    setDeleteAccountPassword("");
    clearSession();
    setMessage("Аккаунт и связанные данные удалены.");
  }

  async function resendVerificationCode() {
    const res = await fetch(`${API_URL}/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      retryAfterSec?: number;
    };
    if (res.status === 429 && typeof data.retryAfterSec === "number") {
      setMessage(`Подождите ${data.retryAfterSec} с. перед повторной отправкой.`);
      return;
    }
    setMessage(data.message ?? "Запрос обработан.");
  }

  async function loadProfile() {
    if (!token) {
      setUser(null);
      return;
    }
    const res = await fetch(`${API_URL}/auth/me`, { headers: authHeaders });
    if (isUnauthorized(res)) {
      clearSession("Сессия истекла. Войдите снова.");
      return;
    }
    if (await handleEmailNotVerifiedResponse(res)) return;
    if (res.status === 404) {
      clearSession("Аккаунт недоступен.");
      return;
    }
    if (!res.ok) return;
    setUser(await res.json());
  }

  async function loadSpots() {
    const res = await fetch(`${API_URL}/parking-spots`);
    const data = await res.json();
    setSpots(data);
  }

  async function loadBookings() {
    if (!token) return;
    const res = await fetch(`${API_URL}/bookings`, { headers: authHeaders });
    if (isUnauthorized(res)) {
      clearSession("Требуется повторный вход.");
      return;
    }
    if (await handleEmailNotVerifiedResponse(res)) return;
    if (!res.ok) return;
    setBookings(await res.json());
  }

  const loadAdminUsers = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;
    const res = await fetch(`${API_URL}/admin/users`, { headers: authHeaders });
    if (isUnauthorized(res)) {
      clearSession("Требуется повторный вход.");
      return;
    }
    if (await handleEmailNotVerifiedResponse(res)) return;
    if (!res.ok) return;
    setAdminUsers((await res.json()) as AdminUserSummary[]);
  }, [token, user?.role, authHeaders, clearSession, handleEmailNotVerifiedResponse]);

  const loadAdminUserBookingsFor = useCallback(
    async (userId: string) => {
      if (!token || user?.role !== "ADMIN") return;
      const res = await fetch(`${API_URL}/admin/users/${userId}/bookings`, { headers: authHeaders });
      if (isUnauthorized(res)) {
        clearSession("Требуется повторный вход.");
        return;
      }
      if (await handleEmailNotVerifiedResponse(res)) return;
      if (!res.ok) {
        setAdminUserBookings([]);
        return;
      }
      const data = (await res.json()) as { bookings: Booking[] };
      setAdminUserBookings(data.bookings);
    },
    [token, user?.role, authHeaders, clearSession, handleEmailNotVerifiedResponse]
  );

  const loadParkingAvailability = useCallback(async () => {
    if (sortedLocations.length === 0) {
      setAvailabilityByLocation({});
      return;
    }
    const start = new Date();
    const next: Record<string, LotAvailability> = {};
    await Promise.all(
      sortedLocations.map(async (loc) => {
        const h = durationByLocation[loc] ?? 1;
        const end = new Date(start.getTime() + h * 60 * 60 * 1000);
        const params = new URLSearchParams({
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          location: loc
        });
        const res = await fetch(`${API_URL}/parking-availability?${params}`);
        if (!res.ok) return;
        const row = (await res.json()) as LotAvailability;
        next[loc] = row;
      })
    );
    setAvailabilityByLocation(next);
  }, [sortedLocations, durationByLocation]);

  async function createBookingAtLocation(location: string) {
    const hours = Math.max(1, durationByLocation[location] ?? 1);
    const now = new Date();
    const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const res = await fetch(`${API_URL}/bookings`, {
      method: "POST",
      headers: jsonAuthHeaders,
      body: JSON.stringify({ location, startTime: now.toISOString(), endTime: end.toISOString() })
    });
    if (isUnauthorized(res)) {
      clearSession("Сессия истекла. Войдите снова.");
      return;
    }
    if (await handleEmailNotVerifiedResponse(res)) return;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.message ?? "Не удалось создать бронирование");
      return;
    }
    const spotLabel = data.spot ? `${data.spot.code}` : "";
    setMessage(
      spotLabel
        ? `Назначено место ${spotLabel} на ${formatHoursRu(hours)} (бронь ${data.id.slice(0, 8)})`
        : `Бронирование на ${formatHoursRu(hours)} создано: ${data.id.slice(0, 8)}`
    );
    await loadBookings();
    await loadSpots();
    await loadParkingAvailability();
  }

  async function cancelBooking(bookingId: string) {
    const res = await fetch(`${API_URL}/bookings/${bookingId}/cancel`, {
      method: "PATCH",
      headers: authHeaders
    });
    if (isUnauthorized(res)) {
      clearSession("Сессия истекла. Войдите снова.");
      return;
    }
    if (await handleEmailNotVerifiedResponse(res)) return;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.message ?? "Не удалось отменить бронирование");
      return;
    }
    setMessage(`Бронирование ${bookingId.slice(0, 8)} отменено`);
    await loadBookings();
    await loadSpots();
    await loadParkingAvailability();
    if (user?.role === "ADMIN") {
      await loadAdminUsers();
      if (selectedAdminUserId) await loadAdminUserBookingsFor(selectedAdminUserId);
    }
  }

  async function saveSpot(event: FormEvent) {
    event.preventDefault();
    if (!canManageSpots) return;
    const payload = { code: spotCode, location: spotLocation, pricePerHour: Number(spotPrice) };
    const method = editingSpotId ? "PATCH" : "POST";
    const url = editingSpotId ? `${API_URL}/parking-spots/${editingSpotId}` : `${API_URL}/parking-spots`;
    const res = await fetch(url, { method, headers: jsonAuthHeaders, body: JSON.stringify(payload) });
    if (isUnauthorized(res)) {
      clearSession("Сессия истекла. Войдите снова.");
      return;
    }
    if (await handleEmailNotVerifiedResponse(res)) return;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(data?.message ?? "Не удалось сохранить парковочное место");
      return;
    }
    setSpotCode("");
    setSpotLocation("");
    setSpotPrice("100");
    setEditingSpotId(null);
    setMessage(editingSpotId ? "Парковочное место обновлено" : "Парковочное место добавлено");
    await loadSpots();
    await loadParkingAvailability();
  }

  async function deleteSpot(spotId: string) {
    if (!canDeleteSpots) return;
    const res = await fetch(`${API_URL}/parking-spots/${spotId}`, { method: "DELETE", headers: authHeaders });
    if (isUnauthorized(res)) {
      clearSession("Сессия истекла. Войдите снова.");
      return;
    }
    if (await handleEmailNotVerifiedResponse(res)) return;
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      setMessage(err?.message ?? "Не удалось удалить парковочное место");
      return;
    }
    setMessage("Парковочное место удалено");
    await loadSpots();
    await loadParkingAvailability();
  }

  useEffect(() => {
    void loadProfile();
    void loadSpots();
    void loadBookings();
  }, [token]);

  useEffect(() => {
    if (user?.role !== "ADMIN" || !token) {
      setAdminUsers([]);
      setSelectedAdminUserId(null);
      setAdminUserBookings([]);
      return;
    }
    void loadAdminUsers();
  }, [user?.role, token, loadAdminUsers]);

  useEffect(() => {
    if (sortedLocations.length === 0) return;
    void loadParkingAvailability();
  }, [sortedLocations, spots.length, bookings.length, loadParkingAvailability]);

  useEffect(() => {
    if (!authModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAuthModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authModalOpen]);

  useEffect(() => {
    if (!deleteAccountOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDeleteAccountOpen(false);
        setDeleteAccountPassword("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteAccountOpen]);

  return (
    <main className="container">
      <header className="hero card">
        <div className="hero-top">
          <div className="hero-intro">
            <span className="brand-badge">PARKING • AVIA STYLE</span>
            <h1>Сервис поиска и бронирования парковок</h1>
            <p>Найдите место рядом и забронируйте его за пару кликов.</p>
          </div>
          <div className="hero-auth">
            {token && user ? (
              <div className="google-user-chip">
                <span className="google-user-email" title={user.email}>
                  {user.email}
                </span>
                <span className="google-user-role">{roleLabel[user.role]}</span>
                <button type="button" className="google-outline-btn" onClick={() => void logout()}>
                  Выйти
                </button>
                <button
                  type="button"
                  className="google-outline-btn google-outline-btn--danger-text"
                  onClick={() => setDeleteAccountOpen(true)}
                >
                  Удалить аккаунт
                </button>
              </div>
            ) : (
              <button type="button" className="google-signin-btn" onClick={() => setAuthModalOpen(true)}>
                <span className="google-signin-icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path
                      fill="#4285F4"
                      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                    />
                    <path
                      fill="#34A853"
                      d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.348 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"
                    />
                    <path
                      fill="#EA4335"
                      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
                    />
                  </svg>
                </span>
                <span>Войти</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {deleteAccountOpen && (
        <div
          className="auth-modal-backdrop"
          role="presentation"
          onClick={() => {
            setDeleteAccountOpen(false);
            setDeleteAccountPassword("");
          }}
        >
          <div
            className="auth-modal auth-modal--danger"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auth-modal-header">
              <h2 id="delete-account-title" className="auth-modal-title">
                Удаление аккаунта
              </h2>
              <button
                type="button"
                className="auth-modal-close"
                aria-label="Закрыть"
                onClick={() => {
                  setDeleteAccountOpen(false);
                  setDeleteAccountPassword("");
                }}
              >
                ×
              </button>
            </div>
            <p className="auth-modal-subtitle">
              Будут безвозвратно удалены профиль, все бронирования и привязанные данные. Введите пароль для подтверждения.
            </p>
            <form className="auth-modal-form" onSubmit={deleteAccount}>
              <label className="auth-field-label" htmlFor="delete-account-password">
                Пароль
              </label>
              <input
                id="delete-account-password"
                className="auth-field-input"
                type="password"
                autoComplete="current-password"
                value={deleteAccountPassword}
                onChange={(e) => setDeleteAccountPassword(e.target.value)}
              />
              <button type="submit" className="danger-btn danger-btn--full">
                Удалить навсегда
              </button>
              <button
                type="button"
                className="google-outline-btn"
                onClick={() => {
                  setDeleteAccountOpen(false);
                  setDeleteAccountPassword("");
                }}
              >
                Отмена
              </button>
            </form>
          </div>
        </div>
      )}

      {authModalOpen && (
        <div className="auth-modal-backdrop" role="presentation" onClick={() => setAuthModalOpen(false)}>
          <div
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="auth-modal-header">
              <h2 id="auth-modal-title" className="auth-modal-title">
                {authMode === "verify" ? "Подтверждение почты" : authMode === "login" ? "Вход" : "Регистрация"}
              </h2>
              <button type="button" className="auth-modal-close" aria-label="Закрыть" onClick={() => setAuthModalOpen(false)}>
                ×
              </button>
            </div>
            <p className="auth-modal-subtitle">
              {authMode === "verify"
                ? "Введите 6-значный код из письма. Без настройки SMTP код виден в логах контейнера backend."
                : "Используйте аккаунт сервиса парковок"}
            </p>
            {authMode !== "verify" ? (
              <div className="auth-modal-tabs">
                <button
                  type="button"
                  className={`auth-modal-tab ${authMode === "login" ? "is-active" : ""}`}
                  onClick={() => setAuthMode("login")}
                >
                  Вход
                </button>
                <button
                  type="button"
                  className={`auth-modal-tab ${authMode === "register" ? "is-active" : ""}`}
                  onClick={() => setAuthMode("register")}
                >
                  Регистрация
                </button>
              </div>
            ) : (
              <div className="auth-modal-tabs">
                <button
                  type="button"
                  className="auth-modal-tab is-active"
                  onClick={() => {
                    setAuthMode("login");
                    setVerifyCode("");
                  }}
                >
                  ← Ко входу
                </button>
              </div>
            )}
            {authMode === "verify" ? (
              <form className="auth-modal-form" onSubmit={submitVerifyCode}>
                <label className="auth-field-label" htmlFor="auth-email-verify">
                  Электронная почта
                </label>
                <input
                  id="auth-email-verify"
                  className="auth-field-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ваш@email"
                  type="text"
                  autoComplete="email"
                />
                <label className="auth-field-label" htmlFor="auth-code">
                  Код из письма
                </label>
                <input
                  id="auth-code"
                  className="auth-field-input auth-code-input"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                />
                <button type="submit" className="google-primary-btn">
                  Подтвердить
                </button>
                <button type="button" className="google-outline-btn" onClick={() => void resendVerificationCode()}>
                  Отправить код повторно
                </button>
              </form>
            ) : (
              <form className="auth-modal-form" onSubmit={authMode === "login" ? login : register}>
                <label className="auth-field-label" htmlFor="auth-email">
                  Электронная почта
                </label>
                <input
                  id="auth-email"
                  className="auth-field-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ваш@email или user@домен"
                  type="text"
                  autoComplete="email"
                />
                <label className="auth-field-label" htmlFor="auth-password">
                  Пароль
                </label>
                <input
                  id="auth-password"
                  className="auth-field-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  type="password"
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                />
                {authMode === "register" && (
                  <>
                    <label className="auth-field-label" htmlFor="auth-confirm">
                      Подтвердите пароль
                    </label>
                    <input
                      id="auth-confirm"
                      className="auth-field-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      type="password"
                      autoComplete="new-password"
                    />
                  </>
                )}
                <button type="submit" className="google-primary-btn">
                  {authMode === "login" ? "Далее" : "Создать аккаунт"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {message && <p className="message">{message}</p>}

      <section className="card section-card">
        <h2>Карта парковок</h2>
        <iframe
          className="map-container"
          title="Карта OpenStreetMap"
          loading="lazy"
          src="https://www.openstreetmap.org/export/embed.html?bbox=37.5176%2C55.7058%2C37.7176%2C55.8058&layer=mapnik&marker=55.7558%2C37.6176"
        />
      </section>

      <section className="card section-card">
        <h2>Парковочные площадки</h2>
        <p className="muted spot-section-hint">
          Три адреса, на каждой площадке по 30 мест. Строка «Свободно мест» считает места, свободные на выбранный срок с
          текущего момента и уменьшается при каждой новой брони. Место назначается случайно среди свободных.
        </p>

        {sortedLocations.map((location, lotIndex) => {
          const lotSpots = spotsByLocation[location] ?? [];
          const sample = lotSpots[0];
          const count = lotSpots.length;
          const durationFieldId = `booking-duration-lot-${lotIndex}`;
          return (
            <div key={location} className="lot-card">
              <div className="lot-card-main">
                <div className="lot-card-text">
                  <strong className="lot-card-address">{location}</strong>
                  <div className="muted">
                    {availabilityByLocation[location] ? (
                      <>
                        Свободно мест: <strong>{availabilityByLocation[location].freeSpots}</strong> из{" "}
                        {availabilityByLocation[location].totalSpots} · от {availabilityByLocation[location].pricePerHour}{" "}
                        RUB/час · на период {formatHoursRu(durationByLocation[location] ?? 1)} с сейчас
                      </>
                    ) : (
                      <>
                        Всего мест: {count}
                        {sample ? (
                          <>
                            {" "}
                            · от {sample.pricePerHour} RUB/час
                          </>
                        ) : null}{" "}
                        · …
                      </>
                    )}
                  </div>
                </div>
                {canBook && token && (
                  <div className="spot-booking lot-booking">
                    <label className="spot-booking-label" htmlFor={durationFieldId}>
                      Время
                    </label>
                    <select
                      id={durationFieldId}
                      className="select-input select-input--compact"
                      value={durationByLocation[location] ?? 1}
                      onChange={(e) =>
                        setDurationByLocation((prev) => ({
                          ...prev,
                          [location]: Number(e.target.value)
                        }))
                      }
                    >
                      {BOOKING_DURATION_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {formatHoursRu(h)}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => void createBookingAtLocation(location)}>
                      Забронировать ({formatHoursRu(durationByLocation[location] ?? 1)})
                    </button>
                  </div>
                )}
                {canBook && !token && (
                  <button type="button" className="google-outline-btn google-outline-btn--small" onClick={() => setAuthModalOpen(true)}>
                    Войти, чтобы забронировать
                  </button>
                )}
              </div>

              {canManageSpots && (
                <details className="lot-manage-details">
                  <summary>Управление местами на этой площадке ({count})</summary>
                  <div className="lot-spot-list">
                    {[...lotSpots].sort((a, b) => a.code.localeCompare(b.code, "ru")).map((spot) => (
                      <div key={spot.id} className="row spot-row spot-row--compact">
                        <span className="spot-info">
                          <strong>{spot.code}</strong>
                          <span className="price-pill">{spot.pricePerHour} RUB/час</span>
                        </span>
                        <div className="actions">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => {
                              setEditingSpotId(spot.id);
                              setSpotCode(spot.code);
                              setSpotLocation(spot.location);
                              setSpotPrice(String(Number(spot.pricePerHour)));
                            }}
                          >
                            Редактировать
                          </button>
                          {canDeleteSpots && (
                            <button type="button" className="danger-btn" onClick={() => void deleteSpot(spot.id)}>
                              Удалить
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </section>

      {canManageSpots && (
        <section className="card section-card">
          <h2>{editingSpotId ? "Редактирование места" : "Добавление нового места"}</h2>
          <form className="management-form" onSubmit={saveSpot}>
            <input value={spotCode} onChange={(e) => setSpotCode(e.target.value)} placeholder="Код места (например A-11)" required />
            <input value={spotLocation} onChange={(e) => setSpotLocation(e.target.value)} placeholder="Локация" required />
            <input value={spotPrice} onChange={(e) => setSpotPrice(e.target.value)} type="number" min="1" placeholder="Цена в час" required />
            <div className="actions">
              <button type="submit">{editingSpotId ? "Сохранить изменения" : "Добавить место"}</button>
              {editingSpotId && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    setEditingSpotId(null);
                    setSpotCode("");
                    setSpotLocation("");
                    setSpotPrice("100");
                  }}
                >
                  Отмена
                </button>
              )}
            </div>
          </form>
          <p className="muted">
            {user?.role === "OPERATOR"
              ? "Роль оператора: создание и редактирование доступно, удаление запрещено."
              : "Роль администратора: доступно создание, редактирование и удаление."}
          </p>
        </section>
      )}

      {token && isAdmin && (
        <section className="card section-card admin-users-section">
          <h2>Пользователи</h2>
          <p className="muted admin-users-hint">
            Карточки всех зарегистрированных учётных записей. Выберите пользователя, чтобы увидеть его брони и при необходимости отменить активные.
          </p>
          <div className="admin-users-grid">
            {adminUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`admin-user-card ${selectedAdminUserId === u.id ? "is-selected" : ""}`}
                onClick={() => {
                  if (selectedAdminUserId === u.id) {
                    setSelectedAdminUserId(null);
                    setAdminUserBookings([]);
                  } else {
                    setSelectedAdminUserId(u.id);
                    void loadAdminUserBookingsFor(u.id);
                  }
                }}
              >
                <span className="admin-user-card-email" title={u.email}>
                  {u.email}
                </span>
                <span className="admin-user-card-meta">
                  {roleLabel[u.role]} · броней: {u.bookingsCount}
                </span>
                <span className={`admin-user-card-badge ${u.emailVerified ? "is-verified" : "is-pending"}`}>
                  {u.emailVerified ? "Почта подтверждена" : "Почта не подтверждена"}
                </span>
                <span className="admin-user-card-date muted">
                  Регистрация: {new Date(u.createdAt).toLocaleString("ru-RU")}
                </span>
              </button>
            ))}
          </div>
          {adminUsers.length === 0 && <p className="muted">Загрузка списка или пользователей пока нет.</p>}

          {selectedAdminUserId && (
            <div className="admin-user-bookings-panel">
              <h3 className="admin-user-bookings-title">
                Бронирования: {adminUsers.find((x) => x.id === selectedAdminUserId)?.email ?? selectedAdminUserId.slice(0, 8)}
              </h3>
              {adminUserBookings.length === 0 ? (
                <p className="muted">У этого пользователя нет бронирований.</p>
              ) : (
                adminUserBookings.map((booking) => (
                  <div key={booking.id} className="row admin-booking-row">
                    <span className="booking-line">
                      {booking.spot ? (
                        <>
                          <strong>{booking.spot.code}</strong>
                          <span className="muted"> · {booking.spot.location}</span>
                          <br />
                        </>
                      ) : null}
                      {booking.id.slice(0, 8)} · {bookingStatusLabel[booking.status] ?? booking.status} ·{" "}
                      {new Date(booking.startTime).toLocaleString("ru-RU")}
                      {" — "}
                      {new Date(booking.endTime).toLocaleString("ru-RU")}
                    </span>
                    {booking.status === "ACTIVE" && (
                      <button type="button" className="secondary-btn" onClick={() => void cancelBooking(booking.id)}>
                        Отменить бронь
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {token && (
        <section className="card section-card">
          <h2>{user?.role === "DRIVER" ? "Мои бронирования" : "Все бронирования"}</h2>
          {bookings.map((booking) => (
            <div key={booking.id} className="row">
              <span className="booking-line">
                {booking.spot ? (
                  <>
                    <strong>{booking.spot.code}</strong>
                    <span className="muted"> · {booking.spot.location}</span>
                    <br />
                  </>
                ) : null}
                {booking.id.slice(0, 8)} · {bookingStatusLabel[booking.status] ?? booking.status} ·{" "}
                {new Date(booking.startTime).toLocaleString("ru-RU")}
                {" — "}
                {new Date(booking.endTime).toLocaleString("ru-RU")}
              </span>
              {booking.status === "ACTIVE" && (
                <button className="secondary-btn" onClick={() => void cancelBooking(booking.id)}>
                  Отменить бронь
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
