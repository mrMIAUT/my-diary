# Зроби себе зі мною — Web Deploy

Пакет подготовлен для размещения в интернете.

На Render:
- Root Directory: backend
- Build Command: pip install -r requirements.txt
- Start Command: uvicorn app:app --host 0.0.0.0 --port $PORT

После публикации Render выдаст HTTPS-ссылку.

Важно: это deployment-пакет-заготовка. Для полноценной онлайн-системы V5 следующим этапом нужно подключить постоянную БД PostgreSQL, хранилище скриншотов и полный frontend к API.
