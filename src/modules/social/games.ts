export const TRUTHS = ["What's the most embarrassing song you secretly love?", "What's a small thing that always makes you smile?", "What's the last thing you Googled?", "Who in this chat would you trust with a secret?", "What's your most irrational fear?", "What's the best compliment you ever got?"];
export const DARES = ["Send a selfie making your silliest face.", "Describe your day using only emojis.", "Do your best impression of a dolphin and send a voice note.", "Change your status to something ridiculous for an hour.", "Send the 5th photo in your camera roll (if you're comfortable).", "Write a two-line poem about this chat."];
export interface Trivia { q: string; options: string[]; answer: number }
export const TRIVIA: Trivia[] = [
  { q: "Which ocean is the largest?", options: ["Atlantic", "Pacific", "Indian", "Arctic"], answer: 1 },
  { q: "How many hearts does an octopus have?", options: ["1", "2", "3", "8"], answer: 2 },
  { q: "What do jellyfish lack?", options: ["Brain", "Skin", "Water", "Eyes"], answer: 0 },
  { q: "Which is the fastest marine mammal?", options: ["Blue whale", "Dolphin", "Orca", "Seal"], answer: 2 },
  { q: "What do sea turtles mostly eat as adults (green turtle)?", options: ["Seagrass & algae", "Fish", "Crabs", "Plankton"], answer: 0 },
  { q: "Axolotls can regrow…", options: ["Only tails", "Limbs and parts of organs", "Nothing", "Only skin"], answer: 1 },
];
export const pick = <T,>(xs: readonly T[], rnd = Math.random): T => xs[Math.floor(rnd() * xs.length)];
/** Is a trivia answer correct? Defensive against malformed meta. */
export const isCorrect = (meta: { answer?: unknown }, choice: number) => typeof meta.answer === "number" && meta.answer === choice;
