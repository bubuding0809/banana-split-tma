const atob = (str) => Buffer.from(str, "base64").toString("utf8");
const raw = "eyJjaGF0X2lkIjotNTIxOTgxODY5NywiY2hhdF90eXBlIjoiZyJ9";
console.log(atob(raw));
