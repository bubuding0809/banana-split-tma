import { generateOpenApiDocument } from "trpc-to-openapi";
import { appRouter } from "./root.js";

// Generate OpenAPI document
export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: "Banana Split TMA API",
  description: "REST API for Banana Split Telegram Mini App",
  version: "1.0.0",
  baseUrl: "http://localhost:8081/api/rest",
  tags: ["user", "chat"],
});
