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
