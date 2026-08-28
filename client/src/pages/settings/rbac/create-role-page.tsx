import { useNavigate } from "react-router-dom"
import { api } from "@/shared/api/client"
import { parseList } from "@/shared/api/list"
import { toOptionList } from "@/shared/formatting/text"
import { requiredText } from "@/widgets/form"
import type { SchemaFieldDef } from "@/widgets/form"
import { getResource } from "@/entities/resources"
import { EntityFormPage } from "@/pages/resource/entity-form-page"
import type { EntitySection } from "@/pages/resource/entity-form-page"

const ROLES_CREATE_PATH = getResource("rbac-roles")!.createPath!

const FIELDS: SchemaFieldDef[] = [
  {
    key: "name",
    label: "Name",
    type: "text",
    required: true,
    maxWidth: 320,
    validate: (v) => requiredText(`${v}`.trim(), "Name is required."),
  },
  {
    key: "policies",
    label: "Policies",
    type: "checklist",
    hint: "Attach existing policies now; more can be added later.",
    emptyHint: "No policies yet — create policies first",
    loadOptions: () =>
      api("/admin/rbac/policies?limit=100&offset=0")
        .then((d) =>
          toOptionList(
            parseList(d, 200).items,
            (p: any) => p.name ?? p.id,
          ),
        )
        .then((rows) =>
          rows.map((o) => ({ value: o.id, label: o.label, sub: o.sub })),
        ),
  },
]

const SECTIONS: EntitySection[] = [
  {
    title: "Create Role",
    subtitle: "Roles group policies; assign roles to users on their detail page.",
    fields: FIELDS,
  },
]

function buildBody(values: Record<string, any>): Record<string, any> {
  return { name: `${values.name}`.trim(), policies: values.policies }
}

export function CreateRolePage() {
  const navigate = useNavigate()

  return (
    <EntityFormPage
      title="Create Role"
      sections={SECTIONS}
      submitLabel="Create"
      closeTo="/settings/rbac-roles"
      modal
      path={ROLES_CREATE_PATH}
      buildBody={buildBody}
      onSaved={(res) => {
        navigate(`/r/rbac-roles/${res.role.id}`)
      }}
    />
  )
}
