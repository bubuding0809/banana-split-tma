import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { runWithRequestContext, getRequestId } from "./requestContext.js";
import type { Logger } from "./createLogger.js";

export function withRequestContext(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header("x-request-id");
    const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader("x-request-id", requestId);
    runWithRequestContext({ requestId }, () => next());
  };
}

export function withRequestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    const requestId = getRequestId();

    logger.info(
      { request_id: requestId, method: req.method, path: req.path },
      "req.start"
    );

    let logged = false;
    const emitEnd = () => {
      if (logged) return;
      logged = true;
      logger.info(
        {
          request_id: requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms: Date.now() - start,
          aborted: !res.writableEnded,
        },
        "req.end"
      );
    };
    res.on("finish", emitEnd);
    res.on("close", emitEnd);

    next();
  };
}
