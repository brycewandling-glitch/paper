import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist (for SPA routing)
  // Only for non-asset paths - let static middleware handle assets
  app.use((req, res, next) => {
    // If this is a request for a static file (has file extension), let it 404
    if (req.path.includes('.') || req.path.startsWith('/assets/')) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
