import pino from "pino";

console.log("pino type:", typeof pino);
console.log("pino keys:", Object.keys(pino));
if ((pino as any).default) {
  console.log("pino.default keys:", Object.keys((pino as any).default));
}
console.log("pino.stdTimeFunctions:", (pino as any).stdTimeFunctions);
