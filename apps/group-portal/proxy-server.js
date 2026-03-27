// Dev-only CORS proxy for web testing (not used in native builds)
const http = require("http");
const https = require("https");

const PORT = 3999;
const TARGET = "https://purealphahotel.pl";

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const targetUrl = `${TARGET}${url.pathname}${url.search}`;

  const options = {
    method: req.method,
    headers: { ...req.headers, host: "purealphahotel.pl" },
  };
  delete options.headers["origin"];
  delete options.headers["referer"];

  const proxyReq = https.request(targetUrl, options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    res.writeHead(502);
    res.end(JSON.stringify({ status: "error", errorMessage: err.message }));
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => console.log(`CORS proxy on http://localhost:${PORT}`));
