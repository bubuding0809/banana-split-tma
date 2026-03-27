const str = Buffer.from(
  JSON.stringify({ chat_id: -5219818697, chat_type: "g" }),
  "utf-8"
).toString("base64");
console.log(str);
