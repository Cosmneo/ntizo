import { app } from "./api";
import type { AppBindings } from "./types";

export default {
  fetch(request: Request, env: AppBindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
};
