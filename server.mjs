import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist");
http
  .createServer(async (req, res) => {
    try {
      const path = resolve(
        root,
        "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
      );
      if (path !== root && !path.startsWith(root + sep)) throw Error();
      const file = path === root ? resolve(root, "index.html") : path;
      const data = await readFile(file);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "text/javascript",
          ".svg": "image/svg+xml",
          ".json": "application/json",
          ".webmanifest": "application/manifest+json",
        }[extname(file)] || "application/octet-stream",
      );
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(4173, "127.0.0.1", () => console.log("Local: http://127.0.0.1:4173"));
