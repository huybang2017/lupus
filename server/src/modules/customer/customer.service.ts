import { pool } from "../../db"
import { CreateCustomerInput, CustomerDTO } from "./customer.types"

export interface UpdateCustomerInput {
  email?: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  phone?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CustomerAddressInput {
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  country_code?: string | null
  postal_code?: string | null
  phone?: string | null
  address_name?: string | null
  company?: string | null
  province?: string | null
  is_default_shipping?: boolean
  is_default_billing?: boolean
  metadata?: Record<string, unknown> | null
}

export interface CustomerGroupDTO {
  id: string
  name: string
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  customers?: CustomerDTO[]
}

export interface DetailedCustomerDTO extends CustomerDTO {
  groups: CustomerGroupDTO[]
  addresses: Record<string, unknown>[]
}

// Port of customer part of Lupus CustomerModuleService.
// Kept: unique (email, has_account) rule, soft-delete via deleted_at, address cascade.
// Dropped: groups pivot, event bus, MikroORM decorators.
export class CustomerService {
  async create(input: CreateCustomerInput): Promise<CustomerDTO> {
    const email = input.email.toLowerCase().trim()
    try {
      const { rows } = await pool.query(
        `INSERT INTO customer (email, first_name, last_name, company_name, phone, has_account)
         VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING *`,
        [email, input.first_name ?? null, input.last_name ?? null, input.company_name ?? null, input.phone ?? null]
      )
      return rows[0]
    } catch (err: any) {
      if (err?.code === "23505") {
        throw Object.assign(new Error(`Customer with email ${email} already exists`), { statusCode: 409 })
      }
      throw err
    }
  }

  async retrieve(id: string): Promise<CustomerDTO | null> {
    const { rows } = await pool.query(`SELECT * FROM customer WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows[0] ?? null
  }

  async retrieveByEmail(email: string): Promise<CustomerDTO | null> {
    const { rows } = await pool.query(
      `SELECT * FROM customer WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
      [email.toLowerCase().trim()]
    )
    return rows[0] ?? null
  }

  async list(limit = 50, offset = 0): Promise<CustomerDTO[]> {
    const { rows } = await pool.query(
      `SELECT * FROM customer WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [Math.min(limit, 100), offset]
    )
    return rows
  }

  async count(): Promise<number> {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM customer WHERE deleted_at IS NULL`)
    return rows[0].c as number
  }

  // Port of updateCustomersWorkflow selector update (admin/customers/[id] POST).
  async update(id: string, input: UpdateCustomerInput): Promise<CustomerDTO | null> {
    const sets: string[] = []
    const vals: unknown[] = []
    const push = (col: string, v: unknown) => {
      vals.push(v)
      sets.push(`${col}=$${vals.length}`)
    }
    if (input.email !== undefined) push("email", input.email.toLowerCase().trim())
    if (input.first_name !== undefined) push("first_name", input.first_name)
    if (input.last_name !== undefined) push("last_name", input.last_name)
    if (input.company_name !== undefined) push("company_name", input.company_name)
    if (input.phone !== undefined) push("phone", input.phone)
    if (input.metadata !== undefined) push("metadata", input.metadata ? JSON.stringify(input.metadata) : null)
    if (sets.length === 0) {
      return this.retrieve(id)
    }
    try {
      const { rows } = await pool.query(
        `UPDATE customer SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${vals.length + 1} AND deleted_at IS NULL RETURNING *`,
        [...vals, id]
      )
      return rows[0] ?? null
    } catch (err: any) {
      if (err?.code === "23505") {
        throw Object.assign(new Error(`Customer email is already in use`), { statusCode: 409 })
      }
      throw err
    }
  }

  // Port of removeCustomerAccountWorkflow (soft delete; addresses cascade via deleted flag).
  async softDelete(id: string): Promise<boolean> {
    const r = await pool.query(`UPDATE customer SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, [id])
    if ((r.rowCount ?? 0) === 0) {
      return false
    }
    await pool.query(`UPDATE customer_address SET deleted_at=NOW() WHERE customer_id=$1 AND deleted_at IS NULL`, [id])
    return true
  }

  async getGroups(customerId: string): Promise<CustomerGroupDTO[]> {
    const { rows } = await pool.query(
      `SELECT g.* FROM customer_group g JOIN customer_group_customer p ON p.customer_group_id=g.id
       WHERE p.customer_id=$1 AND g.deleted_at IS NULL ORDER BY g.created_at`,
      [customerId]
    )
    return rows
  }

  // Port of refetchCustomer default relations (groups + addresses).
  async retrieveDetailed(id: string): Promise<DetailedCustomerDTO | null> {
    const customer = await this.retrieve(id)
    if (!customer) {
      return null
    }
    const groups = await this.getGroups(id)
    const addresses = await this.listAddresses(id)
    return { ...customer, groups, addresses }
  }

  // Extra address columns in the Lupus DTO (address_name, company, province,
  // is_default_*) have no dedicated columns here; they round-trip via metadata.
  toAddressShape(row: any): Record<string, unknown> {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    return {
      ...row,
      address_name: meta.address_name ?? null,
      company: meta.company ?? null,
      province: meta.province ?? null,
      is_default_shipping: meta.is_default_shipping ?? false,
      is_default_billing: meta.is_default_billing ?? false,
    }
  }

  private splitAddressInput(input: CustomerAddressInput): { cols: Record<string, unknown>; metadata: Record<string, unknown> | null } {
    const { address_name, company, province, is_default_shipping, is_default_billing, metadata, ...rest } = input
    const merged: Record<string, unknown> = { ...(metadata ?? {}) }
    if (address_name !== undefined) merged.address_name = address_name
    if (company !== undefined) merged.company = company
    if (province !== undefined) merged.province = province
    if (is_default_shipping !== undefined) merged.is_default_shipping = is_default_shipping
    if (is_default_billing !== undefined) merged.is_default_billing = is_default_billing
    return { cols: rest, metadata: Object.keys(merged).length > 0 ? merged : null }
  }

  /** Only one default shipping / billing address per customer (Lupus clears the previous default). */
  private async clearOtherDefaults(customerId: string, keepId: string, input: CustomerAddressInput): Promise<void> {
    for (const key of ["is_default_shipping", "is_default_billing"] as const) {
      if (input[key] === true) {
        await pool.query(
          `UPDATE customer_address SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{${key}}', 'false'::jsonb)
           WHERE customer_id=$1 AND id<>$2 AND deleted_at IS NULL AND (metadata->>'${key}') = 'true'`,
          [customerId, keepId]
        )
      }
    }
  }

  async listAddresses(customerId: string): Promise<Record<string, unknown>[]> {
    const { rows } = await pool.query(
      `SELECT * FROM customer_address WHERE customer_id=$1 AND deleted_at IS NULL ORDER BY created_at`,
      [customerId]
    )
    return rows.map((r) => this.toAddressShape(r))
  }

  async retrieveAddress(customerId: string, addressId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await pool.query(
      `SELECT * FROM customer_address WHERE id=$1 AND customer_id=$2 AND deleted_at IS NULL`,
      [addressId, customerId]
    )
    return rows[0] ? this.toAddressShape(rows[0]) : null
  }

  async createAddress(customerId: string, input: CustomerAddressInput): Promise<Record<string, unknown>> {
    const customer = await this.retrieve(customerId)
    if (!customer) {
      throw Object.assign(new Error(`Customer with id: ${customerId} not found`), { statusCode: 404 })
    }
    const { cols, metadata } = this.splitAddressInput(input)
    const c = cols as Record<string, unknown>
    const { rows } = await pool.query(
      `INSERT INTO customer_address (customer_id, first_name, last_name, address_1, address_2, city, country_code, postal_code, phone, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        customerId,
        c.first_name ?? null,
        c.last_name ?? null,
        c.address_1 ?? null,
        c.address_2 ?? null,
        c.city ?? null,
        c.country_code ?? null,
        c.postal_code ?? null,
        c.phone ?? null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    )
    await this.clearOtherDefaults(customerId, rows[0].id, input)
    return this.toAddressShape(rows[0])
  }

  async updateAddress(customerId: string, addressId: string, input: CustomerAddressInput): Promise<Record<string, unknown> | null> {
    const existing = await pool.query(
      `SELECT * FROM customer_address WHERE id=$1 AND customer_id=$2 AND deleted_at IS NULL`,
      [addressId, customerId]
    )
    if (!existing.rows[0]) {
      return null
    }
    const { cols, metadata } = this.splitAddressInput(input)
    const currentMeta = (existing.rows[0].metadata ?? {}) as Record<string, unknown>
    const nextMeta = metadata ? { ...currentMeta, ...metadata } : currentMeta
    const sets: string[] = []
    const vals: unknown[] = []
    const push = (col: string, v: unknown) => {
      vals.push(v)
      sets.push(`${col}=$${vals.length}`)
    }
    for (const col of ["first_name", "last_name", "address_1", "address_2", "city", "country_code", "postal_code", "phone"]) {
      if ((cols as Record<string, unknown>)[col] !== undefined) {
        push(col, (cols as Record<string, unknown>)[col])
      }
    }
    if (metadata) {
      push("metadata", JSON.stringify(nextMeta))
    }
    if (sets.length === 0) {
      return this.toAddressShape(existing.rows[0])
    }
    const { rows } = await pool.query(
      `UPDATE customer_address SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${vals.length + 1} RETURNING *`,
      [...vals, addressId]
    )
    await this.clearOtherDefaults(customerId, addressId, input)
    return this.toAddressShape(rows[0])
  }

  async deleteAddress(customerId: string, addressId: string): Promise<boolean> {
    const r = await pool.query(
      `UPDATE customer_address SET deleted_at=NOW() WHERE id=$1 AND customer_id=$2 AND deleted_at IS NULL`,
      [addressId, customerId]
    )
    return (r.rowCount ?? 0) > 0
  }

  // Port of linkCustomerGroupsToCustomerWorkflow (admin/customers/[id]/customer-groups POST).
  async batchCustomerGroups(id: string, add?: string[], remove?: string[]): Promise<void> {
    const customer = await this.retrieve(id)
    if (!customer) {
      throw Object.assign(new Error(`Customer with id: ${id} not found`), { statusCode: 404 })
    }
    for (const gid of add ?? []) {
      const g = await pool.query(`SELECT id FROM customer_group WHERE id=$1 AND deleted_at IS NULL`, [gid])
      if (!g.rows[0]) {
        throw Object.assign(new Error(`Customer group with id: ${gid} not found`), { statusCode: 404 })
      }
      await pool.query(`INSERT INTO customer_group_customer (customer_group_id, customer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [gid, id])
    }
    for (const gid of remove ?? []) {
      await pool.query(`DELETE FROM customer_group_customer WHERE customer_group_id=$1 AND customer_id=$2`, [gid, id])
    }
  }
}

export const customerService = new CustomerService()
