import { parseExpense } from "./parseExpense.js";

console.log(parseExpense("12.50 Lunch"));
console.log(parseExpense("Lunch 12.50"));
console.log(parseExpense("$12.50 Lunch"));
console.log(parseExpense("30000 JPY Japanese whiskey"));
console.log(parseExpense("200 beer 2024-12-26"));
console.log(parseExpense("15 SGD Lunch yesterday"));
console.log(parseExpense("500 dinner last saturday"));
console.log(parseExpense("200 beer, 2 days ago"));
