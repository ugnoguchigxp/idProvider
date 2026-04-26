import { serve } from "@hono/node-server";
import { createExampleBffApp, loadExampleBffConfig } from "./app.js";

const config = loadExampleBffConfig(process.env);
const port = Number(process.env.BFF_PORT ?? 5173);
const app = createExampleBffApp({ config });

serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(
    `example-bff started on http://localhost:${info.port}\n`,
  );
});
