# Deploy YokMabar ke VPS

## 1. Upload project ke VPS

```bash
# Di local — push ke Git dulu
git push origin main

# Di VPS
cd /var/www
git clone https://github.com/kamu/yokmabar.git
cd yokmabar
cp .env.example .env
nano .env   # isi semua nilai
```

## 2. Install Docker (jika belum ada)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

## 3. Pasang konfigurasi Nginx

```bash
sudo cp nginx/yokmabar.conf /etc/nginx/sites-available/yokmabar
sudo ln -s /etc/nginx/sites-available/yokmabar /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Generate SSL dengan Certbot

> Pastikan DNS domain sudah pointing ke IP VPS sebelum langkah ini.

```bash
sudo certbot --nginx -d yokmabar.com -d www.yokmabar.com
```

## 5. Jalankan database + redis

```bash
docker compose up -d postgres redis
```

## 6. Jalankan migrasi Prisma

```bash
docker compose run --rm app npx prisma migrate deploy
```

## 7. Build dan jalankan app

```bash
docker compose --profile production up -d --build
```

## 8. Deploy Discord slash commands

```bash
docker compose run --rm app node dist/bots/discord/deploy-commands.js
```

## 9. Verifikasi

```bash
# Cek semua container running
docker compose ps

# Cek log app
docker compose logs -f app

# Test health endpoint
curl https://yokmabar.com/health
```

## Update / Redeploy

```bash
git pull origin main
docker compose --profile production up -d --build app
```

## Cek log

```bash
docker compose logs -f app          # semua log
docker compose logs -f app | grep error   # hanya error
```
