const https = require("https");
https.get(
  "https://api.github.com/search/code?q=requestContext.get+repo:mastra-ai/mastra",
  {
    headers: {
      "User-Agent": "Node.js",
      Accept: "application/vnd.github.v3+json",
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => console.log(data));
  }
);
