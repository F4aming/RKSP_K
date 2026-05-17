# Система бронирования парковочных мест

Веб-приложение для поиска свободных мест, бронирования и управления парковками.  
Стек: **React** (Vite), **Fastify**, **Prisma**, **PostgreSQL**.


## Быстрый старт

### 1. Настройка переменных окружения

Скопируйте пример файла в корне проекта:

```bash
cp .env.example .env
```

При необходимости отредактируйте `.env` (JWT, SMTP для отправки кодов подтверждения на почту).  
Без SMTP коды подтверждения выводятся в логи контейнера `backend`.

### 2. Запуск

Из корня репозитория:

```bash
docker-compose up -d
```

При первом запуске или после изменений в коде пересоберите образы:

```bash
docker-compose up -d --build
```

**Остановка:**

```bash
docker-compose down
```

**Просмотр логов:**

```bash
docker-compose logs -f
```

Альтернатива через npm (то же самое): `npm run start`, `npm run stop`, `npm run logs`.

### 3. Адреса

| Сервис   | URL |
|----------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000/api |
| Health check | http://localhost:3000/health |
| PostgreSQL (с хоста) | `localhost:5433` |

При первом запуске backend автоматически применяет схему БД (`prisma db push`) и выполняет seed.

### Тестовые пользователи (после seed)

| Роль     | Email | Пароль |
|----------|-------|--------|
| Админ | `admin@example.com` | `Admin123!` |
| Оператор | `operator@example.com` | `Operator123!` |
| Водитель | `driver@example.com` | `Driver123!` |

---

## Локальная разработка (без Docker для backend/frontend)

### 1. База данных

Запустите только PostgreSQL:

```bash
docker-compose up -d db
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run seed
npm run dev
```

### 3. Frontend

В отдельном терминале:

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173  
API по умолчанию: http://localhost:3000/api

---

## Тестирование

Тесты находятся в `backend/tests/`. Используются **Vitest** и **fast-check** (фаззинг).

### Установка зависимостей

```bash
cd backend
npm install
```

### Все тесты

```bash
npm test
```

### Только фаззинг

```bash
npm run test:fuzz
```

#### Что проверяет фаззинг

- **`tests/fuzz-schemas.spec.ts`** — Zod-схемы валидации на случайных данных (`safeParse` не падает).
- **`tests/fuzz-api.spec.ts`** — HTTP-эндпоинты на случайных телах, query и заголовках; сервер не должен отвечать `500` (Prisma и почта замоканы, БД не требуется).

