import type { NextFunction, Request, Response } from "express"
import { apiKeyService } from "./api-keys.service"

export interface PublishableScope {
  id: string
  sales_channel_ids: string[]
}

/**
 * Store requests may carry `x-publishable-api-key`. A valid key is recorded as used and scopes the
 * request to its sales channels; an unknown or revoked key is refused. Requests without the header
 * are not scoped (the lupus storefront does not send one).
 */
export async function publishableKey(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers["x-publishable-api-key"]
  const token = Array.isArray(header) ? header[0] : header
  if (!token) {
    next()
    return
  }
  try {
    ;(req as Request & { publishable?: PublishableScope }).publishable = await apiKeyService.resolvePublishable(String(token))
    next()
  } catch (e) {
    next(e)
  }
}

export function publishableChannels(req: Request): string[] | undefined {
  const scope = (req as Request & { publishable?: PublishableScope }).publishable
  return scope && scope.sales_channel_ids.length > 0 ? scope.sales_channel_ids : undefined
}
