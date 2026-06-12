import "dotenv/config"
import { buildApp } from "./app"
import { registerExternalProviders } from "./modules/providers/external-providers"

registerExternalProviders()

const port = Number(process.env.PORT ?? 9001)
buildApp().listen(port, () => {
  console.log(`lupus-backend listening on :${port}`)
})
