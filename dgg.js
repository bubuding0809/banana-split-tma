const https = require("https");

const q = encodeURIComponent(
  "site:mastra.ai requestContext OR execute OR context"
);
const options = {
  hostname: "html.duckduckgo.com",
  path: `/html/?q=${q}`,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  },
};

https
  .get(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      const links = [
        ...data.matchAll(/class="result__url" href="([^"]+)"/g),
      ].map((m) => m[1]);
      const snippets = [
        ...data.matchAll(/class="result__snippet[^>]*>(.*?)<\/a>/g),
      ].map((m) => m[1]);
      console.log("LINKS:", links);
      console.log("SNIPPETS:", snippets);
    });
  })
  .on("error", (err) => console.error(err));
