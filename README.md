# Є ПЛАН

PWA для онлайн-ведення клієнтів: тренувальні програми, журнал тренувань, RIR, активність, заміри, харчування, прогрес, щотижневі звіти та кабінет тренера.

## Поточна структура

- `backend/app.py` — FastAPI API, авторизація, PostgreSQL та бізнес-логіка.
- `backend/static/` — PWA frontend, service worker, manifest, стилі та іконки.
- `redesign-v1` — release-candidate гілка нового інтерфейсу.
- `main` — стабільна production-гілка.

## Render

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
- База даних: PostgreSQL через `DATABASE_URL`.

Основні production-змінні також включають `APP_BASE_URL`, email/reset налаштування та, за потреби, push/Telegram конфігурацію. HSTS вмикається тільки після перевірки HTTPS через `EPLAN_HSTS_ENABLED`.

## Release gate

GitHub Actions workflow `.github/workflows/release-gate.yml` перевіряє:

- Python syntax;
- release contract tests;
- JavaScript syntax;
- PWA manifest;
- встановлення runtime dependencies;
- `pip-audit` для Python dependencies.

Локальний статичний gate без підключення до БД:

```bash
python3 -m py_compile backend/app.py
python3 -m unittest discover -s backend/tests -p 'test_*.py'
find backend/static/js -name '*.js' -print0 | xargs -0 -n1 node --check
```

Перед перенесенням release candidate в `main` потрібно дочекатися зеленого release gate і пройти короткий runtime smoke-test на staging.
