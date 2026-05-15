const distDir = `${Deno.cwd()}/dist`;

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getContentType(path: string): string {
  const extension = path.match(/\.[^.\/]+$/)?.[0].toLowerCase();
  return extension ? contentTypes[extension] ?? "application/octet-stream" : "application/octet-stream";
}

function getFilePath(pathname: string): string | null {
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const normalizedPath = decodedPath.replace(/\\/g, "/");

  if (normalizedPath.includes("..")) {
    return null;
  }

  if (normalizedPath === "/") {
    return `${distDir}/index.html`;
  }

  return `${distDir}${normalizedPath}`;
}

async function serveFile(path: string): Promise<Response> {
  const body = await Deno.readFile(path);

  return new Response(body, {
    headers: {
      "content-type": getContentType(path),
    },
  });
}

async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { pathname } = new URL(request.url);
  const filePath = getFilePath(pathname);

  if (!filePath) {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const response = await serveFile(filePath);

    if (request.method === "HEAD") {
      return new Response(null, { headers: response.headers });
    }

    return response;
  } catch {
    const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;

    if (!acceptsHtml) {
      return new Response("Not Found", { status: 404 });
    }

    const response = await serveFile(`${distDir}/index.html`);

    if (request.method === "HEAD") {
      return new Response(null, { headers: response.headers });
    }

    return response;
  }
}

Deno.serve(handler);
