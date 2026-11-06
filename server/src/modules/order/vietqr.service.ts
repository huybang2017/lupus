import { z } from "zod"

const { generateQR, findBank } = require("vietqr") as {
  generateQR: (input: {
    acqId: string
    accountNo: string
    accountName: string
    amount: number
    addInfo: string
    media?: "png" | "jpg" | "svg"
  }) => Promise<{
    code: string
    desc?: string
    data?: { qrCode?: string; qrDataURL?: string }
  }>
  findBank: (value: string) => { name?: string; shortName?: string; code?: string; bin?: string } | undefined
}

export const VIETQR_PROVIDER_ID = "pp_vietqr"

const vietQrConfigSchema = z.object({
  VIETQR_BANK_BIN: z.string().regex(/^\d{6}$/),
  VIETQR_ACCOUNT_NUMBER: z.string().regex(/^[A-Za-z0-9]{4,25}$/),
  VIETQR_ACCOUNT_NAME: z.string().min(5).max(50).regex(/^[A-Z ]+$/),
  VIETQR_TRANSFER_PREFIX: z.string().min(1).max(16).regex(/^[A-Z0-9]+$/),
  VIETQR_EXPIRES_MINUTES: z.coerce.number().int().positive().max(1440).default(15),
})

export type VietQrOrder = {
  id: string
  display_id: number
  total: number
  currency_code: string
  created_at: string | Date
  payment_status?: string | null
}

export type VietQrPaymentDetails = {
  provider_id: typeof VIETQR_PROVIDER_ID
  payment_status: string
  amount: number
  currency_code: string
  reference: string
  account_number: string
  account_name: string
  bank_bin: string
  bank_name: string
  qr_data_url: string
  expires_at: string
  is_expired: boolean
}

export function isVietQrConfigured(): boolean {
  return vietQrConfigSchema.safeParse(process.env).success
}

function getVietQrConfig() {
  const parsed = vietQrConfigSchema.safeParse(process.env)
  if (!parsed.success) {
    throw Object.assign(new Error("VietQR chưa được cấu hình đầy đủ trên máy chủ."), {
      statusCode: 503,
    })
  }
  return parsed.data
}

function createReference(prefix: string, displayId: number): string {
  const orderPart = String(displayId)
  const availablePrefixLength = Math.max(1, 23 - orderPart.length)
  return `${prefix.slice(0, availablePrefixLength)}${orderPart}`
}

export async function generateOrderVietQr(order: VietQrOrder): Promise<VietQrPaymentDetails> {
  const config = getVietQrConfig()
  const amount = Number(order.total)
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw Object.assign(new Error("Số tiền thanh toán VietQR không hợp lệ."), { statusCode: 400 })
  }
  if (String(order.currency_code).toLowerCase() !== "vnd") {
    throw Object.assign(new Error("VietQR demo chỉ hỗ trợ đơn hàng VND."), { statusCode: 400 })
  }

  const reference = createReference(config.VIETQR_TRANSFER_PREFIX, Number(order.display_id))
  const result = await generateQR({
    acqId: config.VIETQR_BANK_BIN,
    accountNo: config.VIETQR_ACCOUNT_NUMBER,
    accountName: config.VIETQR_ACCOUNT_NAME,
    amount,
    addInfo: reference,
    media: "png",
  })
  if (result.code !== "00" || !result.data?.qrDataURL) {
    throw Object.assign(new Error(result.desc || "Không thể tạo mã VietQR."), { statusCode: 502 })
  }

  const createdAt = new Date(order.created_at)
  const expiresAt = new Date(createdAt.getTime() + config.VIETQR_EXPIRES_MINUTES * 60_000)
  const bank = findBank(config.VIETQR_BANK_BIN)

  return {
    provider_id: VIETQR_PROVIDER_ID,
    payment_status: order.payment_status ?? "awaiting",
    amount,
    currency_code: String(order.currency_code).toLowerCase(),
    reference,
    account_number: config.VIETQR_ACCOUNT_NUMBER,
    account_name: config.VIETQR_ACCOUNT_NAME,
    bank_bin: config.VIETQR_BANK_BIN,
    bank_name: bank?.shortName || bank?.name || `Ngân hàng BIN ${config.VIETQR_BANK_BIN}`,
    qr_data_url: result.data.qrDataURL,
    expires_at: expiresAt.toISOString(),
    is_expired: Date.now() > expiresAt.getTime(),
  }
}

