# Система бронирования парковочных мест

Веб-приложение для поиска свободных мест, бронирования и управления парковками.  
Стек: **React** (Vite), **Fastify**, **Prisma**, **PostgreSQL**.

## Требования

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Docker Compose](https://docs.docker.com/compose/) (обычно входит в Docker Desktop)
- Для локальной разработки без Docker: **Node.js 20+** и **npm**

> PostgreSQL в Docker доступен на хосте по порту **5433** (чтобы не конфликтовать с локальным PostgreSQL на `5432`).

---

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

---

## Структура проекта

```
├── backend/          # Fastify API, Prisma, тесты
├── frontend/         # React + Vite
├── docker-compose.yml
├── package.json      # необязательные npm-алиасы для docker-compose
└── .env.example      # переменные для SMTP и JWT
```

---

## Полезные команды backend

```bash
cd backend

npm run build              # сборка TypeScript
npm run prisma:generate    # генерация Prisma Client
npm run prisma:migrate     # миграции (dev)
npm run seed               # тестовые данные
```

---

## Устранение неполадок

**Порт 5433 занят** — остановите другой контейнер или процесс на этом порту.

**Ошибка сборки Docker (timeout к registry)** — проверьте интернет/VPN и повторите `docker-compose up -d --build`.

**Код подтверждения email не приходит** — настройте SMTP в `.env` или смотрите логи: `docker-compose logs backend`.
