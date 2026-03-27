const arg = "eyJjaGF0X2lkIjotNTIxOTgxODY5NywiY2hhdF90eXBlIjoiZyJ9";
const atob = (str) => Buffer.from(str, "base64").toString("utf8");
try {
  const parsed = JSON.parse(atob(arg));
  console.log(parsed);
} catch (e) {
  console.error(e);
}
