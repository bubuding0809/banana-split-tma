const username = "MyBot";
const regex = new RegExp(`@${username}\\b`, "i");

console.log(regex.test("@MyBot")); // true
console.log(regex.test("@MyBot hello")); // true
console.log(regex.test("hello @MyBot")); // true
console.log(regex.test("@MyBots")); // false

const payload = "@MyBot hello"
  .replace(new RegExp(`@${username}\\b`, "gi"), "")
  .trim();
console.log(payload); // "hello"
