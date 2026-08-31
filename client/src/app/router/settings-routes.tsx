import { Navigate, Route, Routes, useParams } from "react-router-dom"
import { getResource } from "@/entities/resources"
import { ProfilePage } from "@/pages/profile/profile-page"
import { ResourceListPage } from "@/pages/resource/resource-list-page"
import { ResourceDetailPage } from "@/pages/resource/resource-detail-page"

// NOTE: the settings sidebar lives in @/widgets/shell/settings-sidebar and is
// rendered by SettingsShell from @/widgets/shell/shell — this file only provides
// content routes, exactly like Lupus's settings route tree under SettingsLayout.
function SettingsResourceRoute() {
  const { slug = "" } = useParams<{ slug: string }>()
  const resource = getResource(slug)
  if (!resource) return <div>Unknown settings section: {slug}</div>
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 12 }}>
        Settings › {resource.label}
      </div>
      <ResourceListPage key={slug} />
    </div>
  )
}

export function SettingsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/settings/stores" replace />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path=":slug" element={<SettingsResourceRoute />} />
      <Route path=":slug/:id" element={<ResourceDetailPage />} />
    </Routes>
  )
}
