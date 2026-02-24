# Умные покупки Web

Веб‑клиент для сервиса списков покупок. Поддерживает полную функциональность: группы, списки, покупки, участники и приглашения.

## Требования
- Node.js 18+
- npm / pnpm / yarn

## Установка и запуск
```bash
npm install
npm run dev
```

По умолчанию приложение использует backend:
```
https://shopping.subscriptionhhapp.ru/api
```

Если нужен другой адрес:
```bash
setx VITE_API_BASE_URL "https://shopping.subscriptionhhapp.ru/api"
```
или `.env` файл:
```
VITE_API_BASE_URL=https://shopping.subscriptionhhapp.ru/api
```

## Авторизация
1. Нажмите **Войти через Telegram**.
2. Откроется бот и попросит подтвердить вход.
3. После подтверждения токен сохраняется в `localStorage` и используется в запросах.

## Инвайты
Поддерживаются ссылки вида:
- `https://shopping.subscriptionhhapp.ru/invite/<token>`
- `?invite=<token>`

После входа приглашение будет принято автоматически.

## Сборка
```bash
npm run build
npm run preview
```
