# Publishing & Auto-update

## Шаг 1. Замени плейсхолдер на свой GitHub

В `package.json` найди и поправь:

```json
"publish": [
  { "provider": "github", "owner": "YOUR_USERNAME", "repo": "chinazes" }
]
```

И в `package.json` -> `appId` если хочешь свой identifier.

## Шаг 2. Создай репо на GitHub

```powershell
cd C:\Users\artem\OneDrive\Desktop\chinazes
git init
git add .
git commit -m "init: chinazes hub"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/chinazes.git
git push -u origin main
```

## Шаг 3. Личные данные

Сервера/подписки/ключи лежат в `%APPDATA%\Chinazes\proxy-config.json` —
это вне репозитория, у каждого пользователя свой. Из исходников ничего
персонального не утекает.

## Шаг 4. GitHub Personal Access Token (для публикации)

1. https://github.com/settings/tokens -> Generate new token (classic)
2. Scopes: `repo` (полный доступ к публичным репо)
3. Скопируй токен.

В PowerShell перед сборкой:

```powershell
$env:GH_TOKEN = "ghp_твой_токен"
```

(или добавь в системные переменные среды один раз).

## Шаг 5. Релиз

```powershell
# Поднимаем версию (сюда смотрит electron-updater)
npm version patch    # 1.0.0 -> 1.0.1
# (или `npm version minor` / `major`)

# Сборка + публикация на GitHub Releases
npm run release
```

Что произойдёт:
- electron-builder соберёт `release/Chinazes Setup X.Y.Z.exe` и `latest.yml`.
- Создаст draft release `vX.Y.Z` на GitHub и зальёт туда оба файла.
- Иди в Releases на GitHub, нажми **Publish release** (он в drafts).

## Как работает авто-обновление

- На каждом запуске установленное приложение через 3 сек после старта
  ходит на `api.github.com/repos/<owner>/<repo>/releases/latest`,
  читает `latest.yml`, сравнивает версии.
- Если на GitHub новее — качает новый `.exe` в фон.
- Когда докачано, в правом нижнем углу всплывает тост
  "Обновление готово -> Перезапустить и установить".
- Юзер жмёт кнопку — приложение само перезапускается с новой версией.

В dev-режиме (`npm run dev`) updater отключён — он работает только в
запакованной версии.

## Чек-лист перед каждым релизом

- [ ] `npm version patch/minor/major` (важно — именно так, чтобы git tag создался)
- [ ] `$env:GH_TOKEN = "..."` стоит
- [ ] `build/icon.ico` на месте
- [ ] `npm run release`
- [ ] Зайти на GitHub Releases и опубликовать draft
