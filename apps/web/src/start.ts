import { createStart } from "@tanstack/react-start";
import { sameOriginMiddleware } from "./server/auth";

export const startInstance = createStart(() => ({
  requestMiddleware: [sameOriginMiddleware],
}));
