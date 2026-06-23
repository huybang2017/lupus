import "dotenv/config"
import { pool } from "../db"

const API = (process.env.LUPUS_API_URL ?? `http://localhost:${process.env.PORT ?? 9001}`).replace(/\/+$/, "")
const SEED_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "seed@lupus.local"
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "lupus-seed-pass-1"
const RESET = process.argv.includes("--reset")

const CHANNEL_NAME = "Web Store"
const LOCATION_NAME = "Kho chính"
const STORE_NAME = "Lupus Books"
const PRODUCT_TYPE = "book"

type CategoryNode = { name: string; handle: string; children?: CategoryNode[] }

const CATEGORY_TREE: CategoryNode = {
  name: "Sách",
  handle: "books",
  children: [
    {
      name: "Văn học",
      handle: "fiction",
      children: [
        { name: "Tiêu thuyết kinh điển", handle: "fiction-classic" },
        { name: "Khoa học viễn tưởng", handle: "science-fiction" },
        { name: "Giả tưởng", handle: "fantasy" },
      ],
    },
    {
      name: "Phiêu lưu - Trinh thám",
      handle: "mystery",
    },
    {
      name: "Khoa học & Xã hội",
      handle: "non-fiction",
      children: [
        { name: "Lịch sử - Triết học", handle: "history-philosophy" },
        { name: "Khoa học", handle: "science" },
        { name: "Lập trình", handle: "programming" },
      ],
    },
    {
      name: "Thiếu nhi",
      handle: "children",
    },
  ],
}

const COLLECTIONS = [
  { title: "Bán chạy nhất", handle: "best-sellers" },
  { title: "Mới phát hành", handle: "new-arrivals" },
  { title: "Chọn lọc của cửa hàng", handle: "staff-picks" },
]

const FORMAT = "Định dạng"
const HARDCOVER = "Bìa cứng"
const PAPERBACK = "Bìa mềm"
const EBOOK = "Sách điện tử"

type BookVariant = {
  format: string
  sku: string
  usd: number
  vnd: number
  weight?: number
  stock: number
}

type Book = {
  handle: string
  title: string
  subtitle?: string
  author: string
  publisher: string
  year: number
  pages: number
  isbn: string
  category: string
  collection?: string
  tags: string[]
  languages?: string[]
  variants: BookVariant[]
  description: string[]
}

const BOOKS: Book[] = [
  {
    handle: "dune",
    title: "Dune",
    subtitle: "Cuộc chiến giành lấy sa mạc và nguyên liệu gia vị hiếm",
    author: "Frank Herbert",
    publisher: "Ace Books",
    year: 1965,
    pages: 688,
    isbn: "9780441013593",
    category: "science-fiction",
    collection: "best-sellers",
    tags: ["bestseller", "classic"],
    description: [
      "Tập đầu tiên của bộ Dune của Frank Herbert. Câu chuyện diễn ra trên hành tinh sa mạc Arrakis, nơi duy nhất trong vũ trụ còn tồn tại loại gia vị quý hiếm gọi là melange.",
      "Từ một cậu bé tên Paul Atreides, người sau này trở thành Đấu sĩ, chiến tranh thay đổi vĩ màn và một thế giới được xây dựng trên bối cảnh tôn giáo, chính trị và sinh thái.",
    ],
    variants: [
      { format: HARDCOVER, sku: "LUP-DUNE-HC", usd: 18.99, vnd: 389000, weight: 0.9, stock: 42 },
      { format: PAPERBACK, sku: "LUP-DUNE-PB", usd: 12.99, vnd: 249000, weight: 0.5, stock: 120 },
      { format: EBOOK, sku: "LUP-DUNE-EP", usd: 7.99, vnd: 149000, stock: 999 },
    ],
  },
  {
    handle: "neuromancer",
    title: "Neuromancer",
    subtitle: "Bản in đầu tiên có bìa cứng",
    author: "William Gibson",
    publisher: "Ace Books",
    year: 1984,
    pages: 271,
    isbn: "9780441569595",
    category: "science-fiction",
    tags: ["classic"],
    description: [
      "Case là một tay hack bị đuổi việc, sống trong những vỏ sò sợi và cáp xương sống chằng chịt. Bạn tình của anh, Molly, là một nữ cướp tiền tích trữ trí nhớ thường xuyên bị xóa.",
      "Khi một việc làm bất khả thi dây lên sợi dây, Case phải quay về với đường cáp ngầm và con hacker cổ điển Wintermute. Tác phẩm được trao giải Nebula, Hugo và Philip K. Dick.",
    ],
    variants: [
      { format: PAPERBACK, sku: "LUP-NEURO-PB", usd: 11.99, vnd: 229000, weight: 0.4, stock: 64 },
      { format: EBOOK, sku: "LUP-NEURO-EP", usd: 6.99, vnd: 129000, stock: 999 },
    ],
  },
  {
    handle: "1984",
    title: "1984",
    subtitle: "Một tiểu thuyết giả tưởng kinh điển",
    author: "George Orwell",
    publisher: "Signet Classics",
    year: 1949,
    pages: 328,
    isbn: "9780451524935",
    category: "fiction-classic",
    collection: "best-sellers",
    tags: ["classic", "bestseller"],
    description: [
      "Winston Smith làm việc ở Bộ Tư liệu, nơi lịch sử liên tục được sửa lại và ký ức của dân chúng bị thay thế bằng phim Dòng Lệ.",
      "Câu chuyện theo chân nhân vật khi bắt đầu nghi ngờ, rồi khởi kiện một mối tình cấm với Julia. Bản in này trinh trày nguyên văn tiếng Anh của Orwell.",
    ],
    variants: [
      { format: HARDCOVER, sku: "LUP-1984-HC", usd: 16.5, vnd: 320000, weight: 0.7, stock: 30 },
      { format: PAPERBACK, sku: "LUP-1984-PB", usd: 9.99, vnd: 179000, weight: 0.35, stock: 150 },
      { format: EBOOK, sku: "LUP-1984-EP", usd: 5.49, vnd: 99000, stock: 999 },
    ],
  },
  {
    handle: "the-great-gatsby",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    publisher: "Scribner",
    year: 1925,
    pages: 180,
    isbn: "9780743273565",
    category: "fiction-classic",
    tags: ["classic"],
    description: [
      "Nick Caraway đến West Egg vào một mùa hè, nơi anh tìm hiểu về cuộc sống của Gatsby, người đàn ông bí ẩn khoe một biệt thự và tham vọng tràn đầy với Daisy Buchanan.",
      "Một tác phẩm ngắn nhưng sắc bén về giấc mơ Mỹ, của vẻ đẹp và tiền bạc, và khoảng cách không bao giờ đóng được giữa hai bờ.",
    ],
    variants: [
      { format: PAPERBACK, sku: "LUP-GATSBY-PB", usd: 10.99, vnd: 209000, weight: 0.3, stock: 88 },
      { format: EBOOK, sku: "LUP-GATSBY-EP", usd: 4.99, vnd: 89000, stock: 999 },
    ],
  },
  {
    handle: "the-name-of-the-wind",
    title: "The Name of the Wind",
    subtitle: "Câu chuyện đầu tiên của Trưởng lão Kestrel",
    author: "Patrick Rothfuss",
    publisher: "DAW Books",
    year: 2007,
    pages: 662,
    isbn: "9780756404741",
    category: "fantasy",
    collection: "best-sellers",
    tags: ["bestseller"],
    description: [
      "Kvothe kể lại cuộc đời mình từ một quán trọ bụi bẩn: một cậu bé trốn trốn trên lưng xe chở than, bị bắt và trở thành bậc thầy bói, rồi lên đường tới Trường Đào tạo.",
      "Đây là tập đầu tiên của bộ Đại Sử Thợ Rèn với hệ thống phép thuật dựa trên thanh âm và trí nhớ.",
    ],
    variants: [
      { format: HARDCOVER, sku: "LUP-NWOT-HC", usd: 22.99, vnd: 449000, weight: 1.1, stock: 26 },
      { format: PAPERBACK, sku: "LUP-NWOT-PB", usd: 14.99, vnd: 279000, weight: 0.6, stock: 74 },
      { format: EBOOK, sku: "LUP-NWOT-EP", usd: 8.99, vnd: 169000, stock: 999 },
    ],
  },
  {
    handle: "the-road",
    title: "The Road",
    author: "Cormac McCarthy",
    publisher: "Vintage",
    year: 2006,
    pages: 287,
    isbn: "9780307277671",
    category: "fiction-classic",
    tags: ["classic", "new"],
    languages: ["Tiếng Anh"],
    description: [
      "Một người đàn ông và đứa con trai đi bộ về phía nam trên một con đường bê tông, giữa một thế giới đã tàn rũ. Chỉ còn hai thứ: một chiếc xe đẩy đầy đồ hộp và lời hứa không được bỏ đứa trẻ.",
      "Văn phong tối giản đến đau đớn, tác phẩm đoạt giải Pulitzer cho Tiểu thuyết.",
    ],
    variants: [
      { format: PAPERBACK, sku: "LUP-ROAD-PB", usd: 13.99, vnd: 259000, weight: 0.4, stock: 55 },
      { format: EBOOK, sku: "LUP-ROAD-EP", usd: 6.99, vnd: 129000, stock: 999 },
    ],
  },
  {
    handle: "sapiens",
    title: "Sapiens: A Brief History of Humankind",
    subtitle: "Lược sử ngắn về loài người",
    author: "Yuval Noah Harari",
    publisher: "Harper",
    year: 2015,
    pages: 464,
    isbn: "9780062316097",
    category: "history-philosophy",
    collection: "best-sellers",
    tags: ["bestseller"],
    description: [
      "70.000 năm lịch sử loài người kể lại qua ba cuộc cách mạng: cách mạng nhận thức, cách mạng nông nghiệp và cách mạng khoa học.",
      "Harari khảo sát từ thứ bậc trong thế giới loài người từ động vật cho đến cách thức tổ chức tiền tệ, quốc gia và tôn giáo hiện đại.",
    ],
    variants: [
      { format: HARDCOVER, sku: "LUP-SAPIENS-HC", usd: 20.99, vnd: 399000, weight: 0.8, stock: 34 },
      { format: PAPERBACK, sku: "LUP-SAPIENS-PB", usd: 13.99, vnd: 259000, weight: 0.45, stock: 96 },
      { format: EBOOK, sku: "LUP-SAPIENS-EP", usd: 8.99, vnd: 169000, stock: 999 },
    ],
  },
  {
    handle: "the-selfish-gene",
    title: "The Selfish Gene",
    author: "Richard Dawkins",
    publisher: "Oxford University Press",
    year: 1976,
    pages: 360,
    isbn: "9780060935467",
    category: "science",
    tags: ["classic"],
    languages: ["Tiếng Anh", "Tiếng Việt"],
    description: [
      "Giá trị thiên về đánh giá từ góc nhìn của gene thay vì cá thể, đặt câu hỏi cơ bản: điều gì thật sự là đơn vị chọn lọc tiến hóa?",
      "Tác phẩm đặt nền móng cho thuyết tiến hóa bằng chọn lọc và là một trong những cuốn sách phi khoa học bán chạy nhất thế kỷ XX.",
    ],
    variants: [
      { format: PAPERBACK, sku: "LUP-GENE-PB", usd: 15.99, vnd: 299000, weight: 0.5, stock: 48 },
      { format: EBOOK, sku: "LUP-GENE-EP", usd: 9.99, vnd: 179000, stock: 999 },
    ],
  },
  {
    handle: "clean-code",
    title: "Clean Code",
    subtitle: "Nguyên tắc, kỹ thuật và công cụ cho người lập trình",
    author: "Robert C. Martin",
    publisher: "Prentice Hall",
    year: 2008,
    pages: 464,
    isbn: "9780132350884",
    category: "programming",
    collection: "best-sellers",
    tags: ["bestseller"],
    description: [
      "Cuốn sách về việc viết mã dễ đọc, dễ bảo trì: đặt tên, hàm, lớp, xử lý lỗi, chú thích, luồng điều khiển và ranh giới vật lý.",
      "Tác giả xử lý trực tiếp các vấn đề như code smell, kỹ thuật chuẩn hóa, luật ba (Law of Demeter) và cách viết test mà không phụ thuộc thứ tự.",
    ],
    variants: [
      { format: HARDCOVER, sku: "LUP-CLEAN-HC", usd: 32.99, vnd: 629000, weight: 1.2, stock: 28 },
      { format: PAPERBACK, sku: "LUP-CLEAN-PB", usd: 24.99, vnd: 459000, weight: 0.7, stock: 62 },
      { format: EBOOK, sku: "LUP-CLEAN-EP", usd: 17.99, vnd: 329000, stock: 999 },
    ],
  },
  {
    handle: "design-patterns",
    title: "Design Patterns",
    subtitle: "Các mẫu thiết kế mềm dùng lại trong hệ đối tượng",
    author: "Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides",
    publisher: "Addison-Wesley",
    year: 1994,
    pages: 395,
    isbn: "9780201633610",
    category: "programming",
    tags: ["classic"],
    description: [
      "Cụm sách Gang of Four là tài liệu gốc về mẫu thiết kế: mô tả 23 mẫu kinh điển như Singleton, Factory Method, Adapter, Observer và Command.",
      "Mỗi mẫu được trình bày theo cùng một cấu trúc: vấn đề, khi nào dùng, khi nào không nên dùng, và cách hiện thực bằng ngôn ngữ lập trình.",
    ],
    variants: [
      { format: HARDCOVER, sku: "LUP-DP-HC", usd: 39.99, vnd: 769000, weight: 1.4, stock: 18 },
      { format: PAPERBACK, sku: "LUP-DP-PB", usd: 29.99, vnd: 559000, weight: 0.8, stock: 40 },
      { format: EBOOK, sku: "LUP-DP-EP", usd: 24.99, vnd: 469000, stock: 999 },
    ],
  },
  {
    handle: "harry-potter-va-phu-su-qui-dien",
    title: "Harry Potter and the Philosopher's Stone",
    author: "J.K. Rowling",
    publisher: "Bloomsbury",
    year: 1997,
    pages: 223,
    isbn: "9780747532699",
    category: "children",
    collection: "staff-picks",
    tags: ["classic", "new"],
    languages: ["Tiếng Anh", "Tiếng Việt"],
    description: [
      "Harry Potter phát hiện mình là phù thủy vào ngày mười một tuổi, khi những lá thư bắt đầu đến và một tên gọi bí ẩn kéo cậu từ căn nhà dưới gầm cầu thang.",
      "Tập đầu tiên trong bảy tập đưa Harry vào Hogwarts, trường học phù thủy nơi học phép thuật, chơi Quidditch và đối mặt với Chúa tử Rắn.",
    ],
    variants: [
      { format: PAPERBACK, sku: "LUP-HP1-PB", usd: 12.99, vnd: 249000, weight: 0.4, stock: 80 },
      { format: EBOOK, sku: "LUP-HP1-EP", usd: 6.99, vnd: 129000, stock: 999 },
    ],
  },
  {
    handle: "the-little-prince",
    title: "The Little Prince",
    author: "Antoine de Saint-Exupery",
    publisher: "Reynal & Hitchcock",
    year: 1943,
    pages: 96,
    isbn: "9780156012195",
    category: "children",
    collection: "staff-picks",
    tags: ["classic"],
    languages: ["Tiếng Pháp", "Tiếng Anh", "Tiếng Việt"],
    description: [
      "Một phi hành gia gặp một cậu bé nhỏ trên sa mạc, cậu bé đến từ hành tinh B-612 và kể về việc yêu một con cá, một chiếc hộp và một con rồng.",
      "Bản minh họa gốc của tác giả là một trong những cuốn sách được yêu thích nhất thế kỷ XX, phù hợp cho cả người lớn lẫn trẻ em.",
    ],
    variants: [
      { format: HARDCOVER, sku: "LUP-TLP-HC", usd: 14.99, vnd: 289000, weight: 0.4, stock: 44 },
      { format: PAPERBACK, sku: "LUP-TLP-PB", usd: 8.99, vnd: 169000, weight: 0.2, stock: 120 },
      { format: EBOOK, sku: "LUP-TLP-EP", usd: 4.99, vnd: 89000, stock: 999 },
    ],
  },
]

let token = ""

type ApiResult = { status: number; json: any; text: string }

async function api(method: string, path: string, body?: unknown): Promise<ApiResult> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, json, text }
}

async function expect(method: string, path: string, body: unknown, status: number[]): Promise<any> {
  const res = await api(method, path, body)
  if (!status.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status} (expected ${status.join("|")}): ${res.text.slice(0, 400)}`)
  }
  return res.json
}

async function one<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  const { rows } = await pool.query(sql, params)
  return (rows[0] ?? null) as T | null
}

async function many<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query(sql, params)
  return rows as T[]
}

async function authenticate(): Promise<void> {
  const credentials = { email: SEED_EMAIL, password: SEED_PASSWORD }
  let res = await api("POST", "/auth/user/emailpass/register", credentials)
  if (res.status !== 200 || typeof res.json?.token !== "string") {
    res = await api("POST", "/auth/user/emailpass", credentials)
  }
  if (res.status !== 200 || typeof res.json?.token !== "string") {
    throw new Error(`Could not authenticate as ${SEED_EMAIL} (${res.status}): ${res.text.slice(0, 300)}`)
  }
  token = res.json.token
  const role = await one<{ id: string }>(
    `INSERT INTO rbac_role (name) VALUES ('admin') ON CONFLICT (name) DO UPDATE SET name='admin' RETURNING id`
  )
  const user = await one<{ id: string }>(`SELECT id FROM admin_user WHERE email=$1`, [SEED_EMAIL])
  if (user && role) {
    await pool.query(`INSERT INTO admin_user_role (admin_user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
      user.id,
      role.id,
    ])
  }
}

async function ensureCurrencies(): Promise<void> {
  const wanted = [
    { code: "usd", symbol: "$", symbol_native: "$", name: "US Dollar", decimal_digits: 2 },
    { code: "vnd", symbol: "₫", symbol_native: "đ", name: "Vietnamese Dong", decimal_digits: 0 },
  ]
  for (const c of wanted) {
    await pool.query(
      `INSERT INTO currency (code, symbol, symbol_native, name, decimal_digits) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (code) DO UPDATE SET symbol=$2, symbol_native=$3, name=$4, decimal_digits=$5`,
      [c.code, c.symbol, c.symbol_native, c.name, c.decimal_digits]
    )
  }
}

async function ensureSalesChannel(): Promise<string> {
  const existing = await one<{ id: string }>(
    `SELECT id FROM sales_channel WHERE name=$1 AND deleted_at IS NULL`,
    [CHANNEL_NAME]
  )
  if (existing) return existing.id
  const body = await expect(
    "POST",
    "/admin/sales-channels",
    { name: CHANNEL_NAME, description: "Kênh bán hàng trực tuyến (web storefront)" },
    [201]
  )
  return body.sales_channel.id
}

async function ensureStockLocation(): Promise<string> {
  const existing = await one<{ id: string }>(
    `SELECT id FROM stock_location WHERE name=$1 AND deleted_at IS NULL`,
    [LOCATION_NAME]
  )
  if (existing) return existing.id
  const body = await expect(
    "POST",
    "/admin/stock-locations",
    {
      name: LOCATION_NAME,
      address: {
        address_1: "12 Nguyễn Huệ",
        city: "Hồ Chí Minh",
        country_code: "vn",
        postal_code: "700000",
        company: STORE_NAME,
      },
    },
    [201]
  )
  return body.stock_location.id
}

async function ensureRegion(name: string, currency: string, countries: string[]): Promise<string> {
  const existing = await one<{ id: string }>(`SELECT id FROM region WHERE name=$1 AND deleted_at IS NULL`, [name])
  let regionId = existing?.id
  if (!regionId) {
    const body = await expect("POST", "/admin/regions", { name, currency_code: currency, countries: [] }, [201])
    regionId = body.region.id as string
  }
  if (!regionId) throw new Error(`Could not resolve region: ${name}`)
  for (const iso of countries) {
    await pool.query(
      `INSERT INTO region_country (region_id, iso_2) VALUES ($1,$2)
       ON CONFLICT (region_id, iso_2) WHERE deleted_at IS NULL DO NOTHING`,
      [regionId, iso]
    )
  }
  await pool.query(
    `INSERT INTO region_payment_provider (region_id, provider_id) VALUES ($1,'manual') ON CONFLICT DO NOTHING`,
    [regionId]
  )
  return regionId
}

async function ensureStore(channelId: string, regionId: string, locationId: string): Promise<string> {
  const existing = await one<{ id: string }>(`SELECT id FROM store WHERE name=$1`, [STORE_NAME])
  let id = existing?.id
  if (!id) {
    const created = await one<{ id: string }>(
      `INSERT INTO store (name, default_sales_channel_id, default_region_id, default_location_id) VALUES ($1,$2,$3,$4) RETURNING id`,
      [STORE_NAME, channelId, regionId, locationId]
    )
    id = created!.id
  }
  for (const [code, isDefault] of [["usd", false], ["vnd", true]] as const) {
    await pool.query(
      `UPDATE store_currency SET is_default=FALSE WHERE store_id=$1 AND currency_code<>$2`,
      [id, code]
    )
    await pool.query(
      `INSERT INTO store_currency (store_id, currency_code, is_default) VALUES ($1,$2,$3)
       ON CONFLICT (store_id, currency_code) DO UPDATE SET is_default=$3`,
      [id, code, isDefault]
    )
  }
  for (const locale of ["vi", "en-US"]) {
    await pool.query(
      `INSERT INTO store_locale (store_id, locale_code) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [id, locale]
    )
  }
  const pref = await one<{ id: string }>(
    `SELECT id FROM price_preference WHERE attribute='currency_code' AND value='vnd' AND deleted_at IS NULL LIMIT 1`
  )
  if (!pref) {
    await pool.query(
      `INSERT INTO price_preference (attribute, value, is_tax_inclusive) VALUES ('currency_code','vnd',TRUE)`
    )
  }
  return id
}

async function ensureCategoryTree(): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  const walk = async (node: CategoryNode, parentId: string | null, rank: number): Promise<void> => {
    const row = await one<{ id: string }>(
      `INSERT INTO product_category (name, handle, parent_category_id, rank, is_active, is_internal)
       VALUES ($1,$2,$3,$4,TRUE,FALSE)
       ON CONFLICT (handle) DO UPDATE
         SET name=EXCLUDED.name,
             parent_category_id=EXCLUDED.parent_category_id,
             rank=EXCLUDED.rank,
             is_active=TRUE,
             is_internal=FALSE,
             deleted_at=NULL
       RETURNING id`,
      [node.name, node.handle, parentId, rank]
    )
    ids.set(node.handle, row!.id)
    let childRank = 0
    for (const child of node.children ?? []) {
      await walk(child, row!.id, childRank++)
    }
  }
  await walk(CATEGORY_TREE, null, 0)
  return ids
}

async function ensureCollections(): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const c of COLLECTIONS) {
    const row = await one<{ id: string }>(
      `INSERT INTO product_collection (title, handle) VALUES ($1,$2)
       ON CONFLICT (handle) DO UPDATE SET title=EXCLUDED.title, deleted_at=NULL
       RETURNING id`,
      [c.title, c.handle]
    )
    ids.set(c.handle, row!.id)
  }
  return ids
}

async function ensureTaxonomy(): Promise<{ typeId: string; tags: Map<string, string> }> {
  const type = await one<{ id: string }>(
    `INSERT INTO product_type (value) VALUES ($1)
     ON CONFLICT (value) WHERE deleted_at IS NULL DO UPDATE SET value=$1
     RETURNING id`,
    [PRODUCT_TYPE]
  )
  const tags = new Map<string, string>()
  for (const value of new Set(BOOKS.flatMap((b) => b.tags))) {
    const row = await one<{ id: string }>(
      `INSERT INTO product_tag (value) VALUES ($1)
       ON CONFLICT (value) WHERE deleted_at IS NULL DO UPDATE SET value=$1
       RETURNING id`,
      [value]
    )
    tags.set(value, row!.id)
  }
  return { typeId: type!.id, tags }
}

async function resetProduct(handle: string): Promise<void> {
  const product = await one<{ id: string }>(`SELECT id FROM product WHERE handle=$1`, [handle])
  if (!product) return
  const itemIds = await many<{ inventory_item_id: string }>(
    `SELECT vii.inventory_item_id FROM variant_inventory_item vii
     JOIN product_variant v ON v.id = vii.variant_id WHERE v.product_id=$1`,
    [product.id]
  )
  await pool.query(`DELETE FROM product WHERE id=$1`, [product.id])
  for (const item of itemIds) {
    await pool.query(`DELETE FROM inventory_item WHERE id=$1`, [item.inventory_item_id])
  }
}

async function stockVariant(variantId: string, locationId: string, quantity: number): Promise<void> {
  await pool.query(
    `INSERT INTO inventory_level_location (inventory_item_id, location_id, stocked_quantity)
     SELECT vii.inventory_item_id, $2, $3 FROM variant_inventory_item vii WHERE vii.variant_id=$1
     ON CONFLICT (inventory_item_id, location_id) DO UPDATE SET stocked_quantity=EXCLUDED.stocked_quantity, updated_at=NOW()`,
    [variantId, locationId, quantity]
  )
}

function buildProductPayload(
  book: Book,
  categoryId: string,
  typeId: string,
  collectionId: string | undefined,
  tagIds: string[],
  channelId: string
): Record<string, unknown> {
  const cover = `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`
  const variants = book.variants.map((v, index) => {
    const options: Record<string, string> = { [FORMAT]: v.format }
    if (book.languages) options["Ngôn ngữ"] = book.languages[Math.min(index, book.languages.length - 1)]
    return {
      title: book.languages ? `${v.format} / ${options["Ngôn ngữ"]}` : v.format,
      sku: v.sku,
      barcode: book.isbn,
      ean: book.isbn,
      variant_rank: index,
      manage_inventory: true,
      allow_backorder: false,
      weight: v.weight ?? 0.4,
      origin_country: "vn",
      material: "paper",
      prices: [
        { currency_code: "usd", amount: Math.round(v.usd * 100) },
        { currency_code: "vnd", amount: Math.round(v.vnd) },
      ],
      options,
    }
  })
  return {
    title: book.title,
    handle: book.handle,
    subtitle: book.subtitle ?? null,
    description: book.description.map((p) => `<p>${p}</p>`).join("\n"),
    status: "published",
    weight: variants[0].weight,
    origin_country: "vn",
    material: "paper",
    metadata: {
      author: book.author,
      publisher: book.publisher,
      publication_year: book.year,
      pages: book.pages,
      isbn: book.isbn,
      languages: book.languages ?? ["Tiếng Anh"],
    },
    thumbnail: cover,
    images: [{ url: cover }, { url: `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg` }],
    type_id: typeId,
    collection_id: collectionId ?? null,
    categories: [{ id: categoryId }],
    tags: tagIds.map((id) => ({ id })),
    sales_channels: [{ id: channelId }],
    options: [
      { title: FORMAT, values: [...new Set(book.variants.map((v) => v.format))] },
      ...(book.languages ? [{ title: "Ngôn ngữ", values: book.languages }] : []),
    ],
    variants,
  }
}

async function seedProducts(
  categoryIds: Map<string, string>,
  collectionIds: Map<string, string>,
  tagIds: Map<string, string>,
  typeId: string,
  channelId: string,
  locationId: string
): Promise<{ created: number; skipped: number }> {
  let created = 0
  let skipped = 0
  for (const book of BOOKS) {
    const categoryId = categoryIds.get(book.category)
    if (!categoryId) throw new Error(`Unknown category handle: ${book.category}`)
    if (RESET) await resetProduct(book.handle)
    const existing = await one<{ id: string }>(
      `SELECT id FROM product WHERE handle=$1 AND deleted_at IS NULL`,
      [book.handle]
    )
    if (existing) {
      skipped += 1
      console.log(`  skip   ${book.handle} (đã tồn tại)`)
      continue
    }
    const payload = buildProductPayload(
      book,
      categoryId,
      typeId,
      book.collection ? collectionIds.get(book.collection) : undefined,
      book.tags.map((t) => tagIds.get(t)!).filter(Boolean),
      channelId
    )
    const body = await expect("POST", "/admin/products", payload, [201])
    const product = body.product
    const createdVariants = Array.isArray(product.variants) ? product.variants : []
    for (const [index, variant] of book.variants.entries()) {
      const createdVariant =
        createdVariants.find((v: any) => v?.sku === variant.sku) ?? createdVariants[index]
      if (!createdVariant?.id) throw new Error(`Variant ${variant.sku} missing from response`)
      await stockVariant(createdVariant.id, locationId, variant.stock)
    }
    created += 1
    console.log(`  create ${book.handle} (${createdVariants.length} variants, ${product.id})`)
  }
  return { created, skipped }
}

async function main(): Promise<void> {
  const health = await api("GET", "/health")
  if (health.status !== 200) {
    throw new Error(`Backend chưa chạy tại ${API}. Hãy chạy \`npm run dev\` trước.`)
  }
  console.log(`Seeding books catalogue via ${API}${RESET ? " (--reset)" : ""}`)

  await ensureCurrencies()
  await authenticate()
  console.log(`  admin token ok (${SEED_EMAIL})`)

  const channelId = await ensureSalesChannel()
  const locationId = await ensureStockLocation()
  const regionUs = await ensureRegion("United States", "usd", ["us"])
  const regionVn = await ensureRegion("Vietnam", "vnd", ["vn"])
  await ensureStore(channelId, regionVn, locationId)
  console.log(`  sales channel ${channelId}, stock location ${locationId}`)
  console.log(`  regions ${regionUs} (usd) / ${regionVn} (vnd)`)

  const categoryIds = await ensureCategoryTree()
  const collectionIds = await ensureCollections()
  const { typeId, tags: tagIds } = await ensureTaxonomy()
  console.log(`  ${categoryIds.size} categories, ${collectionIds.size} collections, ${tagIds.size} tags, type '${PRODUCT_TYPE}'`)

  const { created, skipped } = await seedProducts(categoryIds, collectionIds, tagIds, typeId, channelId, locationId)
  console.log(`Done: ${created} products created, ${skipped} skipped.`)
}

main()
  .then(async () => {
    await pool.end()
    process.exit(0)
  })
  .catch(async (e) => {
    console.error(`\nSeed failed: ${e instanceof Error ? e.message : e}`)
    await pool.end().catch(() => undefined)
    process.exit(1)
  })