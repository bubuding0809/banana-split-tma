import { Bot } from "grammy";
const bot = new Bot("1234:dummy", { botInfo: { id: 1234, is_bot: true, first_name: "test", username: "test_bot" } });
import { EventEmitter } from "events";

const httpAdapter = (req, res) => {
    return {
        get update() {
            return new Promise((resolve, reject) => {
                const chunks = [];
                req.on("data", (chunk) => chunks.push(chunk))
                    .once("end", () => {
                        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); }
                        catch (err) { reject(err); }
                    })
                    .once("error", reject);
            });
        },
        header: undefined, end: () => {}, respond: () => {}, unauthorized: () => {}
    };
};

async function test() {
    const req = new EventEmitter();
    const res = {};
    const adapter = httpAdapter(req, res);
    
    // Simulate what happens internally in grammy
    try {
        const update = await adapter.update;
        await bot.handleUpdate(update);
    } catch (e) {
        console.error("CAUGHT:", e);
    }
}
test();
const req = new EventEmitter();
// Simulate no data and end
setTimeout(() => {
    req.emit("end");
}, 10);
