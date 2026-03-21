import { computeScores, recommendToday, forecast } from "../src/lib/engine";

console.log("Scores", computeScores());
console.log("Recommendation", recommendToday());
console.log("Forecast", forecast(7));
