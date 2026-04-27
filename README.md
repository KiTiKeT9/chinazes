# Chinazes

**Десктоп-хаб для Telegram, Discord, YouTube, TikTok, Steam и десятков других сервисов в одном окне** — с интегрированным обходом блокировок, AI-ассистентом, заметками, лаунчером игр и совместным просмотром.

Скачать последний релиз: [github.com/KiTiKeT9/chinazes/releases](https://github.com/KiTiKeT9/chinazes/releases)

<img width="3439" height="1411" alt="Главное окно Chinazes" src="https://github.com/user-attachments/assets/f19687ff-50db-487f-9efc-206f55fb7765" />

---

## Сервисы в одном окне

- **Соцсети и мессенджеры:** Telegram (Web A/K + Web Z), Discord, WhatsApp, ВКонтакте (опционально), Instagram, X (Twitter)
- **Видео и музыка:** YouTube, TikTok, Twitch, Spotify, Яндекс.Музыка
- **Поиск и почта:** Google, Gmail
- **Игры:** Steam (Web), плюс лаунчер локально установленных игр
- **Кастомные сайты** через Settings → Services → «Добавить свой»
- **Split-screen** — Shift+клик по иконке открывает второй сервис рядом, разделитель тянется мышью

<img width="3439" height="1402" alt="Split View" src="https://github.com/user-attachments/assets/1924a67a-6370-4b66-85b6-9c440185af6d" />

---

## ⚡ Zapret 2 — обход блокировок (рекомендуется)

Системный обход DPI на уровне пакетов через **WinDivert**. Работает не только в Chinazes, но и для всего ПК — браузер, Discord-десктоп, игры.

Требуется установленный Zapret 2 версии не ниже **≥ 21.0.0.6**:
- Telegram-канал: [t.me/bypassblock](https://t.me/bypassblock)
- GitHub: [youtubediscord/zapret](https://github.com/youtubediscord/zapret)

В сайдбаре Chinazes есть **отдельная вкладка ⚡ Zapret 2** со статусом, тестом соединения, открытием GUI Zapret и быстрыми действиями. Опрос состояния каждые 3 секунды через `tasklist`.

### Альтернативные движки в настройках
- **Xray / v2ray** — VLESS/VMess/Trojan/SS/Hysteria2 + поддержка подписок и фильтр «Только CDN (WS+TLS)» для лучшего обхода в РФ (не рекомендуется)
- Системные VPN (AmneziaVPN и др.) подхватываются автоматически

---

## 🤖 AI-ассистент

Встроенный чат с поддержкой нескольких провайдеров:
- OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Mistral, любые OpenAI-совместимые API через custom base URL
- **Стриминг ответов**, история диалогов, голосовой ввод
- Прикрепление картинок (для vision-моделей)
- Quick actions: суммаризация выделенного текста, перевод, объяснение кода

---

## 📝 Заметки и буфер обмена

- Сохранение текста, ссылок, **файлов** (с превью изображений и PDF)
- Drag-and-drop файлов прямо в панель
- Копирование одним кликом, drag-out обратно в любое окно

<img width="575" height="818" alt="Панель заметок" src="https://github.com/user-attachments/assets/797182f9-edf7-415d-a246-753bdc0266d7" />

---

## 🎮 Лаунчер игр (Apps)

- Автодетект Steam-библиотеки на всех дисках (registry + `libraryfolders.vdf` парсер)
- Поиск, иконки из Steam CDN, кастомные папки, ручное добавление любых `.exe`
- Запуск из приложения, без переключения на рабочий стол

---

## 👥 Co-browsing (совместный просмотр)

Хост-режим стримит активный webview как JPEG-кадры через WebRTC datachannel (PeerJS public broker). Гости подключаются по session ID и видят живую трансляцию. ( в текущей версии работает только под впн)

Гранулярные права (управление мышью / прокруткой / клавиатурой / медиа / громкостью / копированием / скачиванием) переключаются на лету. Гостевой ввод реплицируется через `webview.sendInputEvent` с проверкой прав на стороне хоста.

---

## 🛠️ Дополнительно

- **Спуфинг User-Agent / Sec-CH-UA / `navigator.userAgentData`** под Chrome 135 — обход fingerprinting'а Spotify, VK, Google
- **Подавление WebAuthn/Windows Hello** диалогов (silent autofill probes)
- **Заголовок окна и сайдбар** с drag-reorder сервисов (framer-motion)
- **Темы оформления** (светлая/тёмная/кастомные акценты)
- **Auto-update** через electron-updater
- **DevTools для webview** по Ctrl+Shift+I / F12 (для отладки авторизации)
- **Custom protocol** `chinazes-note://` для безопасной отдачи пользовательских заметок

---

## Известные ограничения

- В **Telegram Web** возможны проблемы со входом по QR — используйте вход по номеру телефона, код придёт в самом Telegram от бота
- В **Discord Web** может быть недоступна демонстрация экрана — только в десктоп-клиенте
- **VK** - в текущей версии программы используется мобильная версия, воспользуйтесь кнопкой для перехода в пк версию
- **Zapret 2 GUI** не встраивается в окно Chinazes — у Zapret манифест `requireAdministrator`, и UIPI блокирует кросс-уровневые операции с окнами (`SetParent`). Поэтому вкладка ⚡ Zapret 2 — это нативная панель управления, а полный GUI открывается отдельным окном
- Плагины в бета режиме

---

## Сборка из исходников

```bash
npm install
npm run dev      # разработка (Vite + Electron)
npm run dist     # сборка установщика в release/
```

Требования: Node 18+, Windows 10/11.
