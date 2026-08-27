import { app } from "./api";
import { scheduled } from "./scheduled";
import type { AppBindings } from "./types";

export default {
  fetch(request: Request, env: AppBindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  scheduled,
};
