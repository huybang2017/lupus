# lupus

Monorepo commerce gồm 3 workspace: backend Node thuần (Express + PostgreSQL), dashboard admin React, và storefront React.

Backend là bản port lại logic của Lupus/Medusa sang Express + `pg` thuần — không framework, không DI container, không ORM. Toàn bộ nghiệp vụ (cart totals, promotion, tax, checkout, fulfillment, RMA, RBAC…) nằm trong SQL và service tương ứng.

| Workspace | Package | Cổng dev | Vai trò |
|---|---|---|---|
| `server` | `@dtc/lupus-backend` | `9001` | REST API + Admin API + Store API + serve dashboard tĩnh |
| `client` | `@dtc/admin` | `5099` | Dashboard admin, base path `/app/` |
| `storefront` | `@dtc/lupus-storefront` | `8000` | Website bán hàng |

---

## 1. Yêu cầu

| Công cụ | Phiên bản | Bắt buộc |
|---|---|---|
| Node.js | `^20.19.0` hoặc `>=22.12.0` | có |
| npm | `11.x` (repo khai báo `npm@11.12.1`) | có |
| Docker + Docker Compose | bất kỳ | khuyến nghị — cách nhanh nhất để có PostgreSQL |
| PostgreSQL | 16 | có (nếu không dùng Docker) |
| Redis | 7 | không — tuỳ chọn, backend tự fallback về in-memory |
| `psql` | 13+ | chỉ khi chạy `npm run db:migrate` |

> Windows: xem [mục 5.3](#53-windows--powershell) nếu `psql` chưa có trong PATH.

---

## 2. Cài đặt nhanh (5 phút)

```bash
# 1. Tải code
git clone https://github.com/huybang2017/lupus.git
cd lupus

# 2. Bật PostgreSQL + Redis
docker compose up -d

# 3. Cài dependency (npm workspaces — cài ở root, không cài trong từng workspace)
npm install

# 4. Tạo file env
cp .env.template .env                    # tham khảo, tuỳ chọn
cp server/.env.template server/.env      # BẮT BUỘC — backend đọc file này
cp storefront/.env.template storefront/.env

# 5. Tạo bảng
npm run db:migrate

# 6. Seed dữ liệu mẫu — cần backend đang chạy
npm run dev --workspace @dtc/lupus-backend   # terminal 1
npm run db:seed --workspace @dtc/lupus-backend  # terminal 2

# 7. Chạy cả 3 app (Ctrl+C terminal 1 trước, hoặc cứ để turbo dev chạy tiếp)
npm run dev
```

Mở trình duyệt:

- Dashboard admin → <http://localhost:5099/app/>
- Storefront → <http://localhost:8000>
- API health check → <http://localhost:9001/health>

Đăng nhập admin (tài khoản do seed tạo):

```
Email:    seed@lupus.local
Password: lupus-seed-pass-1
```

---

## 3. Cấu trúc thư mục

```
lupus/
├── server/                  # Backend Express + pg
│   ├── src/
│   │   ├── index.ts         # entrypoint, đọc PORT (mặc định 9001)
│   │   ├── app.ts           # dựng express app + gắn toàn bộ router
│   │   ├── db.ts            # Pool postgres + helper query
│   │   ├── db/              # 45 file schema*.sql + seed-books.ts
│   │   ├── modules/         # 17 domain: auth, cart, catalog, order, tax…
│   │   └── tests/           # 25 file test parity
│   └── public/app/          # console tĩnh fallback
├── client/                  # Dashboard admin (React 18 + Vite 7 + Tailwind 3)
│   └── src/
│       ├── app/             # composition root + router
│       ├── providers/       # auth, protected-route, theme, query-client
│       ├── entities/        # resources.tsx — registry 47 resource
│       ├── pages/           # màn hình theo domain
│       ├── widgets/         # UI dùng lại: shell, table, form, filters…
│       └── shared/          # api client, hooks, formatting, utils
├── storefront/              # Storefront (React 19 + Vite 7 + Tailwind 3)
│   └── src/
│       ├── app/             # composition root + router
│       ├── entities/        # data layer gọi Store API
│       ├── pages/           # catalog, cart, checkout, order, account
│       ├── widgets/         # UI port 1:1 từ starter
│       └── shared/          # api, hooks, store, utils
├── audit/                   # script diff route với upstream Medusa (read-only)
├── turbo.json               # task graph
└── docker-compose.yml       # postgres 16 + redis 7
```

Quy ước quan trọng ở `client` và `storefront`: import chéo thư mục **luôn** dùng alias `@/` (`@/...` → `src/...`), không dùng import tương đối. Xem `client/AGENTS.md` và `storefront/AGENTS.md` để biết chi tiết.

---

## 4. Thiết lập env

### 4.1. `server/.env` — bắt buộc

Backend nạp env bằng `dotenv/config`, tức đọc `.env` nằm cùng thư mục làm việc của tiến trình server (tức `server/.env`).

```bash
cp server/.env.template server/.env
```

```ini
# --- Bắt buộc ---
DATABASE_URL=postgres://postgres:postgres@localhost:5432/lupus
JWT_SECRET=supersecret-change-me
PORT=9001

# --- CORS: origin của storefront và dashboard ---
STORE_CORS=http://localhost:8000
ADMIN_CORS=http://localhost:5099

# --- Provider ngoài (đều tuỳ chọn, để trống thì backend fallback về local/manual) ---
STRIPE_SECRET_KEY=
SENDGRID_API_KEY=
SENDGRID_FROM=no-reply@example.com
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_REGION=us-east-1
REDIS_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
POSTHOG_API_KEY=
POSTHOG_HOST=https://app.posthog.com
```

Vài biến cần chỉ ngay khi mới cài:

| Biến | Ghi chú |
|---|---|
| `JWT_SECRET` | **Đổi trước khi deploy.** Mặc định chỉ dùng cho dev |
| `ADMIN_CORS` | Mặc định trong template là `http://localhost:9000` nhưng dashboard dev chạy ở **5099** — sửa lại nếu gặp lỗi CORS |
| `REDIS_URL` | Để trống là OK. Cache và lock sẽ chạy in-memory + `pg_advisory_xact_lock` |
| `STRIPE_SECRET_KEY` | Để trống thì payment provider `manual` vẫn hoạt động bình thường |

### 4.2. `storefront/.env` — bắt buộc

```bash
cp storefront/.env.template storefront/.env
```

```ini
# Để trống = same-origin, Vite dev server proxy /store /auth /admin /uploads sang :9001
VITE_API_URL=

# Publishable key, gửi kèm header x-publishable-api-key cho mọi request store
VITE_PUBLISHABLE_KEY=pk_5a8d60a16c8bd10090f4f2239b24890f0082ee3bae185207a1bcaedaab178361

# Quốc gia mặc định dùng cho route / và CountryGate
VITE_DEFAULT_REGION=dk
```

> **Lưu ý:** `VITE_DEFAULT_REGION` mặc định là `dk`, nhưng dữ liệu seed chỉ tạo region `us` và `vn`. Nếu storefront ra trang trắng hoặc báo không tìm thấy region, hãy đổi thành `us` hoặc `vn`.

### 4.3. `.env` ở root — tuỳ chọn

```bash
cp .env.template .env
```

Đây là file **tham khảo** liệt kê toàn bộ biến của cả project. Backend không đọc file này. Biến duy nhất có tác dụng thật là `LUPUS_UPSTREAM_ROOT`, dùng cho các script trong `audit/` (đọc checkout Medusa gốc để đối chiếu route).

---

## 5. Database

### 5.1. Tạo bảng

Có 45 file `server/src/db/schema*.sql`. Chúng **phải chạy đúng thứ tự** vì sau `schema.sql` là các patch bổ sung cột, rồi tới các phase `p1` → `p30`. Thứ tự này đã được hard-code sẵn trong script `db:migrate`:

```bash
npm run db:migrate
```

Script này gọi `psql` với `DATABASE_URL`, nên cần `psql` trong PATH (Git Bash / WSL / macOS / Linux đều ổn).

### 5.2. Reset database

```bash
docker compose down -v      # xoá volume postgres + redis
docker compose up -d
npm run db:migrate
```

### 5.3. Windows / PowerShell

Script `db:migrate` dùng cú pháp `$DATABASE_URL` kiểu bash nên không chạy được trong `cmd.exe`. Dùng đoạn PowerShell sau — nó đọc đúng thứ tự file từ `package.json` nên không sai:

```powershell
cd server
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5432/lupus"

$script = (Get-Content package.json -Raw | ConvertFrom-Json).scripts.'db:migrate'
$files = ($script -split ' -f ')[1..45] | ForEach-Object { $_.Trim() } | Where-Object { $_ }

foreach ($f in $files) {
  Write-Host "applying $f"
  psql $env:DATABASE_URL -f $f
  if ($LASTEXITCODE -ne 0) { throw "migration failed: $f" }
}
```

Nếu chưa cài `psql`, dùng bản Node (không cần cài thêm gì, `pg` đã là dependency):

```powershell
cd server
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5432/lupus"

node -e "const fs=require('fs'),{Pool}=require('pg'),pkg=require('./package.json');const files=pkg.scripts['db:migrate'].split(' -f ').slice(1);const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{for(const f of files){await p.query(fs.readFileSync(f,'utf8'));console.log('applied',f)}await p.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
```

---

## 6. Seed data

Script seed nằm ở `server/src/db/seed-books.ts`. Nó gọi **HTTP vào backend đang chạy** (để lấy JWT admin rồi đẩy dữ liệu qua Admin API), nên phải bật backend trước.

```bash
# terminal 1 — backend phải chạy
npm run dev --workspace @dtc/lupus-backend

# terminal 2
npm run db:seed --workspace @dtc/lupus-backend
```

Kết quả:

```
Seeding books catalogue via http://localhost:9001
  admin token ok (seed@lupus.local)
  sales channel …, stock location …
  regions … (usd) / … (vnd)
  … categories, … collections, … tags, type 'book'
Done: … products created, … skipped.
```

Seed tạo sẵn:

- **Tài khoản admin** `seed@lupus.local` / `lupus-seed-pass-1` kèm role `admin`
- **Currency** `usd`, `vnd`
- **Sales channel** `Web Store` + **stock location** `Kho chính`
- **Regions**: United States (`usd`, quốc gia `us`) và Vietnam (`vnd`, quốc gia `vn`)
- **Store** `Lupus Books`
- **Cây category** sách: Văn học → (Tiêu thuyết kinh điển, Khoa học viễn tưởng, Giả tưởng, Phiêu lưu - Trinh thám), Khoa học & Xã hội → (Lịch sử - Triết học, Khoa học, Lập trình), Thiếu nhi
- **Collections**: Bán chạy nhất, Mới phát hành, Chọn lọc của cửa hàng
- **Product type** `book` + tag + danh mục
- **Catalogue sách** với nhiều variant theo format (Bìa cứng / Bìa mềm / Sách điện tử), giá bằng USD và VND, kèm tồn kho

Các biến tuỳ chỉnh:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `SEED_ADMIN_EMAIL` | `seed@lupus.local` | Email tài khoản admin được tạo |
| `SEED_ADMIN_PASSWORD` | `lupus-seed-pass-1` | Mật khẩu admin |
| `LUPUS_API_URL` | `http://localhost:$PORT` | Backend cần seed |

Đặt trong `server/.env` trước khi chạy lại.

### Reset và seed lại

Script mặc định idempotent — chạy lại sẽ bỏ qua dữ liệu đã có (`0 products created, 12 skipped`).

`db:seed:reset` dùng cờ `--reset`: **xoá từng sản phẩm sách đã seed rồi tạo lại** (xóa theo `handle`, cascading sang variant/inventory). Nó *không* xoá bảng, không xoá category/region/store, và không đụng tới dữ liệu bạn tự tạo.

```bash
# backend đang chạy
npm run db:seed:reset --workspace @dtc/lupus-backend
```

Muốn reset **toàn bộ** database thì dùng cách ở [mục 5.2](#52-reset-database): xoá volume rồi migrate + seed lại từ đầu.

---

## 7. Chạy ứng dụng

### 7.1. Chạy cả 3 cùng lúc

```bash
npm run dev
```

Turbo sẽ chạy song song:

| URL | App |
|---|---|
| <http://localhost:5099/app/> | Dashboard admin |
| <http://localhost:8000> | Storefront |
| <http://localhost:9001> | Backend API |

### 7.2. Chạy riêng từng app

```bash
npm run dev --workspace @dtc/lupus-backend    # :9001
npm run dev --workspace @dtc/admin            # :5099, base /app/
npm run dev --workspace @dtc/lupus-storefront # :8000
```

Cả hai frontend đều có dev proxy trỏ về `:9001`, nên không cần cấu hình CORS khi dev. Nếu trỏ sang backend khác:

```bash
# storefront
VITE_API_PROXY=http://localhost:9002 npm run dev --workspace @dtc/lupus-storefront
```

### 7.3. Build production

```bash
npm run build
```

- `server` → `server/dist` (biên dịch TypeScript)
- `client` → `client/dist` — backend tự dò thấy và serve tại `/app`
- `storefront` → `storefront/dist` (kèm `tsc --noEmit`)

Sau khi build, chỉ cần chạy backend là đủ dùng dashboard:

```bash
npm run start --workspace @dtc/lupus-backend   # http://localhost:9001/app/
```

> Lưu ý: `client` **không** có script `typecheck`, và `build` của nó là `vite build` trần — không kiểm tra type. Chạy `npx tsc --noEmit` trong `client/` nếu cần chắc chắn code compile.

---

## 8. Các lệnh npm thường dùng

Chạy từ root:

| Lệnh | Việc |
|---|---|
| `npm install` | Cài dependency cho cả workspace |
| `npm run dev` | Chạy cả 3 app ở chế độ dev |
| `npm run build` | Build cả 3 workspace |
| `npm run db:migrate` | Áp dụng 45 file schema theo đúng thứ tự |
| `npm run db:seed --workspace @dtc/lupus-backend` | Nạp dữ liệu mẫu (cần backend đang chạy) |
| `npx turbo dev --filter @dtc/lupus-backend` | Chạy một workspace |

Trong `server`:

| Lệnh | Việc |
|---|---|
| `npm run dev` | `ts-node --transpile-only src/index.ts` — không có watch, phải restart khi sửa backend |
| `npm run build` | `tsc -p tsconfig.json` |
| `npm run db:migrate` | Giống lệnh ở root |
| `npm run db:seed` | Nạp dữ liệu mẫu (bỏ qua dữ liệu đã có) |
| `npm run db:seed:reset` | Xoá rồi tạo lại các sản phẩm đã seed |
| `npm run test:all` | Chạy toàn bộ 25 file test parity (cần DB riêng, xem mục 9) |

---

## 9. Chạy test

Test cần PostgreSQL. **Không chạy test lên database đang dùng cho dev** — các test tự tạo dữ liệu và sẽ làm bẩn dữ liệu mẫu.

```bash
# 1. Tạo database test (một lần)
docker compose exec postgres createdb -U postgres lupus_test

# 2. Chạy test
cd server
DATABASE_URL=postgres://postgres:postgres@localhost:5432/lupus_test JWT_SECRET=test npm run db:migrate
DATABASE_URL=postgres://postgres:postgres@localhost:5432/lupus_test JWT_SECRET=test npm run test:all
```

PowerShell:

```powershell
cd server
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5432/lupus_test"
$env:JWT_SECRET  = "test"
npm run db:migrate
npm run test:all
```

Chạy từng nhóm test:

```bash
npm run test:unit              # list query operator
npm run test:integration       # full flow checkout
npm run test:storefront        # contract Store API + data-testid
npm run test:dashboard         # endpoint dashboard summary
npm run test:all               # tất cả
```

---

## 10. Xử lý sự cố

**`DATABASE_URL is not set`**
Chưa tạo `server/.env`. Chạy `cp server/.env.template server/.env`.

**`Seed failed: Backend chưa chạy tại http://localhost:9001`**
Script seed cần backend sống. Mở terminal khác, chạy `npm run dev --workspace @dtc/lupus-backend` rồi seed lại.

**Trang admin báo lỗi CORS**
`ADMIN_CORS` trong `server/.env` đang là `http://localhost:9000`, còn dashboard dev chạy ở `5099`. Sửa thành `http://localhost:5099`.

**Storefront trang trắng / báo không có region**
`VITE_DEFAULT_REGION` mặc định là `dk` nhưng seed chỉ tạo `us` và `vn`. Đổi `storefront/.env` thành `us` hoặc `vn` rồi khởi động lại dev server.

**Dashboard trả về `/console` thay vì `/app`**
Chưa có bản build. Chạy `npm run build --workspace @dtc/admin`, hoặc dùng dev server ở <http://localhost:5099/app/>.

**Lỗi `ECONNREFUSED 127.0.0.1:5432`**
Postgres chưa chạy: `docker compose up -d` rồi `docker compose ps` để kiểm tra.

**Port đã bị chiếm**
Đổi `PORT` trong `server/.env`. Nhớ sửa cả proxy của frontend qua `VITE_API_PROXY`, và cập nhật `STORE_CORS` / `ADMIN_CORS`.

**`npm run db:migrate` không chạy trên Windows**
Xem [mục 5.3](#53-windows--powershell).

---

## 11. Tài liệu chi tiết

| File | Nội dung |
|---|---|
| `server/README.md` | Bảng mapping từng module Lupus/Medusa sang implementation trong `server`, và endpoint hiện có |
| `client/AGENTS.md` | Quy ước của dashboard admin, resource registry, cách thêm resource mới |
| `storefront/AGENTS.md` | Quy ước của storefront, store pattern, region/currency flow |
| `audit/README.md` | Script đối chiếu route với upstream Medusa (read-only, cần `LUPUS_UPSTREAM_ROOT`) |
| `AGENTS.md` | Hướng dẫn cho AI agent khi làm việc trong repo |

## 12. License

Private — không cấp phép sử dụng lại.